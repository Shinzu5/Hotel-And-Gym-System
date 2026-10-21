# Abbsey Admin — Hotel & Gym Business

Full-stack admin panel for two businesses in one app: **Fitness Gym** (gym) and
**Apartments** (rentals). One sidebar, one design system, one login —
switch between the two businesses with the pill in the sidebar.

| Folder | Stack | Port |
| --- | --- | --- |
| `backend/` | Express 4 + Prisma 5 + PostgreSQL (Neon) + JWT + **Socket.IO** | 5000 |
| `frontend/` | Next.js 14 (App Router) + Tailwind + Recharts + **socket.io-client** | 3000 |

## Demo account

Sign in at **http://localhost:3000/login**

- Email: `brenie` (or `brenie@abbsey.ph`)
- Password: `brenie`

The credentials are deliberately **not printed on the login page** — a visitor cannot read
them off the screen. They live here (and in the seed) instead.

## Run it

Open two terminals.

**1) Backend**

```bash
cd backend
npm install
npx prisma migrate dev     # applies migrations to Neon
npm run seed               # brand new: admin + 2 plans + 4 apartments
# npm run seed:demo        # ...or the full demo data
npm run dev                # http://localhost:5000
```

**2) Frontend**

```bash
cd frontend
npm install
npm run dev                # http://localhost:3000
```

`frontend/app/page.js` redirects to `/dashboard` when a token exists, otherwise `/login`.

## Screens

### Fitness Gym

- **`/login`** — green gradient brand panel + sign-in card; routes straight to the dashboard.
- **`/dashboard`** — greeting, 5 KPI cards, monthly revenue area chart (`+12.4% vs September`), expiring-soon list, recent payments (with item/service). All live.
- **`/dashboard/payments`** — red **Close Daily Sales**, `Today's Close (Open)` / `Open Transactions` KPIs, **Submit Payment** form (customer, amount, item/service, **date picker**, notes), and **Payment receipt history** with a **search box**, a **date picker** and a date dropdown. Only **open** receipts are listed — the closed ones live in Reports.
- **`/dashboard/reports`** — *Reports*: every closed day with the receipts that made it up. KPI cards (total closed sales, days closed, transactions closed, average/day), a **search box** that lists the matching archived receipts (with the day they were closed in — click one to jump to that day), and a **date picker** that narrows to one day.
- **`/dashboard/membership`** — **Add Membership** form with a live computed **Expiration** preview, plus the registered-memberships table (days remaining, status pill, delete). Two plan tiers only: **15 days (₱200)** and **30 days (₱350)**.
- **`/dashboard/members`** — filter tabs (`All / Active / Expiring soon / Expired` with counts), debounced search, phone numbers, **live per-second time remaining** (`24d 9h 17m 41s`), and a **Renew** modal that adds days on top of any remaining time and records a payment.

### The "Member" tag

Every registered member's name carries a green **Member** tag, applied automatically from the
data — there is nothing to type and nothing to maintain. It appears on the receipt history, the
dashboard's recent payments, the members list, the membership table and the archived receipts
in Reports, so a walk-in sale is instantly distinguishable from a member's.

While you type a name in **Add Membership** the page checks the member list it already has
loaded (no extra request) and warns you if that person is already registered, with their plan
and days remaining. It is a warning, not a block — you can still add a membership for a family
member with the same name.

### Apartments

- **`/residences`** — *Apartments overview*: total earned from rentals (₱641,643.25) with a **January → December rental income bar chart**, occupancy (50% — 2 of 4 units), monthly rent roll (₱30,500), earned this month (₱18,860), vacant units, **Earnings by apartment** bars (all-time, including past renters) and **Upcoming lease expirations**.
- **`/residences/apartments`** — one card per room (`ROOM 1`…`ROOM 4` → `Unit 1A`…`Unit 2B`) showing the renter, contact, start/expiration dates, days still on lease, a progress bar, monthly rent, total paid and the lease actions.

  | Button | What it does |
  | --- | --- |
  | **+ Add renter** | Opens *Add renter · Unit 2A*: name, contact, monthly rent (pre-filled), start + expiration dates, 3/6/12/24-month quick picks and a live **Total lease value** (₱216,000 for 12 months at ₱18,000). Saving books the unit **and applies the rent automatically** — the money lands in the unit's Total paid straight away. |
  | **Edit lease** | Same modal, pre-filled with the current lease; saving updates renter, contact, rent or dates in place, and the applied rent is regenerated to match. |
  | **End** | Asks for confirmation, then ends the lease and frees the unit. Rent history stays on the record. |

