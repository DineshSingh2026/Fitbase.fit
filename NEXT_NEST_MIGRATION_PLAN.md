# FitBase Next.js + NestJS Migration (Parity-First)

This repository now includes a migrated Next + Nest stack:

- `apps/frontend-next` (Next.js shell)
- `apps/backend-nest` (NestJS + PostgreSQL + migrated APIs)

## Current migration mode

This is configured in **parity-first mode** so live UX and flows remain stable:

- Next.js frontend renders the app through a full-frame shell
- NestJS backend serves migrated APIs natively
- Legacy proxy remains for any endpoints not migrated yet

## Run locally

1. Keep legacy app running (for proxy fallback during transition):
   - `npm run dev` (root) -> legacy Express on `http://localhost:3000`
2. Start Nest backend:
   - `npm --prefix apps/backend-nest install`
   - `npm run dev:backend-nest` -> Nest on `http://localhost:3200`
3. Start Next frontend:
   - `npm --prefix apps/frontend-next install`
   - `npm run dev:frontend-next` -> Next on `http://localhost:3100`

## Environment variables

### Frontend (apps/frontend-next)
- `NEXT_PUBLIC_LEGACY_SITE_URL=http://localhost:3200/`
- `BACKEND_URL=http://localhost:3200`

### Backend (apps/backend-nest)
- `PORT=3200`
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=...`
- `JWT_EXPIRY=365d` (optional; explicit token lifetime—Nest/Express read this)
- `LEGACY_SERVER_URL=http://localhost:3000`

## Render deployment (two services)

Use Render Blueprint from `render.yaml`:

1. Deploy backend service `fitbase-backend-nest`.
   - Build: `npm install && npm run build`
   - Start: `npm run start`
   - Health: `/api/health`
2. Deploy frontend service `fitbase-frontend-next`.
   - Build: `npm install && npm run build`
   - Start: `npm run start`
3. Set required env vars:
   - Backend: `DATABASE_URL`, `JWT_SECRET`, `PORT=3200` (optional: `JWT_EXPIRY` e.g. `365d`)
   - Frontend: `NEXT_PUBLIC_LEGACY_SITE_URL=<backend-public-url>`, `BACKEND_URL=<backend-public-url>`
4. Optional during transition:
   - Keep `LEGACY_SERVER_URL=<legacy-url>` on backend for proxy fallback.

## Zero-regression rule

For each migrated endpoint/page:
- Keep request/response contract identical
- Verify role permissions (`user`, `admin`, `superadmin`)
- Compare UI screenshot before/after
- Run e2e flow checks before moving to next module
