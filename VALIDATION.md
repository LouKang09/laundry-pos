# Delivery and verification

Verification date: 13 September 2026.

## Deployment

- App: https://laundry-pos-web-production.up.railway.app/
- Source: https://github.com/LouKang09/laundry-pos/tree/dev/complete-laundry-pos
- Railway project: `laundry-pos`, production environment.
- Services: `laundry-pos-web` (React assets + Express API) and `Postgres` (PostgreSQL 18).
- PostgreSQL uses private networking and a persistent 5 GB volume. No public database proxy was created.
- The web service uses the root Dockerfile, Node 22, one replica, `/health`, a 120-second health timeout and restart on failure.
- Database migrations and the idempotent seed run before HTTP startup. A failed initialization prevents the new container accepting traffic.
- No production password is included in source. `ADMIN_SETUP_KEY` is stored privately in Railway; the owner chooses the first Admin password through the app.

Railway's new services do not consume deprecated `railway.json` files. Deployment settings were applied directly to the service. The Dockerfile and startup script preserve database initialization across rebuilds. The README documents the settings needed to recreate the service.

## Automated verification

**23 backend integration tests and 13 React integration tests pass.** The local run uses an isolated PGlite PostgreSQL instance. GitHub Actions repeats the build and suites with a standard PostgreSQL 16 service. The tests call the actual Express APIs and database; business responses are not replaced with static frontend fixtures.

| Requested workflow | Verified behavior |
| --- | --- |
| Login and roles | Hashed passwords, HttpOnly sessions, CSRF, origin checks, logout, inactive accounts and backend Admin restrictions |
| Customers | Staff registration, selection, customer search and order-history search |
| KG and piece orders | Decimal pricing, minimum KG, actual/billable quantities and whole-piece validation |
| Regular and Express | Correct configured rate and retained historical price snapshots |
| Payments | Unpaid saves, full Cash and GCash, required unique GCash reference, idempotent creation and concurrent payment protection |
| Laundry progress | Forward-only Received → Washing → Drying → Folding → Ready, complete status history |
| Notifications | Durable records at Drying, Folding and Ready; approximate pickup messaging |
| Pickup | Unpaid claim blocked, payment recorded before claim, both actions audited |
| QR and receipts | Random public token, safe tracking fields, Admin-only official print/reprint |
| Inventory | Replenishment, adjustment, history, per-service usage and atomic insufficient-stock rejection |
| Reports | Database-based totals, expenses, dashboard, business timezone and period boundaries |
| Audit | Orders, payments, status, views, receipts, management, authentication and no password/session secrets in metadata |
| Initial setup | Valid first-admin creation, hashed password, invalid-key rejection and setup closes after the first Admin |
| Frontend | POS creates a customer and paid order; dashboard and all operational/administrative screens render API data |

The production container build also completes. Production dependency audit reported zero known vulnerabilities at verification time; two moderate findings remain in development-only tooling.

The application commit `6dd7fd68d72342048c3eb03d7d869cf3922a5132` passed [GitHub CI run 34767541745](https://github.com/LouKang09/laundry-pos/actions/runs/34767541745).

## Production checks

The live sign-in page was inspected in Chrome. Production health, schema setup, public setup availability and authentication boundaries are checked separately from local/CI workflow tests. No synthetic sales or test customers are written to production. Authenticated workflows are verified in the isolated integration suites; the owner completes the first production login after selecting credentials.

Railway deployment `bc557c67-af4a-47f1-a1d0-d0c532924469` reached **SUCCESS**. Runtime logs confirm both migrations applied successfully, the seed completed, and the HTTP server then started. The live sign-in page shows **First-time Admin setup**.

Live HTTP checks passed: `/health` → 200 with `database: connected` and `schema: ready`; `/api/auth/setup-status` → 200 with `available: true`; unauthenticated `/api/orders` → 401; a nonexistent public tracking token → 404 with no private information.

Checked-in migrations:

1. `202609130001_initial` — schema, enums, relations, indexes and order sequence.
2. `202609130002_database_guards` — database constraints for monetary amounts, quantities, stock, claim/payment consistency and pickup windows.

The seed creates three configurable service examples, five supplies with zero stock and initial shop settings. It does not create sample transactions or customers. Review these defaults and enter opening stock before live use.

## Scope and intentional extensions

- SMS records are stored, but provider delivery, retries and delivery receipts await a future provider integration.
- Cash/GCash payments record confirmed funds; this is not an online payment gateway.
- Saved financial lines are immutable. Admin cancellation supports unpaid Received orders; paid refunds/voids and historical financial editing/deletion are not implemented.
- Official receipt generation, including the first print, is Admin-only. Staff can view the order and tracking link.
- Camera scanning, offline operation, multiple branches and distributed rate limiting are future extensions. Keyboard-style QR scanners are supported.
- Printer hardware, actual SMS/GCash networks, backup restoration and load/stress testing were not exercised. PostgreSQL persistence is configured; a backup schedule and restore drill remain owner operational tasks.

See [README.md](README.md) for first-admin setup, development, deployment, business rules and operations.