**Rent is automatic.** There is no "record payment" button — saving a lease applies the
rent for the whole term (the same figure as the modal's *Total lease value*), dated on the
lease's start date, and editing the lease regenerates it. So the money always tracks the
lease, exactly the way the days do. The apartment cards show only what was actually
collected — **Total paid** (occupied) or **Total earned** (vacant) — with no constant
asking-rent row.

The **Fitness Gym ⇄ Apartments** pill in the sidebar switches businesses. The active side is derived
from the URL, so the brand, nav and title can never drift out of sync with the page.

## Date rules

One convention drives every date in the app (`backend/src/lib/dates.js`, mirrored in
`frontend/lib/format.js`). A membership or lease lasts a **term**, and there are two kinds:

| Term | Expiration | Days left on the enrolment day | Expired from |
| --- | --- | --- | --- |
| **Month-length** (28–31 days, or N months) | the same day-of-month, one month later — 30 days from Oct 20 → **Nov 20** | **30** (the days that remain) | the expiration date |
| **Fixed-day** (anything shorter) | its **last usable day** — 15 days from Oct 21 → **Nov 4** | **15** (counting the enrolment day) | the day after the expiration date |

So the two membership tiers behave as you would expect: *15 days* is a fortnight and a
half from the day they enrol, *30 days* is a month to the same date. A lease of 30 days
keeps the same shape — Oct 20 → Nov 20, 30 days left.

Every calculation works on whole local calendar days. Comparing raw timestamps instead
made the answer depend on the time of day (a 5pm check said "31 days left" for a lease
that ends Nov 20).

A membership is flagged as **Expiring** with **5 days or fewer** left, and the dashboard's
"Expiring soon" list and KPI count the same window. It becomes **Expired** only once it
is past its last usable day. A **lease** follows the very same rule: the amber "Expiring soon"
pill appears on the apartment card and in *Upcoming lease expirations* only when the lease
has 5 days or fewer left — a lease that is weeks away stays green ("Occupied").

Renewals stay coherent: renewing by N days raises the days-left by exactly N. A live
membership gains the days on top of what is left; an expired one restarts from tomorrow.

## Closing the day's sales

**Close Daily Sales** moves today's open receipts into a dated `DailyReport`. The receipts
leave the Payments list and appear in **Reports**, under that day.

The open figures **reset to zero** the moment the day is closed — the KPI cards, the close
modal and `GET /payments/summary` all report the *open* amount, so the modal shows ₱0.00 and
disables its button instead of letting you close the same day twice.



## Light & night mode

Every screen has a light and a night theme. The toggle sits in the top bar immediately
left of the **Admin** chip (so it is on both the Fitness Gym and the Apartments sides), and there is
one on the login card too.

The whole palette resolves through CSS variables (`app/globals.css`), so the theme is a
single `dark` class on `<html>` — every component, including the `@apply` rules in the
component layer, follows it. A small inline script in the root layout applies the class
**before the first paint**, so a dark-theme reload never flashes white.

- First visit follows the operating system preference; once you pick a theme it is
  remembered in `localStorage`.
- One extra token, `on-accent`, covers text and icons sitting on saturated surfaces
  (buttons, badges) so they stay white while the surfaces go dark.

## Finding things fast

| Where | Search | Date |
| --- | --- | --- |
| Payments → receipt history | customer, phone, item/service, plan, notes, or an exact amount | a date picker + a dropdown of every day with open receipts |
| Reports | the archived receipts themselves — the hits show the day each was closed in, and clicking one jumps to that day | a date picker that narrows to one closed day |

Both searches run on the server (debounced 300ms, the same pattern the Members tab uses), so
they reach records beyond the first page. The Payments dropdown's options come from the API
and are independent of the search, so it never collapses to a single day while you type.

## Realtime

Socket.IO is attached to the same Express server (`backend/src/realtime.js`).

| Direction | Event | Payload |
| --- | --- | --- |
| server → client | `stats:update` | the full dashboard stats object |
| server → client | `residences:update` | the full residences payload (summary, series, units) |
| server → client | `notification` | `{ title, body, kind }` |

Every mutation (payment submitted, sales closed, member added/renewed/deleted, lease
added/edited/ended, rent recorded) broadcasts the relevant event, so KPI cards, the
sidebar "paid today" / "apartments live" line, the bell badge and toasts update without a
refresh. The frontend falls back to 30s polling while the socket is disconnected, so the UI
stays correct offline.

## Performance note (important)

The database is Neon behind a **cross-region pooler**, so a single round-trip costs
~400–700ms from this machine, and the pooler serialises concurrent queries rather than
running them in parallel. Two consequences shaped the backend:

**1. Fewer, bigger queries.** The original dashboard stats builder fired ~18 *sequential*
queries (including one query per revenue month), which made `/api/dashboard/stats` take
**7–13 seconds** and left every screen on skeleton placeholders. Both stats builders were
rewritten to fetch in **one parallel batch** and bucket the results in JavaScript:

| Endpoint | Before | After | Round-trips |
| --- | --- | --- | --- |
| `/api/dashboard/stats` | 7.4s | **~1.0s** | 18 → 4 |
| `/api/residences/stats` | 1.7s | **~0.7s** | 3 → 1 |

**2. Respond first, broadcast second.** Waiting for the stats rebuild *before* answering
a write made every save feel frozen (the "Save lease" button sat on "Saving…" for 2–3
seconds). `backend/src/lib/broadcast.js` now answers the client immediately and pushes the
refreshed numbers over the socket once the rebuild lands. Background rebuilds are
chained so a burst of mutations never starves the connection pool.

Reads are **coalesced** so the sidebar, the page and the notification bell share one
query on first paint — but a write invalidates any in-flight read, and broadcasts are
never shared with readers, so nobody is ever served a snapshot from before a write.

A **connection keep-alive** (`backend/src/lib/prisma.js`) pings the database every three
minutes. The pooler drops idle server-side connections, and the next request would
otherwise pay for a cold TLS handshake — which showed up as a random 3–4 second spike on
an otherwise ~1 second endpoint.

| Endpoint | Before | After |
| --- | --- | --- |
| `GET /api/dashboard/stats` | 7.4s | **~0.95s** |
| `GET /api/residences/stats` | 1.7s | **~0.95s** |
| `POST /api/residences/leases` (a save) | 2–3s | **~1.0s** |

## Tests

The backend must be running on `:5000` (and, for the UI tests, the frontend on `:3000`).

```bash
# the term rules, the 5-day expiring window, the Jan-Dec series,
# and that ending a lease keeps the earnings
cd backend && node scripts/dates-test.js          # 15 checks

# API lifecycle: add renter -> edit -> record payment -> end -> delete + every guard rail,
# plus the 5-day lease expiring window
cd backend && node scripts/residences-test.js     # 38 checks

# close the day -> archive the receipts -> the open figures reset to zero -> searching
cd backend && node scripts/reports-test.js        # 24 checks

# realtime: ping/pong, notification, stats:update, residences:update
cd backend && node scripts/socket-test.js         # SOCKET TEST PASSED

# headless Chrome: every route renders with live data and zero console errors,
# then again in NIGHT MODE, plus the login page in both themes
cd frontend && node scripts/ui-check.js           # UI CHECK PASSED (7 routes + dark pass)

# headless Chrome: drives every button in the real UI
cd frontend && node scripts/ui-interact.js        # INTERACTION TEST PASSED (45 checks)
```

The UI tests drive Chrome over the DevTools Protocol using Node's built-in WebSocket —
no extra npm dependencies. Screenshots land in `frontend/.ui-check/`.

## Environment files

- `backend/.env` — `DATABASE_URL`, `JWT_SECRET`, `PORT`, `BCRYPT_SALT_ROUNDS`
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:5000/api`

Both are gitignored; `backend/.env.example` holds placeholders.

> Rotate the Postgres password if the connection string has been shared publicly.

## API

All routes under `/api`, requiring `Authorization: Bearer <token>` except `POST /auth/login`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | current user |
| GET | `/dashboard/stats` | all dashboard figures in one payload |
| GET | `/payments?date=&q=&page=` | OPEN receipt list (newest first), optional day filter and search |
| GET | `/payments/summary?date=` | `{ totalSales, transactionCount, openTotalSales, openTransactionCount }` for a day |
| POST | `/payments` | record a sale (walk-in sales link to no member) |
| POST | `/payments/close-sales` | roll open transactions into a `DailyReport` |
| DELETE | `/payments/:id` | remove a sale |
| GET | `/members?q=&filter=` | `{ counts, members }` with `amountPaid`, `timeRemainingMs`, `status` |
| POST | `/members` | add a membership (+ its payment) |
| POST | `/members/:id/renew` | extend by N days + record the payment |
| DELETE | `/members/:id` | remove a member |
| GET | `/plans` | membership plans |
| GET | `/reports/closed` | closed days + lifetime totals (`totalSales`, `transactionCount`, `daysClosed`, `averagePerDay`) |
| GET | `/reports/search?q=&date=` | archived receipts matching a term, with the day each was closed in |
| GET | `/reports/:id/receipts` | every receipt rolled into one closed day |
| GET | `/notifications` | notification history |
| GET | `/residences/stats` | summary + income series + per-unit earnings + expiring leases |
| GET | `/residences/units` | summary + every room card for the Apartments tab |
| POST | `/residences/leases` | book a vacant unit |
| PUT | `/residences/leases/:id` | edit renter / contact / dates / rent |
| POST | `/residences/leases/:id/end` | end a lease (frees the unit) |
| DELETE | `/residences/leases/:id` | remove an ended lease and its rent history |
| POST | `/residences/leases/:id/payments` | *removed* — the rent is applied automatically when a lease is saved |

## Data model

`User`, `MembershipPlan`, `Member`, `Payment` (nullable member/plan for walk-ins, plus
`itemName`, `notes`, `reportId`), `DailyReport`, `Notification`, `ActivityLog`.

**Apartments** adds three tables, deliberately separate from the gym's `Payment`
table so rental income never leaks into the gym KPIs:

- `ApartmentUnit` — `code` (card heading, "ROOM 1"), `name` ("Unit 1A"), `type`, `monthlyRent`, `order`.
- `Lease` — `unitId`, `renterName`, `contact`, `startDate`, `endDate`, `monthlyRent`, `status` (`ACTIVE` / `ENDED`), `endedAt`, `endedReason`.
- `LeasePayment` — `leaseId`, `amount`, `method`, `notes`, `paidAt`.

## Seeding

There are two seeds:

| Command | Result |
| --- | --- |
| `npm run seed` | **Brand new.** The admin account, the two membership tiers (15 days ₱200 · 30 days ₱350) and the four apartments — and **no sample records at all**: 0 members, 0 receipts, 0 reports, 0 notifications, 0 leases, 0 rent payments. |
| `npm run seed:demo` | The full demo: 12 members, 68 receipts, a closed report, 6 leases and their rent history. |

Both are idempotent — running either wipes and rebuilds the tables it owns.

The admin account, the membership tiers and the apartments always exist: there is no "add
plan" or "add apartment" action in the UI, so removing them would leave those screens
permanently unusable. Everything else is sample data and lives behind `seed:demo`.

The demo seed pins the gym KPIs to:
- today's 4 open receipts totalling **₱1,950.00**
- 12 members (8 active, 3 expiring soon, 4 expired), 2 plans
- a Jan→October revenue series landing on **₱486,250** (+12.4% vs September's ₱432,600)
- one closed daily report from yesterday (3 receipts, ₱1,050)

and the Apartments KPIs to:
- total earned **₱641,643.25** (all-time, including past renters)
- occupancy **50%** (2 of 4 units) · rent roll **₱30,500** · vacant **2**
- earned this month **₱18,860** · 6-month income series May→Oct

The seed self-checks these totals on every run (the demo seed is tuned for October and
warns otherwise).

**The test suites** seed the demo data up front — they need a known state — and leave the
database brand new again when they finish, so running the tests never leaves sample data
behind.
