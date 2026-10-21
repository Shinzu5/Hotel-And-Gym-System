/**
 * Interaction test — drives the Apartments page through the real UI in
 * headless Chrome (no npm dependencies) to prove every button works:
 *
 *   Add renter  -> modal opens, quick-term chips set the expiry, the live
 *                  "Total lease value" updates, Save books the unit
 *   Edit lease  -> modal opens pre-filled, changing the rent saves
 *   Record payment -> the rent is applied automatically when the lease is saved
 *   End         -> confirm modal, confirming frees the unit
 *
 *   node scripts/ui-interact.js
 *
 * The lease it creates is deleted again at the end, so the seeded demo data
 * is left exactly as it was.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { seedDemo, seedEmpty, fetchRetry } = require("../../backend/scripts/seed-helper");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:5000";
const PORT = 9335;
const OUT_DIR = path.join(__dirname, "..", ".ui-check");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let msgId = 0;
const pending = new Map();
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  // The app is seeded brand new; the test needs a known state.
  seedDemo();

  const token = (
    await (
      await fetchRetry(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP },
        body: JSON.stringify({ email: "brenie", password: "brenie" }),
      })
    ).json()
  ).token;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Clear away anything a previous interrupted run left behind, so the test
  // always starts from the seeded "Unit 2A is vacant" state.
  const wipeTestLeases = async () => {
    const units = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
    for (const u of units.units || []) {
      if (u.lease && u.lease.renterName === "Interaction Test") {
        await fetchRetry(`${API}/api/residences/leases/${u.lease.id}/end`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ endDate: "2026-10-05" }),
        });
        await fetchRetry(`${API}/api/residences/leases/${u.lease.id}`, { method: "DELETE", headers: H });
      }
    }
  };
  await wipeTestLeases();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ui-interact-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,1200",
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
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  };

  const navigate = async (url) => {
    const loaded = new Promise((resolve) => {
      const off = (msg) => {
        if (msg.method === "Page.loadEventFired") {
          resolve();
        }
      };
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === "Page.loadEventFired") off(m);
      });
    });
    await send(ws, "Page.navigate", { url });
    await loaded;
  };

  // Page-side helpers. Re-injected after every navigation, since a navigation
  // replaces the document and wipes them.
  const injectHelpers = async () => {
    await evaluate(`
      window.__t = {
        setVal(el, value) {
          if (!el) return false;
          const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
          return true;
        },
        card(code) { return [...document.querySelectorAll('.card')].find(c => c.textContent.includes(code)); },
        btn(root, text) { return root ? [...root.querySelectorAll('button')].find(b => b.textContent.trim().includes(text)) : null; },
        modal() { return document.querySelector('[role="dialog"]'); },
        click(el) { if (!el) return 'NOT_FOUND'; el.click(); return 'clicked'; },
      };
      true;
    `);
  };

  await navigate(`${APP}/login`);
  await sleep(1200);
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)})`);

  await navigate(`${APP}/residences/apartments`);
  await sleep(3500);
  await injectHelpers();

  // Poll until a condition holds instead of guessing at timings — a Neon
  // cold start can stretch a single request to several seconds.
  const waitFor = async (expression, timeout = 25000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const v = await evaluate(expression);
      if (v === true) return true;
      await sleep(300);
    }
    return false;
  };

  /** Wait until some text is on the page — a positive "the content rendered" signal. */
  const waitForText = async (text, timeout = 25000) => {
    const deadline = Date.now() + timeout;
    const needle = text.toLowerCase();
    while (Date.now() < deadline) {
      const v = await evaluate(
        `document.body.innerText.toLowerCase().includes(${JSON.stringify(needle)})`
      );
      if (v === true) return true;
      await sleep(300);
    }
    return false;
  };

  const before = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
  const room3 = before.units.find((u) => u.name === "Unit 2A");
  check("Unit 2A starts vacant", room3.status === "VACANT", room3.status);

  /* ---------------------------- 1. Add renter ---------------------------- */
  // The page has to finish rendering before its buttons can be clicked.
  await waitFor(
    `!![...document.querySelectorAll('button')].find(b => b.textContent.includes('Add renter'))`,
    30000
  );
  const opened = await evaluate(`
    window.__t.click(window.__t.btn(window.__t.card('ROOM 3'), 'Add renter'))
  `);
  await sleep(700);
  const modal = await evaluate(`(() => { const m = window.__t.modal(); return m ? m.getAttribute('aria-label') : null; })()`);
  check("Add renter opens the modal", opened === "clicked" && modal === "Add renter · Unit 2A", `title="${modal}"`);

  const body = await evaluate(`(() => { const m = window.__t.modal(); return m ? m.innerText : null; })()`);
  check(
    "modal shows the expected fields",
    /Renter name/.test(body) && /Contact/.test(body) && /Monthly rent/.test(body) && /Start date/.test(body) && /Expiration date/.test(body) && /Total lease value/.test(body),
    "renter/contact/rent/dates/total"
  );
  check("modal offers the quick-term chips", /3 months/.test(body) && /6 months/.test(body) && /12 months/.test(body) && /24 months/.test(body));

  // The rent field should be pre-filled with the unit's asking rent.
  const prefill = await evaluate(`document.getElementById('lease-rent') ? document.getElementById('lease-rent').value : null`);
  check("monthly rent is pre-filled from the unit", prefill === "18000", `value="${prefill}"`);

  // Fill the form.
  await evaluate(`
    window.__t.setVal(document.getElementById('lease-renter'), 'Interaction Test');
    window.__t.setVal(document.getElementById('lease-contact'), '0917 000 1111');
    window.__t.setVal(document.getElementById('lease-rent'), '18000');
    window.__t.setVal(document.getElementById('lease-start'), '2026-10-01');
    true;
  `);
  await sleep(300);

  // Click the "12 months" chip and confirm the expiry + total follow.
  const chip = await evaluate(`
    (() => {
      const m = window.__t.modal();
      if (!m) return 'NO_MODAL';
      const b = [...m.querySelectorAll('button')].find(x => x.textContent.trim() === '12 months');
      if (!b) return 'NOT_FOUND';
      b.click();
      return 'clicked';
    })()
  `);
  await sleep(400);
  const afterChip = await evaluate(`(() => ({
    end: document.getElementById('lease-end').value,
    total: window.__t.modal().innerText.match(/Total lease value\\s*([\\S]+)/)?.[1] || null,
  }))()`);
  check(
    "12-month chip sets the expiration and the total lease value",
    chip === "clicked" && afterChip.end === "2027-10-01" && afterChip.total === "₱216,000",
    `end=${afterChip.end} total=${afterChip.total}`
  );

  // Save the lease.
  await evaluate(`window.__t.click(window.__t.btn(window.__t.modal(), 'Save lease'))`);
  const booked = await waitFor(
    `(window.__t.card('ROOM 3') || {}).innerText?.includes('Interaction Test') === true`
  );

  const afterAdd = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
  const room3After = afterAdd.units.find((u) => u.name === "Unit 2A");
  check(
    "Save lease books the unit and it becomes occupied",
    room3After.status === "OCCUPIED" && room3After.lease && room3After.lease.renterName === "Interaction Test",
    `${room3After.status} ${room3After.lease ? room3After.lease.renterName : "no lease"}`
  );
  const leaseId = room3After.lease && room3After.lease.id;
  check("new lease appears in the UI card", booked === true);

  /* ---------------------------- 2. Edit lease ---------------------------- */
  const editClick = await evaluate(`
    (() => {
      const c = window.__t.card('ROOM 3');
      if (!c) return 'NO_CARD';
      const b = [...c.querySelectorAll('button')].find(x => x.textContent.trim().includes('Edit lease'));
      if (!b) return 'NO_EDIT_BUTTON:' + [...c.querySelectorAll('button')].map(x => x.textContent.trim()).join('|');
      b.click();
      return 'clicked';
    })()
  `);
  await sleep(1500);
  const editTitle = await evaluate(`(() => { const m = window.__t.modal(); return m ? m.getAttribute('aria-label') : null; })()`);
  const editPre = await evaluate(`(() => ({
    name: document.getElementById('lease-renter')?.value,
    rent: document.getElementById('lease-rent')?.value,
  }))()`);
  check(
    "Edit lease opens pre-filled with the current lease",
    editTitle === "Edit lease · Unit 2A" && editPre.name === "Interaction Test" && editPre.rent === "18000",
    `click=${editClick} title="${editTitle}" name=${editPre.name} rent=${editPre.rent}`
  );

  await evaluate(`window.__t.setVal(document.getElementById('lease-rent'), '19500'); true;`);
  await sleep(300);
  const editSave = await evaluate(`window.__t.click(window.__t.btn(window.__t.modal(), 'Save lease'))`);
  // The edit modal must close itself once the lease is saved — if it lingers
  // it would sit on top of the next modal.
  const closed = await waitFor(`window.__t.modal() === null`);
  const stillOpen = await evaluate(
    `(() => { const m = window.__t.modal(); return m ? { label: m.getAttribute('aria-label'), text: m.innerText.slice(0, 300) } : null; })()`
  );
  check("the edit modal closes after saving", closed && stillOpen === null, `click=${editSave} stillOpen=${JSON.stringify(stillOpen)}`);
  const afterEdit = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
  const room3Edited = afterEdit.units.find((u) => u.name === "Unit 2A");
  check(
    "Edit lease saves the new rent",
    room3Edited.lease && Number(room3Edited.lease.monthlyRent) === 19500,
    `rent=${room3Edited.lease && room3Edited.lease.monthlyRent}`
  );

  /* --------------------- 3. Automatic rent, no manual payment --------------- */
  // The rent is applied automatically when the lease is saved, and the card no
  // longer carries a constant "Monthly rent" row or a "+ Record payment" button.
  // (The card's labels are uppercased by CSS, so compare case-insensitively.)
  const cardText = ((await evaluate(`(window.__t.card('ROOM 3') || {}).innerText || ''`)) || "").toLowerCase();
  check(
    "the apartment card has no '+ Record payment' button",
    !cardText.includes("record payment"),
    cardText.replace(/\n+/g, " | ").slice(0, 90)
  );
  check(
    "the apartment card has no constant monthly rent row",
    !cardText.includes("monthly rent"),
    cardText.replace(/\n+/g, " | ").slice(0, 90)
  );
  check(
    "the apartment card shows the total paid instead",
    cardText.includes("total paid"),
    cardText.replace(/\n+/g, " | ").slice(0, 90)
  );

  // The lease runs Oct 2026 -> Oct 2027 (12 months) at 19,500/month, so the
  // automatic payment is 234,000.
  const autoRent = 19500 * 12;
  const afterEdit2 = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
  const room3Paid = afterEdit2.units.find((u) => u.name === "Unit 2A");
  check(
    "the rent is applied automatically when the lease is saved",
    room3Paid.lease && Number(room3Paid.totalEarned) >= autoRent,
    `unit total ${room3Paid.totalEarned} (automatic rent ${autoRent})`
  );

  /* ------------------------------ 4. End lease --------------------------- */
  await evaluate(`window.__t.click(window.__t.btn(window.__t.card('ROOM 3'), 'End'))`);
  await sleep(700);
  const endTitle = await evaluate(`(() => { const m = window.__t.modal(); return m ? m.getAttribute('aria-label') : null; })()`);
  const endBody = await evaluate(`(() => { const m = window.__t.modal(); return m ? m.innerText : null; })()`);
  check("End opens a confirm modal", endTitle === "End this lease?", `title="${endTitle}"`);
  check("confirm modal explains the consequence", /Interaction Test/.test(endBody) && /vacant/i.test(endBody));

  await evaluate(`window.__t.click(window.__t.btn(window.__t.modal(), 'End lease'))`);
  const vacantOk = await waitFor(
    `(window.__t.card('ROOM 3') || {}).innerText?.includes('No renter yet') === true`
  );
  await sleep(600);
  const afterEnd = await (await fetchRetry(`${API}/api/residences/units`, { headers: H })).json();
  const room3Ended = afterEnd.units.find((u) => u.name === "Unit 2A");
  check("End lease frees the unit", room3Ended.status === "VACANT", room3Ended.status);
  check("unit card shows the vacant state again", vacantOk === true);

  /* ------------------------- 5. Membership dates + tag ------------------- */
  await navigate(`${APP}/dashboard/membership`);
  await waitForText("Add Membership");
  await waitFor(`document.getElementById('mem-plan')?.options.length > 2`);
  await injectHelpers();

  // The 30-day plan must expire on the same day next month.
  const planPreview = await evaluate(`(() => {
    const select = document.getElementById('mem-plan');
    if (!select) return { error: 'no plan select' };
    const option = [...select.options].find(o => o.textContent.includes('30 days'));
    if (!option) return { error: 'no 30 days plan' };
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  await sleep(700);
  const expirationShown = await evaluate(
    `document.querySelector('[data-testid="membership-expiration"]')?.textContent?.trim() || null`
  );
  const expectedExpiry = await evaluate(`(() => {
    const start = document.getElementById('mem-start')?.value;
    if (!start) return null;
    const [y, m, d] = start.split('-').map(Number);
    // A month-length term (30 days) expires on the same day next month.
    const out = new Date(y, m, d);
    return out.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })()`);
  check(
    "30-day plan previews the expiration as the same day next month",
    planPreview.ok && expirationShown === expectedExpiry,
    `preview="${expirationShown}" expected="${expectedExpiry}"`
  );

  // The 15-day plan must expire on its LAST usable day (start + 14).
  await evaluate(`(() => {
    const select = document.getElementById('mem-plan');
    const option = [...select.options].find(o => o.textContent.includes('15 days'));
    if (!option) return 'NO_PLAN';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(700);
  const shortShown = await evaluate(
    `document.querySelector('[data-testid="membership-expiration"]')?.textContent?.trim() || null`
  );
  const shortExpected = await evaluate(`(() => {
    const start = document.getElementById('mem-start')?.value;
    if (!start) return null;
    const [y, m, d] = start.split('-').map(Number);
    const out = new Date(y, m - 1, d + 14);
    return out.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })()`);
  check(
    "15-day plan previews the expiration as its last usable day (start + 14)",
    shortShown === shortExpected,
    `preview="${shortShown}" expected="${shortExpected}"`
  );

  // The "Member" tag sits on every registered member's name.
  const memberTags = await evaluate(
    `document.querySelectorAll('.pill').length && [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Member').length`
  );
  check("registered members are tagged 'Member'", memberTags > 0, `${memberTags} tag(s)`);

  // Typing an existing name warns that they are already registered.
  await evaluate(`(() => {
    const el = document.getElementById('mem-name');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'Rafael Bucosta');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(600);
  const dupWarning = await evaluate(`document.body.innerText.includes('Already registered')`);
  check("a duplicate name warns that the member is already registered", dupWarning === true);

  /* ------------------------- 6. Close sales -> Reports -------------------- */
  await navigate(`${APP}/dashboard/payments`);
  await waitForText("Payment receipt history");
  await injectHelpers();

  /* ------------------------- 6a. Search + date filters ------------------- */
  const searched = await evaluate(`(() => {
    const el = document.querySelector('input[type="search"]');
    if (!el) return 'NO_SEARCH';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'Rafael');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()`);
  await sleep(400);
  const searchHit = await waitFor(
    `document.body.innerText.includes('Rafael Bucosta') && !document.body.innerText.includes('Janine Dela Cruz')`,
    20000
  );
  const searchText = await evaluate(`document.body.innerText`);
  check(
    "the search box narrows the receipt history to the customer",
    searched === "typed" && searchHit === true,
    `hits: ${(searchText.match(/Rafael Bucosta/g) || []).length}`
  );

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clear');
    if (!btn) return 'NO_CLEAR';
    btn.click();
    return 'cleared';
  })()`);
  const clearedOk = await waitFor(`document.body.innerText.includes('Janine Dela Cruz')`, 20000);
  check("Clear resets the filters", clearedOk === true);

  const dated = await evaluate(`(() => {
    const el = document.getElementById('receipt-picker');
    if (!el) return 'NO_PICKER';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, el.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  check("the date picker is available on the receipt history", dated === "ok");

  /* ------------------------- 6b. Close the day --------------------------- */
  await evaluate(`window.__t.click(window.__t.btn(document.body, 'Close Daily Sales'))`);
  // The modal fetches the open figures — wait for them to land.
  await waitFor(`(window.__t.modal()?.innerText || '').includes('₱')`, 20000);
  const closeModalText = await evaluate(`window.__t.modal()?.innerText || ''`);
  check(
    "the close modal shows the OPEN figures",
    closeModalText.includes("₱1,950.00") && /open transactions/i.test(closeModalText),
    JSON.stringify(closeModalText.replace(/\n+/g, " | ")).slice(0, 120)
  );

  await evaluate(`(() => {
    const m = window.__t.modal();
    const buttons = [...m.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Close Daily Sales');
    buttons[buttons.length - 1].click();
    return 'clicked';
  })()`);
  const closedModal = await waitFor(`window.__t.modal() === null`);
  const resetOk = await waitFor(
    `(() => { const t = document.body.innerText; return t.includes('₱0.00'); })()`
  );
  check("closing the day resets the open figures to zero", closedModal && resetOk === true);
  const bannerOk = await waitFor(`document.body.innerText.includes('closed and archived')`);
  check("a banner confirms the receipts moved to Reports", bannerOk === true);
  const linkOk = await evaluate(
    `!![...document.querySelectorAll('a')].find(a => a.textContent.includes('View in Reports'))`
  );
  check("the banner links to Reports", linkOk === true);

  // The Reports tab lists the closed day and its receipts.
  await navigate(`${APP}/dashboard/reports`);
  // Wait for the report rows themselves (buttons with aria-expanded).
  await waitFor(`document.querySelectorAll('[data-testid="report-row"]').length > 0`);
  await injectHelpers();
  const reportsText = await evaluate(`document.body.innerText`);
  check(
    "Reports lists the closed day",
    /Today/.test(reportsText) && reportsText.includes("1,950.00"),
    reportsText.split("\\n").slice(0, 6).join(" | ")
  );
  const expanded = await evaluate(`(() => {
    const btn = document.querySelector('[data-testid="report-row"]');
    if (!btn) return 'NO_ROW';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1500);
  // The receipts are fetched when a day is expanded.
  await waitForText("670.00", 15000);
  const receiptsText = await evaluate(`document.body.innerText`);
  check(
    "expanding a closed day shows its receipts",
    expanded === "clicked" && receiptsText.includes("Walk-in") && receiptsText.includes("670.00"),
    expanded
  );
  const reportTags = await evaluate(
    `[...document.querySelectorAll('span')].filter(s => s.textContent.trim() === 'Member').length`
  );
  check("archived member receipts carry the Member tag", reportTags > 0, `${reportTags} tag(s)`);

  /* ------------------------- 6c. Reports search --------------------------- */
  await evaluate(`(() => {
    const el = document.querySelector('input[type="search"]');
    if (!el) return 'NO_SEARCH';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '30 days');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()`);
  await sleep(500);
  const rowsReady = await waitFor(
    `document.querySelectorAll('[data-testid="report-hits"] tbody tr').length > 0`,
    20000
  );
  const hitsText = await evaluate(`document.body.innerText`);
  check(
    "the Reports search lists the matching archived receipts",
    rowsReady === true && /archived receipt/i.test(hitsText),
    hitsText.split("\n").filter(Boolean).slice(0, 3).join(" | ")
  );
  const hitRows = await evaluate(
    `document.querySelectorAll('[data-testid="report-hits"] tbody tr').length`
  );
  check("matching receipts are listed in a table", hitRows > 0, `${hitRows} row(s)`);

  /* ------------------------- 6d. Login + theme ---------------------------- */
  // Sign out first — /login redirects straight to the dashboard when a token
  // is present. Start from a known-light theme so the toggle is deterministic.
  await evaluate(`localStorage.removeItem('token'); localStorage.setItem('abbsey-theme', 'light')`);
  await navigate(`${APP}/login`);
  await waitForText("Sign in", 20000);
  const loginText = await evaluate(`document.body.innerText`);
  check(
    "the login page no longer shows the demo credentials",
    !/brenie/i.test(loginText) && !/demo account/i.test(loginText),
    loginText.replace(/\n+/g, " | ").slice(0, 100)
  );

  const themeToggled = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /night|light|switch theme/i.test(b.getAttribute('aria-label') || ''));
    if (!btn) return 'NO_TOGGLE:' + [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).join('|');
    btn.click();
    return 'clicked:' + btn.getAttribute('aria-label');
  })()`);
  const darkNow = await waitFor(`document.documentElement.classList.contains('dark') === true`, 10000);
  const storedTheme = await evaluate(`localStorage.getItem('abbsey-theme')`);
  check(
    "the login page has a working night-mode toggle",
    darkNow === true,
    `${themeToggled} -> stored=${storedTheme}`
  );

  // Sign back in for the remaining checks.
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.setItem('abbsey-theme', 'light')`);

  /* ------------------------- 7. Business switching ----------------------- */
  await navigate(`${APP}/dashboard`);
  await sleep(3000);
  await injectHelpers();
  const gymBrand = await evaluate(`document.querySelector('aside')?.innerText || ''`);
  check("gym side shows the Fitness Gym brand", gymBrand.includes("Fitness Gym"), gymBrand.split("\n")[0]);

  await evaluate(`window.__t.click(window.__t.btn(document.querySelector('aside'), 'Apartments'))`);
  await waitFor(`window.location.pathname === '/residences'`);
  await injectHelpers();
  // The sidebar's unit count comes from the residences stats — wait for it.
  const countReady = await waitFor(
    `/\\d+ apartments live/.test((document.querySelector('aside') || {}).innerText || '')`
  );
  const resPath = await evaluate("window.location.pathname");
  const resBrand = await evaluate(`document.querySelector('aside')?.innerText || ''`);
  check("switching to Apartments navigates to /residences", resPath === "/residences", resPath);
  check("apartments side shows the Apartments brand", resBrand.includes("Apartments"), resBrand.split("\n")[0]);
  check("apartments sidebar shows the live unit count", /\d+ apartments live/.test(resBrand), (resBrand.match(/\d+ apartments live/) || [])[0]);

  await evaluate(`window.__t.click(window.__t.btn(document.querySelector('aside'), 'Fitness Gym'))`);
  await waitFor(`window.location.pathname === '/dashboard'`);
  await injectHelpers();
  check("switching back to Fitness Gym navigates to /dashboard", (await evaluate("window.location.pathname")) === "/dashboard");

  /* ------------------------------ 8. Cleanup ----------------------------- */
  if (leaseId) {
    const del = await fetchRetry(`${API}/api/residences/leases/${leaseId}`, { method: "DELETE", headers: H });
    check("test lease cleaned up", del.status === 200 || del.status === 400, `status ${del.status}`);
  }

  // The close-sales test closed today's sales for real — re-seed the demo data
  // so it is exactly as it was.
  seedDemo();

  const final = await (await fetchRetry(`${API}/api/residences/stats`, { headers: H })).json();
  check(
    "seeded data restored",
    Number(final.summary.totalEarned) === 641643.25 &&
      final.summary.occupied === 2 &&
      final.summary.vacantUnits === 2 &&
      Number(final.summary.monthlyRentRoll) === 30500,
    `earned=${final.summary.totalEarned} occupied=${final.summary.occupied}`
  );

  // And leave the app brand new.
  seedEmpty();
  const brandNew = await (await fetchRetry(`${API}/api/dashboard/stats`, { headers: H })).json();
  const brandNewResidences = await (await fetchRetry(`${API}/api/residences/stats`, { headers: H })).json();
  check(
    "app left brand new",
    brandNew.todaySales === 0 &&
      brandNew.activeMembers === 0 &&
      brandNew.activePlans === 2 &&
      Number(brandNewResidences.summary.totalEarned) === 0 &&
      brandNewResidences.summary.occupied === 0 &&
      brandNewResidences.units.length === 4,
    `sales ${brandNew.todaySales}, members ${brandNew.activeMembers}, residences earned ${brandNewResidences.summary.totalEarned}`
  );

  ws.close();
  chrome.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:");
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
    process.exit(1);
  }
  console.log("INTERACTION TEST PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
