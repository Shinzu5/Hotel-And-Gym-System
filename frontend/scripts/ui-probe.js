/**
 * Diagnostic: compare how the API responds to a browser-style fetch versus a
 * plain fetch, and show the exact status/headers/body for each.
 *
 *   node scripts/ui-probe.js
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000";
const API = "http://localhost:5000";
const PORT = 9334;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let msgId = 0;
const pending = new Map();

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const token = (
    await (
      await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP },
        body: JSON.stringify({ email: "brenie", password: "brenie" }),
      })
    ).json()
  ).token;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui-probe-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await sleep(250);
    }
  }

  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  const evaluate = async (expression) => {
    const r = await send(ws, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      return { threw: r.exceptionDetails.exception?.description };
    }
    return r.result.value;
  };

  // land on the app origin so localStorage + CORS behave like the real app
  await send(ws, "Page.navigate", { url: `${APP}/login` });
  await sleep(1500);
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);

  const probe = `
    (async () => {
      const tok = localStorage.getItem('token');
      const out = {};
      const run = async (label, url, headers) => {
        const started = performance.now();
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(url, { headers, signal: ctrl.signal });
          clearTimeout(timer);
          const body = await r.text();
          out[label] = {
            status: r.status,
            ok: r.ok,
            type: r.type,
            ms: Math.round(performance.now() - started),
            contentType: r.headers.get('content-type'),
            allowOrigin: r.headers.get('access-control-allow-origin'),
            bodyLen: body.length,
            bodyHead: body.slice(0, 120),
          };
        } catch (e) {
          out[label] = { error: String(e && e.message || e), ms: Math.round(performance.now() - started) };
        }
      };
      await run('withContentType', '${API}/api/dashboard/stats', {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + tok });
      await run('noContentType', '${API}/api/dashboard/stats', {
        Authorization: 'Bearer ' + tok });
      await run('residences', '${API}/api/residences/stats', {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + tok });
      return out;
    })()
  `;

  const browserResult = await evaluate(probe);
  console.log("=== FROM THE BROWSER ===");
  console.log(JSON.stringify(browserResult, null, 2));

  // Same requests from Node for comparison
  console.log("\n=== FROM NODE ===");
  for (const [label, headers] of [
    ["withContentType", { "Content-Type": "application/json" }],
    ["noContentType", {}],
  ]) {
    const r = await fetch(`${API}/api/dashboard/stats`, {
      headers: { ...headers, Authorization: `Bearer ${token}` },
    });
    const body = await r.text();
    console.log(
      `${label}: status=${r.status} type=${r.headers.get("content-type")} bodyLen=${body.length} head=${JSON.stringify(body.slice(0, 80))}`
    );
  }

  ws.close();
  chrome.kill();
  // Chrome may still hold the profile folder on Windows — best effort.
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* leave it to the OS temp cleaner */
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
