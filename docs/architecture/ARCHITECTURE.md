# Architecture

Banco AI is separated by responsibility layers:

- `src/entrypoints/`: process entry files (web, scheduler).
- `src/web/`: HTTP route orchestration and presentation layer.
- `src/domain/`: pure, deterministic business logic and rules.
- `src/infrastructure/`: adapters (LLM, storage, network, scraping).
- `src/db/`: schema, migration tooling, DB bootstrap.
- `src/shared/`: cross-cutting types, config, logging, redaction.

The rule is strict:

- Domain cannot import infrastructure, web, entrypoints, DB clients, network, filesystem, or LLM clients.
- The same domain functions are used by web routes and background jobs and must be deterministic.

Requests flow:

1. Entrypoint receives request.
2. Regulatory intent is classified and blocked where needed.
3. Validated domain recomputation is performed.
4. LLM is optionally used for explanation generation only after JSON validation.
5. Results are logged and auditable.

Deployment follows a single image with two active run modes:

- `node dist/entrypoints/web.js`
- `node dist/entrypoints/scheduler.js`
