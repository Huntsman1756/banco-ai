# Deploy to VPS Runbook

1. Pull commit and confirm clean HEAD.
2. Copy required secrets in environment file (never commit `.env`).
3. Run:
   - `docker compose build`
   - `docker compose config`
   - `docker compose up -d`
4. Confirm service health endpoints.
5. Confirm scraper and scheduler can start.
6. Check logs for errors and run a small smoke request through web and telegram entrypoints.
