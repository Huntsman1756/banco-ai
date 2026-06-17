# Database Migration Runbook

For any schema change:

1. Update `src/db/schema.ts`.
2. Run `npm run db:generate`.
3. Review generated migration.
4. Run migration:
   - host: `npm run db:migrate` (uses `DATABASE_URL_LOCAL` if set, fallback to `DATABASE_URL`)
   - dockerized: `npm run db:migrate:docker`
5. Record migration id in progress log.

Never run migrations against production without snapshot + restore plan.
