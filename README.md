# Shared Home Bill Splitter

A simple app for managing household expenses. Create homes, add housemates, split bills, record payments, and track what each person still owes.

## Acknowledgement

This project was built from the SDE Intern Assignment starter template. The starter template's original commit was authored by [Ritik Joshi (@ritik6559)](https://github.com/ritik6559).

## Run the app

You need [Node.js 24](https://nodejs.org/) and [pnpm 12](https://pnpm.io/installation).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The app starts the web interface and API locally and prepares the local database automatically.

## How to use it

1. Create a home.
2. Open it and add its members.
3. Add a bill with a title and amount.
4. Review the split and each member's outstanding balance.
5. Select **Pay** when a member pays their share. Failed payments can be retried safely.

You can create multiple homes, remove members or homes, and change the displayed currency symbol. Changing the symbol does not convert the amounts.

## Built with

React, TypeScript, Vite, Hono, Cloudflare Workers, and Cloudflare D1 (SQLite).

## Run checks

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```
