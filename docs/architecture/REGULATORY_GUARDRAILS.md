# Regulatory Guardrails

Banco AI is an informational banking product comparator.

It must not provide personalized investment advice.

## Allowed MVP categories

- bank_account
- remunerated_account
- payroll_account
- bank_deposit

## Blocked categories

- stock
- etf
- investment_fund
- structured_deposit
- bond
- cryptoasset
- insurance
- personalized_investment_advice
- unknown

## Required pipeline

Every user message must pass:

1. redaction
2. regulatory classification (`classifyUserIntent`)
3. if blocked: return refusal or educational-only path
4. if allowed: continue comparison flow with deterministic ranking

No route or background worker may bypass this sequence.

## Decision output from regulatory classification

`src/domain/regulatory.ts` currently returns:

- `category`: one of the categories listed above
- `blocked`: boolean
- `reason`: short explanation
- `safeResponseMode`:
  - normal_banking_comparison
  - refuse_personalized_advice
  - educational_only
  - manual_review

## UI language

Allowed language:

- comparativa
- ranking
- simulacion
- estimacion
- producto destacado segun criterios

Forbidden language:

- te recomiendo contratar
- debes contratar
- mejor opcion para ti
- asesoramiento personalizado
- recomendacion de inversion
