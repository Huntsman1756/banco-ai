# Banco AI

Banco AI is a web-only informational banking product comparison system.

It supports:

- Web interface with deterministic ranking.
- Manual ingestion of public bank-account/deposit conditions.
- PDF assistant for reviewing banking conditions.
- Product ranking over approved versions only.
- Regulatory guardrails against investment advice.
- Optional scraper/manual review workflows.

It runs as a single web App.

## Local Workflow

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

## Manual Product Data

Public bank information copied into `docs/Cuentas remuneradas ...` is converted
into product candidates with:

```bash
npm run import:conditions:sin
npm run import:conditions:con
npm run import:conditions:pending -- --manifest data/incoming-doc-candidates.json --dry-run
npm run import:conditions:pending -- --manifest data/incoming-doc-candidates.json
```

The deployed web App reads the committed catalog at:

```text
data/manual-product-conditions.json
```

The normal publishing flow is:

1. Add/copy source information locally.
2. Generate/import candidates.
3. Review and approve what should be public.
4. Commit the updated data file.
5. Push to GitHub so NaN Cloud rebuilds the App.

## Deployment to NaN Cloud Basic

Create one HTTP App in your Space:

- Repository: this GitHub repo.
- Dockerfile: `Dockerfile` at repository root.
- Expose over HTTP: enabled.
- Port: `3000`.
- Replicas: `1` while using the in-process NAN limiter.
- Start without persistent storage for the initial MVP.
- Use `.env.nan.example` as the environment variable checklist.

Required runtime secrets:

```bash
NAN_API_KEY=...
SESSION_SECRET=...
ADMIN_REVIEW_TOKEN=...
```

Optional:

```bash
DATABASE_URL=...
```

Leave `DATABASE_URL` empty on Basic if the first production version should run
from the file-backed catalog only.

For local development, the LLM client can fall back to an `opencode.json`
provider configuration if `NAN_API_KEY` is not set. Do not commit that file.

Health check:

```text
/health
```

## Working Mode

This repository is driven by `.agent/queue.json` and the loop documentation in
`docs/loops/*`.
