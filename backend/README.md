# Hotel & Gym Business — Backend API

REST API + Socket.IO realtime layer for the hotel & gym business admin app. Built with **Express 4**, **Prisma ORM**, **PostgreSQL (Neon)**, **JWT** auth, **bcryptjs** and **Socket.IO**.

## Stack

| Concern    | Choice                          |
| ---------- | ------------------------------- |
| Runtime    | Node.js (CommonJS)              |
| Web        | Express 4 + raw `http` server   |
| Realtime   | Socket.IO 4                     |
| ORM / DB   | Prisma + PostgreSQL (Neon)      |
| Auth       | JWT (`jsonwebtoken`) + bcryptjs |
| Middleware | cors, dotenv, express.json      |
| Dev        | nodemon                         |

## Getting started

```bash
cd backend
npm install
```

Create the environment file (a working `.env` is already included for the demo DB):

```bash
cp .env.example .env   # then fill in the real values
```

Environment variables:

```
DATABASE_URL="postgresql://.../neondb?sslmode=require&channel_binding=require"
JWT_SECRET="abbsey-fitness-jwt-secret-2026"
PORT=5000
BCRYPT_SALT_ROUNDS=10
```

### Database setup

```bash
# Apply the schema to the database (creates prisma/migrations)
npx prisma migrate dev --name payments_item_notes_daily_reports_notifications

# If your Neon pooler rejects the shadow/direct connection used by
# `migrate dev`, push the schema instead:
# npx prisma db push

# Load demo data (admin user, 5 plans, 12 members, payments, closed report, notifications)
npm run seed
```

Latest migration: `20261020130716_payments_item_notes_daily_reports_notifications`
— makes `Payment.memberId`/`Payment.planId` optional (walk-in & non-plan sales),
adds `Payment.itemName`/`notes`/`reportId`, and adds the `DailyReport` and
`Notification` models.

### Run

```bash
npm run dev    # nodemon (auto-reload)
npm start      # plain node src/index.js
```

The API listens on `http://localhost:5000` and is mounted under `/api`;
Socket.IO shares the same port. CORS is enabled for `http://localhost:3000` with credentials.

## Demo credentials

