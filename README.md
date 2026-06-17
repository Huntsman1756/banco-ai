# Banco AI

Banco AI is a deterministic banking product comparison system with:

- Web interface (Hono + HTMX)
- Telegram bot (grammY)
- Product ranking over approved versions only
- Regulatory guardrails against investment advice
- PDF document upload and comparison pipeline
- Scraper with manual review

## Running locally

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Run checks:

```bash
npm run typecheck
npm run lint
npm test
```

## Working mode

This repository is driven by `.agent/queue.json` and the loop documentation in `docs/loops/*`.

Task selection and progression are controlled by state files in `.agent/`.

## Deployment to NaN Cloud

### 1) App deploy (HTTP)

1. Select the branch you want to deploy (for example `main`).
2. In NaN Cloud, create/connect your `Space` and create an App.
3. Connect this GitHub repo and repository branch.
4. Use `Dockerfile` at repository root.
5. Enable `Expose over HTTP` and set port `3000`.
6. Set environment variables in NaN Cloud (`build/env`), especially:

```bash
NODE_ENV=production
PORT=3000
OPENAI_BASE_URL=https://api.nan.builders/v1
NAN_MODEL=qwen3.6
```

Optional vars in runtime:

- `OPENAI_API_KEY` (production secret)
- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN` (if Telegram worker is launched in another app)

The `/health` endpoint is available for readiness checks.

### 2) Note on repository artifacts

`data/scrape/` is ignored in git and `node_modules/`/`dist/` are not committed, so the image is built cleanly from source every deploy.
