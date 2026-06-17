# Scraper Runbook

- Keep scraper requests within 30 seconds timeout.
- Use per-domain rate limit of one request every 5 seconds.
- Respect `robots.txt` per source.
- Store raw evidence text in non-public paths.
- Convert financial deltas to `product_versions` with `status='pending_review'`.
- Never auto-approve financial fields in MVP.
