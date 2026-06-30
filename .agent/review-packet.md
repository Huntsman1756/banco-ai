# Review Packet

## Task

Task id: OPS-ADMIN-REVIEW-UI-01
Phase: operations / product review
Title: Add web admin review UI for pending banking products

## Acceptance criteria

- Pending product versions can be reviewed from the web app without curl.
- Admin token is not embedded in HTML and is stored only in browser session storage.
- Admin UI lists pending products with financial fields, source/evidence count, and notes.
- Admin UI can call existing approve/reject endpoints.
- File-backed local catalog review works when no DB connection is configured.
- The HTTP entrypoint forwards request bodies for POST routes.
- No products are approved or rejected automatically.

## Files changed

- `src/web/index.ts`
- `src/entrypoints/web.ts`
- `src/infrastructure/products/catalog-store.ts`
- `docs/runbooks/CONDITIONS_PIPELINE.md`
- `.agent/review-packet.md`

## Commands run and outputs

- `npm run typecheck`
  - passed
- `npm run lint`
  - passed
- `npm test`
  - passed, 9 files / 25 tests
- HTTP smoke on `PORT=3173`
  - `/health`: 200
  - `/?tab=admin`: 200
  - admin panel marker present: true
  - `GET /api/admin/conditions/pending` with test token: 200
  - pending count from local JSON: 16
  - `POST /api/assistant/recommend` structured body: 200
  - assistant parsed objective: `rentabilidad`
  - no approve/reject POST executed

## Diff summary

- Added `Admin` tab and panel to the web UI.
- Added browser-side pending review loading, note capture, approve/reject actions, and token clearing.
- Kept admin token local to `sessionStorage`.
- Fixed the Node HTTP entrypoint to pass request bodies to Hono for non-GET/HEAD routes.
- Added local file fallback for listing, approving, and rejecting `pending_review` records when no DB is active.
- Documented the web admin flow and local JSON fallback in the conditions pipeline runbook.

## Evidence points

- Local source catalog contains 16 `pending_review` records before and after smoke.
- Smoke only used `GET` pending and structured assistant `POST`; no product review decision was mutated.
- The user-facing recommender still reads approved current products only.
- DB path still uses the existing transaction-based approve/reject functions.

## Spec alignment

- Keeps web-only scope.
- Keeps financial ranking deterministic.
- Keeps pending products out of ranking until explicitly approved.
- Keeps secrets out of static HTML and repository files.
- Keeps NAN calls behind the shared client; this task did not add direct NAN calls.

## Focused review checklist

- BLOCKER: admin token exposed in rendered HTML, logs, or repository files.
- BLOCKER: pending products appear in user-facing ranking before approval.
- BLOCKER: approve/reject mutates data without admin auth.
- BLOCKER: local file fallback bypasses `pending_review` gating.
- BLOCKER: request body forwarding logs uploaded PDF text or personal data.