| Email              | Password |
| ------------------ | -------- |
| `brenie@abbsey.ph` | `brenie` |

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"brenie@abbsey.ph","password":"brenie"}'
```

The short handle `brenie` also works (it resolves to `brenie@abbsey.ph`).

## Endpoints

All endpoints except `POST /api/auth/login` require an
`Authorization: Bearer <token>` header.

### Auth

| Method | Path              | Description                                  |
| ------ | ----------------- | -------------------------------------------- |
| POST   | `/api/auth/login` | `{ email, password }` → `{ token, user }`    |
| GET    | `/api/auth/me`    | Current user `{ id, email, name, role }`     |

### Dashboard

| Method | Path                       | Description                        |
| ------ | -------------------------- | ---------------------------------- |
| GET    | `/api/dashboard/stats`     | Dashboard KPIs and lists (below)   |

`GET /api/dashboard/stats` returns (built by `src/lib/stats.js`, which every
mutating route rebroadcasts over Socket.IO):

```jsonc
{
  "todaySales": 1950,          // sum of today's PAID payments
  "todayTransactions": 4,      // count of today's payments (any status)
  "paidToday": 1950,           // alias of todaySales (sidebar "₱x paid today")
  "openSales": 1950,           // today's PAID payments NOT yet in a DailyReport
  "openTransactions": 4,       // count of those open payments
  "activeMembers": 8,
  "expiredMembers": 4,
  "activePlans": 5,
  "monthRevenue": 486250,      // current month PAID total
  "monthLabel": "October",
  "prevMonthLabel": "September",
  "prevMonthRevenue": 432600,
  "growthPercent": 12.4,
  "revenueSeries": [{ "month": "Jan", "revenue": 210000 }, ...],
  "expiringSoon": [{ "id", "name", "plan", "endDate", "daysLeft" }, ...],
  "recentPayments": [{ "id", "memberName", "planName", "itemName", "notes", "method", "amount", "status", "paidAt" }, ...]
}
```

- `expiringSoon` — active members whose `endDate` is within 15 days, sorted by `daysLeft` ascending (Kim Navarro 15d, Paolo Cruz 3d, Miguel Reyes 1d in the demo data).
- `recentPayments` — the 6 most recent payments, including `itemName`, `notes` and `method`; `memberName` falls back to `"Walk-in guest"` for non-member sales. Today's day-pass (Walk-in plan) payments are excluded when a `Walk-in` plan exists.
- `openSales` / `openTransactions` track the portion of today's cash that `POST /api/payments/close-sales` has not yet rolled into a `DailyReport`.
- All monetary values are plain numbers (`parseFloat` of Prisma `Decimal`).

### Members

| Method | Path                        | Notes                                                       |
| ------ | --------------------------- | ----------------------------------------------------------- |
| GET    | `/api/members?q=&filter=`   | `{ counts, members }` (below)                               |
| POST   | `/api/members`              | `{ fullName, phone?, planId, startDate, amount }` → member + PAID payment |
| POST   | `/api/members/:id/renew`    | `{ planId?, days, amount }` → `{ member, previousExpiration, newExpiration, daysAdded }` |
| PUT    | `/api/members/:id`          |                                                             |
| DELETE | `/api/members/:id`          | Also deletes the member's payments                          |

`GET /api/members` returns:

- `counts` — `{ all, active, expiring, expired }`, computed **before** the `filter` query param is applied:
  `expired` = `endDate < now`, `expiring` = `0 <= daysLeft <= 15`, `active` = not expired (so the demo figures are `all:12, active:8, expiring:3, expired:4`).
- `members` — `{ id, fullName, phone, email, createdAt, startDate, endDate, daysLeft, timeRemainingMs, status, plan: { id, name, durationDays }, amountPaid }`
  where `status` is derived from `endDate` (`ACTIVE` > 15 days, `EXPIRING` 0–15 days, `EXPIRED` in the past) and `amountPaid` is the sum of that member's PAID payments.
- `q` searches `fullName`, `phone` and plan name (case-insensitive).
- `filter` = `all` | `active` | `expiring` | `expired`.
- `POST /api/members` sets `endDate = startDate + plan.durationDays` and creates a linked PAID payment named `"<plan> membership"`.
- `POST /api/members/:id/renew` extends from `max(previousExpiration, now)`, sets the member back to `ACTIVE` and records a PAID payment `"<plan> renewal"` with note `Renewed <days> days`.

### Payments

| Method | Path                                | Notes                                                  |
| ------ | ----------------------------------- | ------------------------------------------------------ |
| GET    | `/api/payments?date=YYYY-MM-DD&page=1` | Newest first; `date` narrows to that local calendar day. Returns `{ payments, total, page, pages }` |
| GET    | `/api/payments/summary?date=YYYY-MM-DD` | `{ date, totalSales, transactionCount }` of PAID payments that day (default: today) |
| POST   | `/api/payments`                     | `{ memberName, amount, itemName?, notes?, date?, method? }` — creates a PAID payment |
| POST   | `/api/payments/close-sales`         | `{ date? }` — rolls the day's open PAID payments into a `DailyReport` |
| PUT    | `/api/payments/:id`                 |                                                        |
| DELETE | `/api/payments/:id`                 |                                                        |

Each payment row: `{ id, memberId, memberName, planId, planName, itemName, notes, method, amount, status, reportId, paidAt }`.
`memberName` is `"Walk-in guest"` when the payment has no member.

- `POST /api/payments` links the member when a **case-insensitive exact** `fullName` match exists; otherwise `memberId` stays `null` (walk-in sale). Emits `stats:update` + a `"New payment"` notification.
- `POST /api/payments/close-sales` finds PAID payments for the day with `reportId: null`; none → `400 { "error": "No open transactions to close" }`. Otherwise it creates (or updates) that day's `DailyReport`, stamps the payments with its `reportId` and returns `{ report: { id, date, totalSales, transactionCount, closedAt }, totalSales, transactionCount }`. Emits stats + `"Daily sales closed"` notification.

### Reports

| Method | Path                   | Notes                                            |
| ------ | ---------------------- | ------------------------------------------------ |
| GET    | `/api/reports/closed`  | `{ reports: [...] }` — last 30 closed `DailyReport`s, newest first |

Each report: `{ id, date, totalSales (number), transactionCount, closedAt }`.

### Notifications

| Method | Path                       | Notes                                       |
| ------ | -------------------------- | ------------------------------------------- |
| GET    | `/api/notifications`       | `{ notifications: [...] }` — latest 30, newest first (`id, title, body, kind, read, createdAt`) |

Realtime notifications arrive over Socket.IO (see below); this endpoint serves the seeded/persisted history.

### Plans

| Method | Path              |
| ------ | ----------------- |
| GET    | `/api/plans`      |
| POST   | `/api/plans`      |
| PUT    | `/api/plans/:id`  |
| DELETE | `/api/plans/:id`  |

### Errors

- Unknown route → `404 { "error": "Not found" }`
- Invalid/expired/missing token → `401 { "error": "Unauthorized" }`
- Bad credentials → `401 { "error": "Invalid email or password" }`
- Validation problems → `400 { "error": "<message>" }`
- Any unhandled error → `{ "error": "<message>" }`

## Socket.IO realtime

Connect to the same port as the REST API:

```js
import { io } from 'socket.io-client'
const socket = io('http://localhost:5000')           // auth is OPTIONAL
const socket = io('http://localhost:5000', { auth: { token: jwt } }) // identifies the user
```

- Auth is **optional**: a JWT in `socket.handshake.auth.token` identifies the socket (`socket.data.user`); a missing/invalid token never rejects the connection — the socket is simply anonymous.
- CORS origin: `http://localhost:3000` (credentials allowed).
- Heartbeat: Socket.IO engine ping/pong (`pingInterval` 25 s, `pingTimeout` 20 s). There is also an app-level `ping` event that answers with `{ pong: true, ts }`.

