/**
 * Headless UI check — drives the running app in Chrome over the DevTools
 * Protocol (no extra npm dependencies: Node 22+ ships a global WebSocket).
 *
 *   node scripts/ui-check.js [route ...]
 *
 * For every route it:
 *   - signs in via the API and seeds localStorage (so the auth guard passes)
 *   - navigates, waits for the client render to settle
 *   - captures console errors / page exceptions
 *   - dumps the visible text and writes a screenshot to .ui-check/
 *
 * Exits non-zero if any route logged an error or failed to render.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { seedDemo, seedEmpty } = require("../../backend/scripts/seed-helper");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:5000";
const PORT = 9333;
const OUT_DIR = path.join(__dirname, "..", ".ui-check");

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/dashboard",
      "/dashboard/payments",
      "/dashboard/reports",
      "/dashboard/membership",
      "/dashboard/members",
      "/residences",
      "/residences/apartments",
    ];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ CDP client ------------------------------- */

let msgId = 0;
const pending = new Map();
const listeners = [];

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function onEvent(fn) {
  listeners.push(fn);
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
    else resolve(msg.result);
    return;
  }
  listeners.forEach((fn) => fn(msg));
}

/* --------------------------------- main --------------------------------- */

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APP },
    body: JSON.stringify({ email: "brenie", password: "brenie" }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  return body.token;
}

