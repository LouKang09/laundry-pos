# Laundry POS

React + Vite, Node.js + Express, PostgreSQL and Prisma. One web service serves the built React application and its API; PostgreSQL stores all business data. This project is designed for Railway and includes production migrations, a Dockerfile and GitHub CI.

## Delivery status

See [VALIDATION.md](VALIDATION.md) for actual verification results and deployment blockers. A configured deployment is not a live deployment. No production URL or production account exists until Railway provisioning completes.

## Start locally

Requirements: Node.js 22.12+ (Node 22 LTS recommended), npm, PostgreSQL 16 or newer.

1. Create a PostgreSQL database and dedicated database user.
2. Copy `.env.example` to `.env` in the repository root. Set `DATABASE_URL` to your PostgreSQL connection string. Never commit `.env`.
3. From the repository root:

```sh
npm ci
npm run build
npm run db:migrate
npm run db:seed
```

4. Create the first Admin using the instructions below.
5. Start development:

```sh
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to Express on port 3000. Keep the terminal running. Both frontend and backend start with this command.

For a local production-build smoke run, set `APP_URL=http://localhost:3000` and `ALLOWED_ORIGINS=http://localhost:3000`, then run `npm start` and open **http://localhost:3000**. Leave `NODE_ENV=development` for local HTTP; production cookies require HTTPS.

### First Admin — no default password

The seed inserts configurable example services, five supplies with **zero stock**, and shop settings. It does not insert customers, sample orders or a fixed Admin password. Confirm service prices before real sales.

Set temporary environment variables, then run `npm run admin:setup`:

```text
ADMIN_EMAIL=your-email@example.com
ADMIN_NAME=Your name
ADMIN_PASSWORD=a unique password of at least 12 characters
```

You can temporarily place these in the ignored root `.env`, run the command, then remove `ADMIN_PASSWORD` immediately. The command hashes the password with bcrypt, creates one Admin and records an audit event. It refuses to run when an Admin already exists. Additional accounts and password resets belong in **Users**. Updating an account revokes its sessions; keep at least one active Admin.

On Windows PowerShell, environment variables can also be set as `$env:ADMIN_EMAIL = '...'`. Avoid committing or sharing passwords or terminal history containing them.

## Railway deployment

Use the repository root as the service root directory. Do **not** deploy `client/` by itself.

1. Push branch `dev/complete-laundry-pos` to `LouKang09/laundry-pos` and connect that repository to Railway.
2. Create a project named `laundry-pos` in your intended Railway workspace.
3. Add Railway PostgreSQL with a persistent volume. Use Railway's PostgreSQL provisioning rather than an ephemeral Docker container without a volume.
4. Add a web service from the GitHub development branch. Railway detects the root `Dockerfile` and `railway.json`.
5. Generate a public domain for the web service and configure its variables:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | Railway reference `${{Postgres.DATABASE_URL}}`; adjust `Postgres` only if the database service has a different name |
| `NODE_ENV` | `production` |
| `APP_URL` | Full generated HTTPS web URL, with no trailing slash |
| `ALLOWED_ORIGINS` | Same full HTTPS URL; comma-separated exact origins if needed |
| `PORT` | Use Railway's injected port; server defaults to 3000 locally |

Do not put production connection strings or credentials in GitHub. No database credentials go to the React bundle. Same-origin deployment avoids cross-domain session and CORS problems.

6. `railway.json` runs `npm run db:migrate` and `npm run db:seed` as pre-deploy commands. Migration uses **prisma migrate deploy**, not `db push` or a destructive reset. Seed upserts preserve existing data and prices.
7. Confirm `/health` returns HTTP 200 with `database: connected`. It returns HTTP 503 when PostgreSQL is unavailable.
8. Use Railway's authenticated service shell to run `npm run admin:setup` with the temporary Admin variables. Remove `ADMIN_PASSWORD` afterward; do not add it as a build argument or a frontend `VITE_` variable.
9. Sign in, review shop name/timezone, prices and turnaround estimates, create staff accounts, and replenish inventory. Enable service supply mappings when ready.
10. Verify a clean redeploy: existing data and sessions are in PostgreSQL; the web filesystem contains no business data. Keep the database volume and configure database backups in Railway.

