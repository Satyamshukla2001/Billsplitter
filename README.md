# Bill Splitter

A household expense-sharing app for organizing homes, recording bills, and tracking what each housemate owes.

## Features

- Create and manage multiple homes.
- Add and remove housemates. Member names may contain letters and spaces only.
- Record bills for a specific housemate using the available bill categories and track their balance.
- Record bills in different currencies and show mixed-currency totals in INR using the latest available exchange rates (updated daily by ExchangeRate-API).
- Track outstanding balances and record payments.
- Retry failed payments safely.

## Technology

- **Web:** React, TypeScript, Vite, and TanStack Router
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)

## Getting started

### Requirements

- [Node.js 24](https://nodejs.org/)
- [pnpm 12](https://pnpm.io/installation)

### Install packages

Run from the repository root (`sde-intern-task-002`):

```bash
pnpm install
```

This installs dependencies for the root workspace and both packages (`api` and `web`). To install dependencies for only one package, use:

```bash
pnpm install --filter bill-splitter-api
pnpm install --filter bill-splitter-web
```

### Start the app

Start the API and web app together from the repository root:

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs at [http://localhost:8787](http://localhost:8787). The API development command applies D1 migrations to the local database before starting Wrangler.

To run either package separately, use two terminals from the repository root:

```bash
pnpm --filter bill-splitter-api dev
pnpm --filter bill-splitter-web dev
```

### Useful commands

Run these from the repository root:

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start the web app and API for local development. |
| `pnpm build`     | Build the web app for production.                |
| `pnpm typecheck` | Type-check the project packages.                 |
| `pnpm test`      | Run the API test suite.                          |
| `pnpm check`     | Run Biome checks.                                |
| `pnpm lint`      | Run Biome lint checks.                           |

## API reference

Base URL during local development: `http://localhost:8787`

All routes are prefixed with `/api`. Requests with a JSON body should use `Content-Type: application/json`. Locally, API access is allowed without a login. When deployed on a non-local host, routes require a valid Cloudflare Access identity.

| Method   | Endpoint                                   | Description                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                              | Health check; returns `{ "status": "ok" }`.                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/homes`                               | List the current user's homes and assigned totals grouped by currency.                                                                                                                                                                                                                                      |
| `POST`   | `/api/homes`                               | Create a home. JSON body: `{ "name": "Home name" }`.                                                                                                                                                                                                                                                        |
| `GET`    | `/api/homes/{homeId}`                      | Get a home and its members.                                                                                                                                                                                                                                                                                 |
| `DELETE` | `/api/homes/{homeId}`                      | Delete a home and its associated members, bills, and shares.                                                                                                                                                                                                                                                |
| `POST`   | `/api/homes/{homeId}/members`              | Add a member. JSON body: `{ "name": "Member name" }`. Names may contain letters and spaces only.                                                                                                                                                                                                            |
| `DELETE` | `/api/homes/{homeId}/members/{memberId}`   | Delete a member and that member's assigned share(s).                                                                                                                                                                                                                                                        |
| `GET`    | `/api/homes/{homeId}/balances`             | Get each member's unpaid balance, grouped by currency.                                                                                                                                                                                                                                                      |
| `GET`    | `/api/homes/{homeId}/bills`                | List a home's bills and their member shares.                                                                                                                                                                                                                                                                |
| `POST`   | `/api/homes/{homeId}/bills`                | Add a bill for one member. JSON body: `{ "title": "Groceries", "totalCents": 77000, "currencyCode": "INR", "memberId": "member-id" }`. `title` must be an available bill category; `currencyCode` defaults to `INR`. `totalCents` is the amount in the currency's minor units (for example, paise for INR). |
| `POST`   | `/api/bills/{billId}/shares/{shareId}/pay` | Mark a share as paid. Send a unique `Idempotency-Key` request header; reusing the same key safely retries the same payment.                                                                                                                                                                                 |
| `GET`    | `/api/exchange-rates`                      | Get available currency exchange rates with INR as the base currency.                                                                                                                                                                                                                                        |

## Project layout

```text
api/    Cloudflare Worker API, D1 migrations, and tests
web/    React web application
```
