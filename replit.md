# PurchaseVault

PurchaseVault keeps purchase details, warranty timelines, and return deadlines organized in a personal browser-based vault.

## Run & Operate

- Run the `artifacts/purchase-vault: web` workflow to open the app preview.
- `pnpm --filter @workspace/purchase-vault run typecheck` — check the app package.
- `PORT=5000 BASE_PATH=/purchase-vault/ pnpm --filter @workspace/purchase-vault run build` — build the web app.
- Run the `artifacts/api-server: API Server` workflow for the API (port 5000).
- `pnpm --filter @workspace/api-server run test:unit` — run date and warranty calculation tests.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required Replit Secrets: `MONGODB_URI`, `JWT_SECRET`
- Optional environment: `JWT_EXPIRES_IN`, `FRONTEND_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 with JavaScript ES modules for domain routes and services
- DB: MongoDB Atlas + Mongoose
- Authentication: bcryptjs password hashes and JWTs in HttpOnly cookies
- Validation: OpenAPI-generated Zod schemas
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Purchase records and account data are stored in MongoDB and scoped to the signed-in user.
- Legacy browser-local purchases remain as an optional, user-confirmed import source; they are not silently uploaded or deleted.
- Documents currently store metadata only. File-byte uploads, OCR, manufacturer verification, and email/push delivery are not implemented.
- Warranty and return reminders are generated idempotently when the in-app notification list is requested; there is no background scheduler.
- Use JavaScript/JSX for the PurchaseVault frontend and JavaScript ES modules for new API domain code; keep the code approachable for a beginner.

## Product

Users can create an account, add, edit, search, filter, view, and delete their own purchase records; track calculated warranty and return-window dates; and prepare for a warranty conversation using saved details. The browser-local import is explicit and leaves its source unchanged.

## User preferences

- The user is a beginner and wants the app built step by step with easy-to-understand code.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