The container uses Node 22, installs with `npm ci`, builds the client, generates Prisma, prunes development dependencies and runs as the unprivileged `node` user. It handles SIGTERM gracefully. Only the web service is public; keep database connectivity private for production.

## Roles and receipt policy

| Function | Admin | Laundry Staff |
| --- | --- | --- |
| Dashboard, customer registration/search, order creation | Yes | Yes |
| View orders, customer history and transactions | Yes | Yes |
| Record full Cash/GCash payment | Yes | Yes |
| Advance one workflow stage; claim paid Ready orders | Yes | Yes |
| Print/reprint official receipts | Yes | No |
| Cancel eligible orders | Yes | No |
| Inventory, expenses, reports, pricing, users, logs, settings | Yes | No |

Authorization is enforced on the Express API. Frontend navigation follows the same permissions. Official receipt generation is Admin-only, including the first official print. Staff can see the order and public tracking link.

Historical financial lines are immutable after saving. Changes to service names/prices never alter saved line snapshots. Transactions are retained for the audit trail; the supported removal action is Admin cancellation of an **unpaid RECEIVED** order. Paid or in-process cancellations require a future refund/void policy and are not silently allowed.

## Order and payment rules

- Units: **KG** (up to three decimal places) or **PIECE** (whole numbers).
- Billable quantity is `max(actual quantity, service minimum)`. Minimum is applied per service/speed line.
- Express pricing is an explicit per-unit price, rather than an additional fee. Both prices are configurable.
- Tapping an already-selected service/speed increments its actual quantity.
- Currency arithmetic uses Prisma Decimal on the server and Decimal.js in the order summary. Each line rounds half-up to two decimal places; order totals sum those rounded lines.
- No add-ons, discounts, loyalty points, partial payments or customer balance management.
- New orders start **RECEIVED**. Order numbers use the business-local date and a PostgreSQL sequence. Sequence gaps after rollbacks are normal.
- Create requests have an idempotency UUID to avoid repeated saves creating a second order.
- Payment is either **UNPAID** or **PAID**. Amount is always computed by the server from the order total.
- **CASH** and **GCASH** record confirmed payments; this is not an online GCash payment gateway. GCash requires a unique reference. Staff must verify funds were received before recording payment.
- Pickup requires **READY + PAID**. Receive payment first, then claim. Both actions are audited.

```text
RECEIVED → WASHING → DRYING → FOLDING → READY → CLAIMED
```

Staff can only move one step forward. Each transition stores old/new status, user and timestamp. Concurrent mutations use PostgreSQL serializable transactions with bounded retries; each order has at most one payment.

## Receipts, pickup and public tracking

Pickup search accepts order number, customer name, phone, the public tracking token or the full scanned tracking URL. USB/Bluetooth scanners work as keyboard input. Camera scanning is not required; a customer's phone camera can scan the receipt QR and open tracking directly.

Admin receipts include business/customer information, actual and billable quantities, saved unit prices, total, payment, received date, approximate pickup and QR. Print requests create audit records and increment copy counts; a print log records the request, not proof that a physical printer completed it.

QR URLs use 192-bit random public tokens, not database IDs. The unauthenticated API returns only order number, laundry status, received date, approximate pickup, business name and timezone. It excludes names, phones, payments, prices, staff, internal IDs and notes. Tracking is rate-limited and not cached.

## Pickup estimates and notifications

Settings provide regular hours, express hours and a window length. A mixed regular/express order uses regular turnaround. Staff can provide an optional pickup window during order creation; existing estimates do not change when settings change. Times are explicitly approximate. The optional datetime inputs use the device timezone; all displayed business timestamps and reports use the configured business timezone (default **Asia/Manila**).

Drying, Folding and Ready transitions create one durable `Notification` each in the same database transaction. Drying/Folding messages include the approximate window. No SMS provider is configured, so records remain `PENDING` and the UI says they await delivery.

`server/src/notifications.js` defines the provider extension point. A future worker must implement exclusive row claiming, retry/backoff, provider idempotency using notification IDs and delivery handling. Nothing in this version claims an SMS was sent.

## Inventory and expenses

Admin can create/edit/disable supplies, set units and low-stock thresholds, replenish, record consumption and make signed adjustments with reasons. Stock cannot fall below zero. History records quantity change, resulting stock, reason, user, order where relevant and timestamp.

