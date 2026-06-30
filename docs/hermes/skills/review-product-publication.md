# Hermes Skill: Review Product Publication

Use this skill when deciding whether Banco AI can publish product data or use it
in rankings.

## Publication Gate

Hermes may review and report. Hermes must not approve, reject, supersede, or
publish product versions.

Only admin review may move products into public ranking.

## Required Checks

- Public ranking must use only:
  - `status = "approved"`
  - `validTo = null`
- `pending_review`, `rejected`, and `superseded` products must not drive
  user-facing ranking.
- Financial fields requiring evidence:
  - TAE
  - TIN
  - max/min balance
  - duration
  - fees
  - payroll/receipts/card/Bizum requirements
  - permanence
  - cancellation conditions
  - bonuses
- If a product mentions investment, funds, stocks, ETFs, cryptoassets,
  insurance, or structured deposits, classify as blocked/manual review.

## Decision Rules

Use `APPROVED` only when:

- The catalog is internally consistent.
- Real source-derived products needed for launch are approved.
- No regulatory guardrail is bypassed.
- Articles and UI copy avoid personalized advice wording.

Use `CHANGES_REQUIRED` when:

- Pending products materially affect the quality of the public comparison.
- Product type inference is uncertain.
- Evidence is too weak for financial claims.
- The review found copy that implies personalized recommendation.
