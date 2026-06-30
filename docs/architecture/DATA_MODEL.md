# Data Model Summary

The canonical data model is in `docs/specs/2026-06-16-banco-ai-design.md` section 2 and in `src/db/schema.ts`.

Current canonical tables:

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

- `products` is the immutable product identity.
- `product_versions` stores time-variant financial values.
- Only one current approved version exists per product (`valid_to IS NULL AND status = 'approved'`).
- `recommendations` stores user inputs and ranked product payload, and references used disclaimer.
- `audit_log` records operational and review events.
