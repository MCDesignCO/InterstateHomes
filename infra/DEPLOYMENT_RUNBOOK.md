# Interstate Homes — Infrastructure Setup, Deployment & Turnover Runbook

Covers SOW Sections 10, 12, and 14 (independent deployment from Git and backup/restore verification).

## 1. Infrastructure Setup Checklist (Interstate Homes Accounts)

1. **Application Server (Test + Prod):** Ubuntu 24.04 LTS VM (4 vCPU, 8 GB RAM, 80 GB SSD) with Docker Engine + Docker Compose v2 and Caddy/Nginx TLS reverse proxy.
2. **Database (Neon Postgres, US Region):** Create `interstate-prod` and `interstate-test` branches in a US region (e.g., `aws-us-west-2`). Copy pooled connection strings to `DATABASE_URL`.
3. **US Document Storage (Cloudflare R2 or AWS S3):** Create private bucket `interstate-homes-docs` in US region with public access blocked and CORS restricted to the web app origin.
4. **Outbound Email:** Verify `interstatehomes.com` SPF/DKIM/DMARC records in Postmark or Resend (`EMAIL_FROM=estimating@interstatehomes.com`).
5. **DocuSeal (Self-Hosted):** Included in `infra/docker-compose.yml` on port `3001`; copy generated API key to `DOCUSEAL_API_KEY`.

## 2. Deploy from Git

```bash
git clone <INTERSTATE_GIT_REPO_URL> interstate-homes
cd interstate-homes
cp .env.example .env
# Populate DATABASE_URL, APP_ENCRYPTION_KEY, SESSION_SECRET, S3_*, DOCUSEAL_API_KEY
docker compose -f infra/docker-compose.yml up -d --build
```

Apply database migrations and seed the 81 cost codes:

```bash
docker compose -f infra/docker-compose.yml exec api npm run db:migrate --workspace=@interstate/api
docker compose -f infra/docker-compose.yml exec api npm run db:seed --workspace=@interstate/api
```

## 3. Rollback Procedure

```bash
git checkout <PREVIOUS_TAG_OR_COMMIT>
docker compose -f infra/docker-compose.yml up -d --build
```

## 4. Database Backup & Restore Verification (Section 14 Turnover Test)

1. Enable Neon Point-in-Time Recovery (PITR) or run `pg_dump "$DATABASE_URL" -Fc -f backup.dump`.
2. Create a clean test branch/database and restore: `pg_restore --clean --no-owner -d "$TEST_DATABASE_URL" backup.dump`.
3. Run `npm run db:migrate` against the restored database and verify `GET /api/cost-codes` returns 81 codes and `job_cost_budgets` row counts match.

## 5. Key Rotation

- Rotate `SESSION_SECRET` (invalidates active sessions cleanly).
- Rotate `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` and `DOCUSEAL_API_KEY` in `.env` and run `docker compose -f infra/docker-compose.yml up -d`.
- Note: Rotating `APP_ENCRYPTION_KEY` requires running a re-encryption script over `compliance_documents.w9_tin_encrypted` and `users.mfa_secret_encrypted`.
