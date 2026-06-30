# Acceptance Criteria (Repository-wide)

1. Domain code is deterministic and has no infra/network/DB/LLM imports.
2. LLM responses used for business logic are validated with Zod.
3. No ranking uses product versions with `status != 'approved'` or `valid_to != NULL`.
4. Investment-related intents are never converted into recommendations.
5. Personal and uploaded content are redacted from logs.
6. Web flows pass through the regulator + recommender paths.
7. Scraper creates `pending_review` changes and never auto-approves financial fields.
8. Each task completes with:
   - checks passing (typecheck, lint, test),
   - Gemma4 review packet generated,
   - progress log appended in `docs/progress`.
