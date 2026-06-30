# Banco AI - Web-Only Product Comparison Spec

**Date:** 2026-06-18
**Status:** Active
**Version:** 1.4

Banco AI is an informational banking product comparison system for Spanish bank
accounts and deposits. The product is web-only.

## 1. Deployment Target

The primary deployment target is one NaN Cloud App inside a Basic Space:

- 2 vCPU, 4 GiB RAM, 20 GiB disk, 5 pods shared by the Space.
- Build from the repository root `Dockerfile`.
- Expose over HTTP on internal port `3000`.
- Public HTTPS is handled by NaN Cloud.
- The default runtime command starts only the web entrypoint:
  `node --experimental-specifier-resolution=node dist/src/entrypoints/web.js`.

The scheduler is available for local/Docker Compose work, but it is not enabled
in the Basic web App by default. If background scraping becomes necessary in
production, deploy it as a separate non-HTTP worker App with its own resource
budget and the same NAN API limits.

## 2. Active Channels

Active:

- Web interface.
- Web manual condition ingestion.
- Web PDF assistant.
- Local importer scripts committed through GitHub.

Inactive:

- Any chat or bot worker outside the web App.

## 3. Runtime Architecture

```
entrypoints/     -> process start files for web and optional scheduler
web/             -> Hono routes, HTML, API orchestration
domain/          -> pure deterministic rules and calculations
infrastructure/  -> LLM, scraper, PDF, file catalog, optional DB adapters
db/              -> optional PostgreSQL schema and migrations
shared/          -> logger, redaction, shared utilities
data/            -> committed manual catalog and generated local manifests
docs/            -> source material, runbooks, specs, progress
```

Domain code must not import infrastructure, web, entrypoints, DB clients,
filesystem/network clients, Hono, or LLM clients.

## 4. Data Flow

### 4.1 Local Source Onboarding

The operator copies public banking product information into local folders such
as:

- `docs/Cuentas remuneradas SIN condiciones`
- `docs/Cuentas remuneradas CON condiciones`

The local workflow is:

1. Generate a manifest from the folder.
2. Dry-run the import.
3. Import validated candidates into `data/manual-product-conditions.json`.
4. Review/approve records before they can be used in public rankings.
5. Commit the resulting data file and push to GitHub.
6. NaN Cloud rebuilds the Docker image and serves the updated web catalog.

The existing scripts are the canonical path:

```bash
npm run import:conditions:sin
npm run import:conditions:con
npm run import:conditions:pending -- --manifest data/incoming-doc-candidates.json --dry-run
npm run import:conditions:pending -- --manifest data/incoming-doc-candidates.json
```

New product families, such as deposits or payroll accounts, must reuse this
manifest -> dry-run -> pending review -> approval workflow instead of adding a
parallel ingestion path.

### 4.2 Web Manual Ingestion

The web manual ingestion route accepts copied public conditions from a bank
page. The LLM may extract structured fields, but every LLM output must be
validated with Zod before storage or ranking.

Extracted products are staged as `pending_review` unless an explicit approval
step marks them as approved. Pending, rejected, and superseded versions must not
be used in user-facing ranking.

### 4.3 PDF Assistant

The user-facing PDF assistant accepts a PDF and extracts banking conditions for
comparison and explanation.

Rules:

- Validate file type, size, and relevance before extraction.
- Do not log raw PDF text.
- Do not store uploaded PDF content in public paths.
- Keep PDF processing ephemeral on NaN Cloud Basic unless a persistent volume is
  explicitly configured.
- If NAN is saturated, return a controlled queued/429 response.
- The LLM extracts and explains; deterministic code calculates ranking.

Production PDF uploads can answer questions about the document and compare the
detected conditions against approved products, but must not produce personalized
investment advice.

## 5. Product Categories

Allowed MVP categories:

- bank account
- remunerated account
- payroll account
- bank deposit

Blocked categories:

- personalized investment advice
- stocks
- ETFs
- investment funds
- bonds
- structured deposits
- cryptoassets
- insurance
- unknown products

## 6. Recommendation and Ranking Rules

The UI may present:

- comparativa
- ranking
- simulacion
- estimacion
- producto destacado segun criterios introducidos

The UI must not say:

- "te recomiendo contratar"
- "debes contratar"
- "la mejor opcion para ti"
- "asesoramiento personalizado"
- "recomendacion de inversion"

The assistant can ask questions to collect parameters such as amount, product
type, liquidity preference, payroll availability, and whether the user accepts
conditions. It then produces a deterministic ranking based on approved product
data and estimated benefit.

Financial calculations are deterministic. The LLM may extract user parameters
or explain results, but it must not calculate the final ranking.

## 7. LLM Contracts

All internal LLM outputs must be validated with Zod. If validation fails:

1. Retry once with a correction prompt.
2. Retry a second time if needed.
3. If still invalid, store a controlled error state or return a controlled
   blocked response.

NAN model usage:

- Builder/planner: `qwen3.6`.
- Reviewer: `gemma4`.
- Max API-key concurrency: 3 requests.
- Max requests per minute: 60.
- Max tokens per minute per model: 1.5M.

All application calls to NAN must go through
`src/infrastructure/llm/client.ts`.

## 8. Optional PostgreSQL Model

The web App can run from the committed file-backed catalog for the Basic Space
MVP. PostgreSQL remains available for local development, durable review
workflows, and future production upgrades.

Canonical tables:

- users
- sources
- scrape_runs
- products
- product_versions
- uploaded_documents
- disclaimers
- recommendations
- audit_log

Critical constraints:

- `products` is immutable product identity.
- `product_versions` stores time-variant financial values.
- Public ranking reads only approved current versions:
  `status = 'approved' AND valid_to IS NULL`.
- `recommendations` stores user input, ranked payload, regulatory classification,
  block state, and shown disclaimer.
- `audit_log` stores admin/review events.

## 9. Security and Privacy

Never log:

- raw PDF text
- full prompts containing personal data
- IBAN
- DNI/NIE
- email
- phone numbers
- uploaded document content

All logs must pass through `src/shared/logger.ts`.

Secrets are configured in NaN Cloud environment variables. `.env` is local only
and must never be committed.

## 10. NaN Cloud Basic Operating Mode

Recommended Basic deployment:

- One HTTP App named for the web surface.
- Expose over HTTP: enabled.
- Port: `3000`.
- Replicas: 1 while using the in-process NAN limiter.
- CPU/RAM: start with the NaN default 500m CPU / 500 MiB RAM; increase only if
  metrics require it.
- Persistent storage: off for the initial MVP. Enable it only when uploads or
  scrape artifacts must survive rebuilds.
- Environment: use `.env.nan.example` as the variable checklist.

If more than one replica or worker shares the same NAN API key, add a central
gateway or distributed limiter before scaling.

## 11. Definition of Done

A task is complete only when:

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test` passes.
- Schema tasks also run `npm run db:generate` and `npm run db:migrate`.
- Docker tasks also run `docker compose config` and a build/up smoke.
- Gemma4 review has no blockers.
- Progress is appended to `docs/progress/YYYY-MM-DD.md`.
