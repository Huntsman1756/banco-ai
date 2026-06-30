# Hermes Skill: Read Bank Source Corpus

Use this skill when reviewing copied bank pages, local PDFs, generated
manifests, or catalog data before publication.

## Reading Order

1. Read `AGENTS.md` and `docs/specs/2026-06-16-banco-ai-design.md`.
2. Read `docs/runbooks/CONDITIONS_PIPELINE.md`.
3. Inspect source folders only by metadata and short excerpts:
   - `docs/Cuentas remuneradas SIN condiciones`
   - `docs/Cuentas remuneradas CON condiciones`
4. Inspect generated manifests:
   - `data/incoming-doc-candidates.json`
   - `data/incoming-doc-candidates-con-cond.json`
5. Inspect the committed catalog:
   - `data/manual-product-conditions.json`

## Rules

- Never approve a product from copied text or PDF extraction alone.
- Treat extracted products as `pending_review` until explicit admin review.
- Count products by `status`, `productKind`, and bank before deciding.
- Check whether real user-provided bank products are still pending.
- Consider `approved` seed/demo products insufficient for public launch if real
  source-derived products remain mostly pending.
- Do not include raw PDF text or copied long source text in the review output.
- Use source paths and short evidence descriptions, not full document content.

## Fail-Closed Conditions

Return `CHANGES_REQUIRED` if:

- Any product with financial fields lacks evidence.
- Most real source-derived products are `pending_review`.
- The catalog includes obvious malformed bank/product names.
- A PDF could not be read and there is no manual fallback.
- The public ranking would be based mainly on demo/seed products.
