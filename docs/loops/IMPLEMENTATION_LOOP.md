# Implementation Loop

Banco AI is implemented through autonomous loops.

The agent must not wait for a new human prompt if `.agent/queue.json` and current phase define the next task.

## Loop input

Read tasks from `.agent/queue.json`.

Task format:

```json
{
  "id": "F-3-T01",
  "phase": "F-3",
  "title": "Implement deterministic deposit ranking",
  "status": "pending",
  "depends_on": ["F-2"],
  "files_expected": ["src/domain/recommender.ts", "tests/recommender.test.ts"],
  "acceptance": ["deterministic output", "no infra imports", "tests updated"]
}
```

## Standard loop

1. Load next task from `.agent/queue.json`.
2. Confirm dependencies are complete.
3. Read relevant spec section.
4. Inspect current files.
5. Implement smallest complete change.
6. Run checks:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
7. Generate `.agent/review-packet.md`.
8. Run Gemma4 review.
9. Fix blockers first.
10. Rerun full checks.
11. Mark task complete.
12. Append progress log to `docs/progress/YYYY-MM-DD.md`.

## Repair loop

If checks fail:

1. inspect failing output and identify root cause;
2. apply minimal fix;
3. rerun failed command;
4. rerun full checks.

Maximum repair loops per task: 3.

If still failing after 3 repair loops, write `.agent/failure-report.md` and stop.

## Completion criteria

A task is complete only when:

- acceptance criteria met
- typecheck passes
- lint passes
- tests pass
- Gemma4 review has no blockers
- progress log written
