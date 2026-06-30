# Implementation Plan

## Current phase

F-11 COMPLETE

## Phase order

1. F-1 Scaffolding ✅
2. F-2 Shared infrastructure ✅
3. F-3 Financial engine ✅
4. F-4 Regulatory domain ✅
5. F-5 LLM infrastructure ✅
6. F-6 Recommender domain ✅
7. F-7 Web ✅
8. F-8 Scraper ✅
9. F-9 PDF ✅
10. F-10 Admin ✅
11. F-11 Hardening ✅

## All phases complete

Banco AI MVP is feature-complete. All phases F-1 through F-11 have been implemented.

## Remaining work

- Production deployment to NaN Cloud
- Database migration files (run `npm run db:generate` + `npm run db:migrate`)
- Docker security hardening (non-root user, health checks, restart policies)
- CSRF protection for admin endpoints
- Rate limiting for public endpoints
- Test coverage expansion

## Phase order

1. F-1 Scaffolding
2. F-2 Shared infrastructure
3. F-3 Financial engine
4. F-4 Regulatory domain
5. F-5 LLM infrastructure
6. F-6 Recommender domain
7. F-7 Web
8. F-8 Scraper
9. F-9 PDF
10. F-10 Admin
11. F-11 Hardening

## Per-phase execution rules

- Do not skip phases unless all dependencies are complete.
- Never implement UI before domain + regulatory modules exist.
- One task per iteration, one clear acceptance criteria set per task.
- Any schema changes require `db:generate` and `db:migrate` commands.

## Phase gates

- F-1 requires the repo structure and loop docs.
- F-3 requires F-1 and F-2.
- F-4 requires F-2.
- F-5 requires F-2.
- F-6 requires F-3 and F-4.
- F-7 requires F-4, F-5, F-6.
- F-8 requires F-5.
- F-9 requires F-5 and F-7.
- F-10 requires F-7.
- F-11 requires all prior phases complete.
