# Bill Splitter

A household expense-sharing app for organizing homes, recording bills, and tracking what each housemate owes.

## Features

- Create and manage multiple homes.
- Add and remove housemates.
- Record bills and split each amount between members.
- Track outstanding balances and record payments.
- Retry failed payments safely.
- Change the displayed currency symbol without changing stored amounts.
## Technology
## Technology

- **Web:** React, TypeScript, Vite, and TanStack Router
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)

## Getting started

### Requirements

- [Node.js 24](https://nodejs.org/)
- [pnpm 12](https://pnpm.io/installation)

### Install and run

From the project root:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The development command starts the web app and API, and applies the local database migrations.

## Available commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the web app and API for local development. |
| `pnpm check` | Run Biome checks. |
| `pnpm typecheck` | Type-check the project packages. |
| `pnpm test` | Run the API test suite. |
| `pnpm build` | Build the web app for production. |

## Project layout

```text
api/    Cloudflare Worker API, D1 migrations, and tests
web/    React web application
```
