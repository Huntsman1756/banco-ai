# Local Development Runbook

1. Copy `.env.example` into `.env`.
2. Install dependencies: `npm install`.
3. Start a local PostgreSQL (or Docker Postgres) and set:
   - `DATABASE_URL=postgres://...@localhost:5432/...` for host app/debug.
   - `DATABASE_URL_LOCAL=postgres://...@localhost:5432/...` for host CLI migrations (`npm run db:migrate`).
   - In Docker, keep `DATABASE_URL=postgres://...@postgres:5432/...` in `.env` so services resolve the internal DNS service name.
4. Generate/migrate schema if DB schema tasks changed:
   - `npm run db:generate`
   - `npm run db:migrate`
5. Run checks:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
6. Start web entrypoint for manual checks:
   - `node dist/entrypoints/web.js`
