# PurchaseVault

PurchaseVault keeps purchase details, warranty timelines, and return deadlines organized in a personal browser-based vault.

## Run & Operate

- Run the `artifacts/purchase-vault: web` workflow to open the app preview.
- `pnpm --filter @workspace/purchase-vault run typecheck` — check the app package.
- `PORT=5174 BASE_PATH=/ pnpm --filter @workspace/purchase-vault run build` — build the web app.
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- The first milestone is frontend-only: purchase records persist in browser `localStorage`; no account sync or server storage is active.
- Keep backend, authentication, uploads, OCR, and notifications deferred until the user moves beyond the first milestone.
- Use JavaScript/JSX for the PurchaseVault frontend, as requested; keep the code approachable for a beginner.

## Product

Users can add, edit, search, filter, view, and delete purchase records; track calculated warranty and return-window dates; and prepare for a warranty conversation using the details they saved. Sample data is provided for the initial experience.

## User preferences

- The user is a beginner and wants the app built step by step with easy-to-understand code.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
