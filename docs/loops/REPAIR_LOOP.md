# Repair Loop

The repair loop is only for deterministic fixes when checks fail.

## Scope

Only the failing task and related minimal modules.

## Steps

1. Read failing command output from the last attempt.
2. Classify root cause:
   - compile/type errors
   - lint violations
   - test regressions
   - review blockers
3. Apply the smallest fix that addresses the root cause.
4. Rerun the failing command.
5. Rerun complete checks from `AGENTS.md`.

## Limits

Maximum 3 repair loops per task.

## Stop condition

After 3 failed loops without progress, write `.agent/failure-report.md` and stop.