async function main() {
  // The app is seeded brand new; the check needs a known state.
  seedDemo();

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}. Set CHROME_PATH to override.`);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui-check-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,1100",
      "--disable-extensions",
      "--disable-background-networking",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  // Wait for the DevTools endpoint.
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) {
    chrome.kill();
    throw new Error("Chrome DevTools endpoint never came up");
  }
  console.log(`Chrome: ${version.Browser}`);

  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (ev) => handleMessage(ev.data));

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Log.enable");
  await send(ws, "Network.enable");

  let currentErrors = [];
  let currentConsole = [];
  let currentNetwork = [];

  onEvent((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      currentErrors.push(
        `exception: ${d.exception?.description || d.text || "unknown"}`
      );
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || [])
        .map((a) => a.description || a.value)
        .join(" ");
      currentConsole.push(`[${msg.params.type}] ${text}`);
      if (msg.params.type === "error") {
        currentErrors.push(`console.error: ${text}`);
      }
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry?.level === "error") {
      const e = msg.params.entry;
      // Ignore favicon / source-map noise.
      if (!/favicon/i.test(e.text || "") && !/favicon/i.test(e.url || "")) {
        currentErrors.push(`log: ${e.text} ${e.url || ""}`.trim());
      }
    }
    if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      if (/localhost:5000/.test(r.url)) {
        currentNetwork.push({ phase: "req", url: r.url, method: r.method });
      }
    }
    if (msg.method === "Network.responseReceived") {
      const r = msg.params.response;
      // 204 on an OPTIONS is just the CORS preflight — only surface real
      // failures and unexpected statuses.
      if (/localhost:5000/.test(r.url) && !(r.status === 204)) {
        currentNetwork.push({
          phase: "res",
          url: r.url,
          status: r.status,
          type: r.mimeType,
        });
      }
    }
    if (msg.method === "Network.loadingFailed") {
      currentNetwork.push({
        phase: "fail",
        url: msg.params.requestId,
        error: msg.params.errorText,
      });
    }
  });

  const evaluate = async (expression) => {
    const r = await send(ws, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text
      );
    }
    return r.result.value;
  };

  const navigate = async (url) => {
    const loaded = new Promise((resolve) => {
      const off = (msg) => {
        if (msg.method === "Page.loadEventFired") {
          listeners.splice(listeners.indexOf(off), 1);
          resolve();
        }
      };
      onEvent(off);
    });
    await send(ws, "Page.navigate", { url });
    await loaded;
  };

  // ---- sign in ----
  const token = await login();
  await navigate(`${APP}/login`);
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);

  const failures = [];

  for (const route of ROUTES) {
    currentErrors = [];
    currentConsole = [];
    currentNetwork = [];
    await navigate(APP + route);

    // Wait for the data to land rather than a fixed sleep: a Neon cold start
    // can push the first response several seconds out. The skeleton
    // placeholders are the reliable "still loading" signal (the `Live` chip
    // pulses too, so only count the skeleton <div>s), and the sidebar's
    // "PHP —" means its stats have not landed either. The text length is the
    // positive signal that the page body has actually rendered.
    let loaded = false;
    const deadline = Date.now() + 45000;
    while (!loaded && Date.now() < deadline) {
      await sleep(300);
      const probe = await evaluate(
        `(() => {
           const skeletons = document.querySelectorAll('div.animate-pulse').length;
           const text = document.body.innerText;
           const side = (document.querySelector('aside') || {}).innerText || '';
           return skeletons === 0 && text.length > 400 && !side.includes('PHP —');
         })()`
      );
      loaded = probe === true;
    }
    await sleep(500); // let the chart paint

    const text = await evaluate("document.body.innerText");
    const url = await evaluate("window.location.pathname");

    // A redirect back to /login means the auth guard kicked in.
    const redirected = url === "/login";

    // A page that never left its skeleton state is a silent failure.
    const stuck = /PHP —/.test(text) || !/₱/.test(text);

    const shot = await send(ws, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const file = path.join(
      OUT_DIR,
      `${route.replace(/\//g, "_") || "_root"}.png`
    );
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

    const ok = !redirected && currentErrors.length === 0 && text.trim().length > 40 && !stuck;
    if (!ok) failures.push({ route, redirected, errors: currentErrors.slice() });

    console.log(
      `${ok ? "PASS" : "FAIL"}  ${route.padEnd(26)} url=${url.padEnd(24)} chars=${String(
        text.trim().length
      ).padEnd(5)} errors=${currentErrors.length}${stuck ? " STUCK-LOADING" : ""}  -> ${path.basename(file)}`
    );
    currentNetwork
      .filter((n) => n.phase !== "res" || !/socket\.io/.test(n.url || ""))
      .forEach((n) => {
        console.log(
          `        net ${n.phase} ${n.status || n.method || ""} ${n.error || ""} ${n.url}`
        );
      });
    currentConsole
      .filter((c) => !/Download the React DevTools/i.test(c))
      .slice(0, 4)
      .forEach((c) => console.log(`        > ${c}`));
    if (currentErrors.length) {
      currentErrors.slice(0, 6).forEach((e) => console.log(`        ! ${e}`));
    }
    if (redirected) console.log("        ! redirected to /login");
    if (stuck) console.log("        ! still showing skeleton placeholders");
    if (text.trim().length <= 40) console.log("        ! page rendered almost no text");
  }

  // ---- dark mode pass: toggle the theme, reload every route, verify ----
  await evaluate(`localStorage.setItem('abbsey-theme', 'dark')`);
  for (const route of ROUTES) {
    currentErrors = [];
    currentConsole = [];
    currentNetwork = [];
    await navigate(APP + route);
    await sleep(1200); // let the theme class apply before the app hydrates
    await navigate(APP + route);

    let loaded = false;
    const deadline = Date.now() + 45000;
    while (!loaded && Date.now() < deadline) {
      await sleep(300);
      const probe = await evaluate(
        `(() => {
           const skeletons = document.querySelectorAll('div.animate-pulse').length;
           const text = document.body.innerText;
           const side = (document.querySelector('aside') || {}).innerText || '';
           return skeletons === 0 && text.length > 400 && !side.includes('PHP —');
         })()`
      );
      loaded = probe === true;
    }
    await sleep(400);

    const isDark = await evaluate(`document.documentElement.classList.contains('dark')`);
    const bodyBg = await evaluate(
      `getComputedStyle(document.body).backgroundColor`
    );
    const text = await evaluate("document.body.innerText");
    const shot = await send(ws, "Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = path.join(OUT_DIR, `dark${route.replace(/\//g, "_") || "_root"}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

    const ok = isDark && currentErrors.length === 0 && text.length > 40 && loaded;
    if (!ok) failures.push({ route, redirected: false, errors: currentErrors.slice() });
    console.log(
      `${ok ? "PASS" : "FAIL"}  dark ${route.padEnd(22)} chars=${String(text.trim().length).padEnd(5)} errors=${currentErrors.length} bg=${bodyBg}  -> ${path.basename(file)}`
    );
    currentErrors.slice(0, 4).forEach((e) => console.log(`        ! ${e}`));
  }
  await evaluate(`localStorage.setItem('abbsey-theme', 'light')`);

  // ---- the login page (needs the token cleared so it does not redirect) ----
  await evaluate(`localStorage.removeItem('token')`);
  for (const theme of ["light", "dark"]) {
    await evaluate(`localStorage.setItem('abbsey-theme', '${theme}')`);
    currentErrors = [];
    await navigate(`${APP}/login`);
    await sleep(1500);
    const isDark = await evaluate(`document.documentElement.classList.contains('dark')`);
    const text = await evaluate(`document.body.innerText`);
    const shot = await send(ws, "Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = path.join(OUT_DIR, `login-${theme}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    const expected = theme === "dark";
    const ok = isDark === expected && currentErrors.length === 0 && !/brenie/i.test(text);
    if (!ok) failures.push({ route: `/login (${theme})`, redirected: false, errors: currentErrors.slice() });
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${theme.padEnd(5)} /login            chars=${String(text.trim().length).padEnd(5)} errors=${currentErrors.length} dark=${isDark}  -> ${path.basename(file)}`
    );
    if (!/brenie/i.test(text)) {
      // nothing
    } else {
      console.log("        ! the demo credentials are still on the login page");
    }
  }
  await evaluate(`localStorage.setItem('abbsey-theme', 'light')`);

  // ---- dump the visible text of the two new pages for eyeballing ----
  for (const route of ["/residences", "/residences/apartments"]) {
    await navigate(APP + route);
    await sleep(2200);
    const text = await evaluate("document.body.innerText");
    console.log(`\n================ ${route} ================\n${text}`);
  }

  ws.close();
  chrome.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  // Put the app back to brand new.
  seedEmpty();

  if (failures.length) {
    console.log(`\n${failures.length} route(s) failed`);
    process.exit(1);
  }
  console.log(`\nUI CHECK PASSED (${ROUTES.length} routes)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