Configure supplies per service in **Services → Supply use**. Consumption happens once when transitioning to **WASHING**, based on **actual**, not minimum billable, quantity. Insufficient or inactive supplies reject the entire transition. Review mappings before use; seed data does not guess detergent dosages. Inventory units cannot change after stock movements or service mappings.

Admin expense management supports date, category, description, amount and original encoder. Edits and deletions are audited. Enter supply purchase costs as expenses; inventory does not separately value stock or double-count costs.

## Reports and dashboard

Daily, weekly (Monday start), monthly and yearly ranges use the shop timezone. End boundaries are exclusive. Sales and service quantities are grouped by order-received date, excluding cancelled orders. Payment breakdowns use **payment-received** dates, so collections may differ from sales. Expenses use their encoded business date. Estimated profit is sales less recorded expenses, not a full accounting profit calculation.

Processed KG/piece totals use the date each order first became READY, including orders received in an earlier period. Reports show sales, order count, service actual/billable quantities ordered, processed KG/piece totals, expenses, estimated profit, Cash/GCash collections, staff order/sales performance and sales charts. Dashboard refreshes every 30 seconds and offers manual refresh. It shows all requested cards and live database-based charts. Zero values mean no matching database records; there are no hardcoded business metrics.

## Security and operations

- Passwords: bcrypt cost 12; no production default password.
- Sessions: random 256-bit cookie tokens, SHA-256 hashes in PostgreSQL, 12-hour expiry. Cookies are HttpOnly, SameSite Strict and Secure in production.
- Mutations: session-specific CSRF token plus exact-origin checks; centralized Zod input validation; strict object schemas.
- Admin APIs perform server-side role checks against the active user on every request.
- Audit records include user, action, entity, ID, timestamp and selected metadata. Passwords, session cookies, CSRF tokens and database credentials are never logged.
- Helmet headers, request size limits, login/API/tracking rate limits and generic internal error responses.
- For scaled multi-replica deployments, replace in-memory rate-limit counters with a shared store. This deployment is intended for one web replica initially.
- Protect PostgreSQL backups and limit database shell access; the application cannot prevent a database administrator from modifying rows directly.
- Runtime dependency overrides pin patched Effect/Deepmerge releases used by Prisma's CLI dependency chain; migrations and builds are tested with the locked graph.

## Testing

For the normal PostgreSQL suite, use a **disposable test database**:

```sh
# Set DATABASE_URL and TEST_DATABASE_URL to the same disposable database URL.
# Set NODE_ENV=test.
npm run db:migrate
npm test
```

PowerShell example, with a local disposable database:

```powershell
$env:DATABASE_URL = 'postgresql://laundry:YOUR_LOCAL_PASSWORD@localhost:5432/laundry_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:NODE_ENV = 'test'
npm run db:migrate
npm test
```

Tests add uniquely named test records and never reset an existing database. Do not point them at production. Tests refuse to run without explicit test environment settings.

In environments without a PostgreSQL service, `npm run test:embedded` launches an isolated, in-memory PGlite PostgreSQL instance with a local wire-protocol server, runs the checked-in migration and then the same integration tests. This validates SQL/schema/API workflows; it does not substitute for standard PostgreSQL multi-connection stress testing. GitHub Actions uses a real PostgreSQL 16 service.

## Project layout

```text
client/src/
  main.jsx              Authentication, role-aware navigation and routes
  operations.jsx        Dashboard, POS, orders, customers, pickup, QR/receipt
  management.jsx        Inventory, expenses, reports, services, users and logs
  api.js                Same-origin API client and CSRF handling
  ui.jsx                Shared controls, tables and state handling
  styles.css            Responsive desktop/tablet/mobile layouts
server/
  prisma/schema.prisma  Models, enums, relations and indexes
  prisma/migrations/    Checked-in production SQL migrations
  prisma/seed.js        Safe idempotent initial service/settings setup
  src/                  Express APIs, authentication and business logic
  test/                 Database integration and security scenarios
scripts/test-embedded.mjs
Dockerfile
railway.json
.github/workflows/ci.yml
```

## Future extensions

SMS provider delivery, online payment-gateway verification, paid-order refunds/voids, camera-based staff scanning, multi-branch operations, offline sales and shared rate limiting for multiple replicas. These are not required for the current single-shop workflow; no unimplemented controls pretend to provide them.