| Event             | Payload                                        | Fired when |
| ----------------- | ---------------------------------------------- | ---------- |
| `stats:update`    | the full `/api/dashboard/stats` payload        | any payment/member mutation (create, delete, renew, close-sales, …) |
| `notification`    | `{ title, body, kind, read, createdAt }`        | payment recorded/deleted, close-sales, renewal, member changes |
| `pong`            | `{ ts }`                                        | replying to a bare `socket.emit('ping')` without a callback |

Smoke test (server must be running):

```bash
node scripts/socket-test.js   # logs in, connects, records a ₱250 walk-in payment,
                              # verifies notification + stats:update + ping, cleans up
```

## Project structure

```
backend/
├─ prisma/
│  ├─ schema.prisma        # User, MembershipPlan, Member, Payment, DailyReport, Notification, ActivityLog
│  ├─ seed.js              # demo data (idempotent, KPI-reconciled — see below)
│  └─ migrations/
├─ scripts/
│  └─ socket-test.js       # Socket.IO smoke test (uses devDependency socket.io-client)
├─ src/
│  ├─ index.js             # app entry: express + http server + Socket.IO, route mounting
│  ├─ realtime.js          # initRealtime/emitStats/emitNotification (Socket.IO)
│  ├─ lib/
│  │  ├─ prisma.js         # PrismaClient singleton
│  │  └─ stats.js          # buildStats() — dashboard KPI payload
│  ├─ middleware/auth.js   # requireAuth (JWT Bearer)
│  └─ routes/
│     ├─ auth.js
│     ├─ dashboard.js
│     ├─ members.js
│     ├─ notifications.js
│     ├─ payments.js
│     ├─ plans.js
│     └─ reports.js
├─ .env                    # local secrets (git-ignored)
├─ .env.example
└─ package.json
```

