# ADR-0001 — Layered Architecture and Loop Governance

## Status

Accepted

## Context

Banco AI needs deterministic business logic and strict regulatory controls while still integrating multiple interaction surfaces.

## Decision

Use a layered architecture:

- `src/domain/` pure and deterministic,
- `src/infrastructure/` for adapters,
- `src/web/` and `src/entrypoints/` as orchestrators.

Execution is driven by `.agent/queue.json`, `docs/loops/IMPLEMENTATION_LOOP.md`, and `docs/loops/REVIEW_LOOP.md`.

## Consequences

- Predictable reviews and progression by task.
- Regulatory controls can be validated in one place.
- Domain remains testable and independent of infra.
