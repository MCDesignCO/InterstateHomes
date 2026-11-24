# Interstate Homes — Estimating, Subcontract & Budget Software

Full-stack Phase 1 application built for Interstate Homes (Hurricane & La Verkin, Utah) to take residential house plans from intake through estimating, subcontractor quotes, compliance-gated purchase orders, electronic signatures (DocuSeal), and live job-cost budget handoff.

## Workspace Structure

- `packages/shared` (`@interstate/shared`) — 81 text cost codes across 11 classifications, RBAC role matrix, compliance & budget business rules, Zod validation schemas.
- `apps/api` (`@interstate/api`) — Fastify REST API, Drizzle ORM + Neon Postgres schema & versioned migrations, `warehouse` reporting schema, append-only audit log, AES-256-GCM W-9 TIN encryption, RFC 6238 TOTP MFA, S3/R2 storage adapter, DocuSeal e-signature adapter, OpenAPI (`/docs`).
- `apps/web` (`@interstate/web`) — Next.js App Router frontend styled with Interstate Homes (`myinterstatehome.com`) branding and operational layout.
- `infra/` — Production Docker Compose (`web`, `api`, `docuseal`), Dockerfiles, and deployment/backup-restore runbook.

## Quick Start (Local Development)

```powershell
npm install
npm run test
npm run typecheck
npm run build
```

Run the API (defaults to `DEMO_MODE=true` when `DATABASE_URL` is unset) and Web UI in separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

- Web UI: `http://localhost:3000`
- API & OpenAPI Swagger docs: `http://localhost:4000/docs`

## Database Migrations & Seeding (Neon Postgres)

```powershell
$env:DATABASE_URL="postgres://..."
npm run db:migrate
npm run db:seed
```