## Data model

- **User** — `id`, `email` (unique), `passwordHash`, `name`, `role` (default `ADMIN`), `createdAt`
- **MembershipPlan** — `id`, `name`, `price Decimal(10,2)`, `durationDays`, `active`, `createdAt`
- **Member** — `id`, `fullName`, `email?`, `phone?`, `planId → MembershipPlan`, `startDate`, `endDate`, `status` (`ACTIVE`/`EXPIRED`/`EXPIRING`), `createdAt`
- **Payment** — `id`, `memberId? → Member` (null = walk-in sale), `planId? → MembershipPlan`, `amount Decimal(10,2)`, `status` (`PAID`/`PENDING`), `method?`, `itemName?` (item/service purchased), `notes?`, `reportId? → DailyReport` (null = "open" sale), `paidAt`
- **DailyReport** — `id`, `date` (unique, start of the closed day), `totalSales Decimal(10,2)`, `transactionCount`, `closedAt`
- **Notification** — `id`, `title`, `body?`, `kind` (`info`/`payment`/`report`/`renewal`/…), `read`, `createdAt`
- **ActivityLog** — `id`, `action`, `detail?`, `createdAt`

## Verified demo figures

After `npm run seed` (tuned for October), `GET /api/dashboard/stats` returns — all values verified against the live Neon DB:

```
todaySales=1950  todayTransactions=4  openSales=1950  openTransactions=4  paidToday=1950
activeMembers=8  expiredMembers=4  activePlans=5
monthRevenue=486250  monthLabel=October  prevMonthRevenue=432600  growthPercent=12.4
revenueSeries: Jan 210000, Feb 245500, Mar 268000, Apr 301250, May 289000,
               Jun 325400, Jul 355000, Aug 398750, Sep 432600, Oct 486250
expiringSoon: Miguel Reyes (1d), Paolo Cruz (3d), Kim Navarro (15d)
GET /api/members -> counts { all: 12, active: 8, expiring: 3, expired: 4 }
```

### Seed reconciliation notes

- The seed is **idempotent**: it deletes payments → members → daily reports → notifications (FK order), removes any plan not among the 5 demo plans, upserts the 5 plans by name and upserts the `brenie@abbsey.ph` admin.
- **Today's 4 payments total exactly ₱1,950.00** and are all *open* (`reportId: null`): Lance Aquino ₱950 (GCash, Quarterly membership), walk-in guest ₱180 (Walk-in), Janine Dela Cruz ₱150 (Protein shake — "Trisha Gomez" doesn't exist), Rafael Bucosta ₱670 (Personal training session, Coach Marv).
- One **closed DailyReport** is seeded for yesterday (3 payments, ₱11,100) so `/api/reports/closed` has history.
- **Monthly revenue pinning**: each month's member-level payments are seeded first, then the remaining balance of that month's demo target is filled with "Corporate billing" bank-transfer payments (attributed to the Annual plan), so every month lands exactly on its chart value (210000 … 486250) regardless of how the small payments are tuned. Two PENDING payments are included for realism and never counted in revenue.
- **Rafael Bucosta** is seeded with `endDate = today + 16d` (instead of the originally sketched +13d) so exactly three members fall inside the 15-day expiry window — the demo KPIs require `expiring: 3` (Kim 15d, Paolo 3d, Miguel 1d).
- `counts.active` counts every **not-expired** member (8), `counts.expiring` the 0–15-day subset of those (3) — hence 8 + 4 = 12 members in total, with the expiring 3 overlapping the active 8.
- Re-running `npm run seed` at any time restores this exact state (it is also the documented way to undo close-sales / renewal smoke tests).
- The seed is tuned for the current month being **October**; run in another month the monthly chart values will differ (a warning is printed).
