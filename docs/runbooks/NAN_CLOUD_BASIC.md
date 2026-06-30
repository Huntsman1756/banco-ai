# NaN Cloud Basic Runbook

This is the production target for the current MVP.

## Resource Assumptions

- Basic Space: 2 vCPU, 4 GiB RAM, 20 GiB disk, 5 pods.
- One HTTP web App by default.
- Default per-App resources are acceptable for the first MVP.
- One replica only while the NAN limiter is process-local.

## App Configuration

- Connect the GitHub repository.
- Select the deployment branch.
- Dockerfile path: `Dockerfile`.
- Expose over HTTP: yes.
- Port: `3000`.
- Persistent volume: off initially.

## Runtime Mode

The App starts:

```bash
node --experimental-specifier-resolution=node dist/src/entrypoints/web.js
```

The scheduler is not started in the web App. If needed later, create a separate
non-HTTP worker App and keep total NAN limits within the API-key budget.

## Data Strategy

For the Basic MVP, public product data is shipped with the image:

- `data/manual-product-conditions.json`
- `src/data/manual-product-catalog.seed.ts`

Local source documents and generated manifests can be committed when useful, but
the ranking surface reads approved records only.

PDF uploads are processed ephemerally unless a persistent volume is enabled.
Never log raw PDF text or full prompts.

## Required Checks Before Deploy

```bash
npm run typecheck
npm run lint
npm test
docker build -t banco-ai-web .
```

If schema changed:

```bash
npm run db:generate
npm run db:migrate
```

## Local NAN Credentials

Local development can read NAN credentials from `opencode.json` as a fallback
when `NAN_API_KEY` is not set. Production should use NaN Cloud environment
variables instead.

Never commit `opencode.json`, API keys, or endpoint secrets.
