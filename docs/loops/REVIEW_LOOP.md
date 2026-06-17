# Review Loop — Gemma4

Gemma4 is the constrained reviewer. It evaluates only the current task, its acceptance criteria, and `AGENTS.md` alignment.

## Review packet format

Builder must generate `.agent/review-packet.md` with:

- task id/title
- changed files
- commands run and outputs
- diff summary
- acceptance criteria
- evidence points
- spec alignment
- focused review checklist

## Reviewer model constraints

- model: `gemma4`
- temperature: `0.2`
- top_p: `0.9`
- max concurrent calls: `1`

## Review result format

Gemma4 must output:

```
# Review Result

## Decision

APPROVED | CHANGES_REQUIRED

## Blockers

- ...

## Should fix

- ...

## Nits

- ...

## Evidence

- file:line

## Final recommendation
...
```

## Finding taxonomy

`BLOCKER`, `SHOULD_FIX`, `NIT`, `QUESTION`.

Only `BLOCKER` prevents completion.

## Mandatory blockers

- domain imports infrastructure
- ranking depends on raw LLM output
- missing Zod validation for LLM JSON
- missing or bypassed investment blocking
- pending product versions used in recommendation output
- unsafe logging of personal data
- missing tests for domain changes
- invalid schema references or failed migrations
- scraper auto-approves financial changes

If `CHANGES_REQUIRED`, builder applies blockers, reruns checks, and re-requests review. Max 3 review loops.
