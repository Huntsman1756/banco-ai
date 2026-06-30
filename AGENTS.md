# AGENTS.md — Banco AI

## Canonical source

The canonical product specification is:

`docs/specs/2026-06-16-banco-ai-design.md`

Before implementing anything, read:

1. `AGENTS.md`
2. `docs/specs/2026-06-16-banco-ai-design.md`
3. `docs/plans/IMPLEMENTATION_PLAN.md`
4. `docs/loops/IMPLEMENTATION_LOOP.md`
5. `docs/loops/REVIEW_LOOP.md`
6. `docs/architecture/REGULATORY_GUARDRAILS.md`
7. `docs/architecture/SECURITY.md`

Priority order if there is conflict:

1. `AGENTS.md`
2. `docs/specs/2026-06-16-banco-ai-design.md`
3. `docs/plans/IMPLEMENTATION_PLAN.md`
4. `docs/architecture/*`
5. `docs/loops/*`
6. existing code

## Project goal

Build Banco AI as an informational banking product comparison system.

The MVP includes:

- bank accounts
- remunerated accounts
- payroll accounts
- bank deposits
- deterministic banking product ranking
- regulatory blocking for investment-advice intents
- web interface
- PDF comparison
- scraper with manual review
- admin dashboard

The MVP must not provide personalized investment advice.

## Non-negotiable rules

### Domain purity

Files in `src/domain/` must never import from:

- `src/infrastructure/`
- `src/web/`
- `src/entrypoints/`
- Hono
- database clients
- filesystem/network clients
- LLM clients

Domain code must be pure, deterministic, and unit-testable.

### Financial calculations

Financial calculations must be deterministic.

LLM may extract user parameters or explain results, but must not calculate financial results or ranking.

Ranking is computed by `src/domain/recommender.ts` and must only use approved product versions.

### Regulatory guardrails

All user messages must pass regulatory classification before any recommendation/comparison.

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

Allowed MVP categories:

- bank account
- remunerated account
- payroll account
- bank deposit

UI copy must use: comparison, ranking, simulation, estimated benefit.

UI must not state:

- “I recommend you contract X”
- “The best option for you is X”
- “You should move your money to X”
- “personalized advice”
- “investment recommendation”

### LLM output validation

All internal LLM output must be validated with Zod.

If validation fails:

1. retry once with correction prompt
2. retry a second time if needed
3. if still invalid, stop that task and store a controlled error state

Never use unvalidated JSON from LLM for business logic.

### Data privacy

Never log:

- raw PDF text
- full prompts containing personal data
- IBAN
- DNI/NIE
- email
- phone numbers
- uploaded document content

All logs must pass through `src/shared/logger.ts`.

### Product versions

The recommender must only read:

`product_versions WHERE status = 'approved' AND valid_to IS NULL`

Pending, rejected, or superseded versions must never be used in user-facing comparisons.

### Scraper constraints

The scraper must:

- respect robots.txt
- use identifiable User-Agent
- use timeout of 30 seconds
- rate-limit to one request per 5 seconds per domain
- store raw text evidence
- create `pending_review` versions for financial changes
- never auto-approve financial fields in MVP

### Execution model

The project is implemented in loops using `.agent/queue.json`.

For each task:

1. load next available task
2. confirm dependencies
3. inspect current code
4. implement smallest complete change
5. run formatting/typecheck/lint/tests
6. generate review packet
7. run Gemma4 review
8. apply required fixes
9. write progress log
10. mark task complete

## When the agent may stop

The agent may stop only when one of these is true:

- required secrets are missing
- external account/API token is required
- regulatory/legal ambiguity
- tests fail after 3 repair loops
- implementation would violate this document
- a required file is unavailable
- the current phase is complete

Do not stop to ask for structure decisions if the spec already defines them.

## Required commands before task completion

```bash
npm run typecheck
npm run lint
npm test
```

If a task touches database schema, also run:

```bash
npm run db:generate
npm run db:migrate
```

If a task touches Docker, also run:

```bash
docker compose config
docker compose up --build
```

## Channel scope

Banco AI is web-only. Do not add bot runtimes, bot SDKs, bot-specific
environment variables, or bot loop tasks without a new explicit scope decision,
new queue tasks, and a database migration.

## Review model

Use `gemma4` as constrained reviewer.

Review focus:

- spec compliance
- regulatory and security rules
- domain boundary violations
- missing tests
- unvalidated LLM output
- financial logic
- schema or migration issues

## Builder model

Use `qwen3.6` as builder/planner.

Use `qwen3-embedding` for semantic retrieval over docs and code.

## Loop and model limits

Per task:

- max implementation loops: 3
- max repair loops: 3
- max changed files without review: 12
- max diff before mandatory review: 800 lines
- max concurrent LLM calls: 3
- max requests per minute per key: 60
- max tokens per minute per model: 1.5M
- builder model: `qwen3.6` (35B MoE, 3B active, FP8, 256K context)
- reviewer model: `gemma4` (26B MoE, 4B active, FP8, 256K context)
- reviewer concurrency: 1
- builder concurrency: 2
- default NAN sampling baseline: `temperature=0.6`, `top_p=0.95`

If limits are hit, split task into smaller tasks.

For unattended overnight Hermes loops, do not run whole-repo reviews, large PDF
batches, or more than 3 total concurrent NAN calls. Stop and checkpoint rather
than queueing work that would exceed the API-key or per-model budgets.

All NAN API calls, including user-facing PDF/manual extraction, must go through
`src/infrastructure/llm/client.ts` so the shared limiter can enforce
concurrency, RPM, TPM, queue size, and queue timeout. Do not call NAN directly
from routes, background workers, scrapers, or ad hoc scripts.

## Progress logs

After each task append:

`docs/progress/YYYY-MM-DD.md`

Include:

- task id
- files changed
- commands run
- review result
- unresolved risks
- next task
