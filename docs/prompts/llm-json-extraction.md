# LLM JSON Contracts and Retry Policy

Esta plantilla define los contratos de salida JSON que validará el dominio de Banco AI.
Todo output para lógica interna debe validar contra estos contratos antes de cualquier uso de negocio.

## 1) Contratos esperados

### ExtractedProductSchema

```typescript
z.object({
  product_name: z.string(),
  product_kind: z.enum(["cuenta_remunerada", "cuenta_nomina", "deposito"]),
  tae: z.number().nullable(),
  tin: z.number().nullable(),
  max_balance: z.number().nullable(),
  min_balance: z.number().nullable(),
  duration_months: z.number().nullable(),
  bonus_amount: z.number().nullable(),
  permanencia: z.string().nullable(),
  fees: z.array(z.object({ name: z.string(), amount: z.number(), period: z.enum(["monthly", "yearly", "one_time"]) })),
  requirements: z.object({ nomina: z.boolean(), recibos: z.boolean(), tarjeta: z.boolean(), bizum: z.boolean(), plan_pago: z.boolean(), inversion: z.boolean() }),
  cancellation_fees: z.array(z.string()).nullable(),
  evidence: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      unit: z.string().optional(),
      evidence: z.string(),
      source_url: z.string().url().optional(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  confidence: z.number().min(0).max(1),
  page_summary: z.string().optional(),
})
```

### ExtractedUserProfileSchema

```typescript
z.object({
  objetivo: z.enum(["ahorro", "nomina", "alta_rentabilidad"]),
  capital: z.number().positive(),
  liquidez: z.enum(["inmediata", "plazo_fijo"]).optional(),
  vinculacion: z.enum(["sin_condiciones", "con_condiciones", "indiferente"]),
  iban: z.enum(["es", "global"]).optional(),
  horizonte: z.enum(["corto", "medio", "largo"]).optional(),
  ingresos_mensuales: z.number().optional(),
  raw_input_redacted: z.string(),
})
```

### ExtractedPdfConditionsSchema

```typescript
z.object({
  bank: z.string(),
  product_name: z.string(),
  product_kind: z.enum(["cuenta_remunerada", "cuenta_nomina", "deposito", "desconocido"]),
  tae: z.number().nullable(),
  tin: z.number().nullable(),
  max_balance: z.number().nullable(),
  min_balance: z.number().nullable(),
  duration_months: z.number().nullable(),
  bonus_amount: z.number().nullable(),
  permanencia: z.string().nullable(),
  fees: z.array(z.object({ name: z.string(), amount: z.number(), period: z.string() })),
  requirements: z.object({ nomina: z.boolean(), recibos: z.boolean() }),
  clauses_warnings: z.array(z.string()),
  raw_text_excerpts: z.array(z.string()),
})
```

### RecommendationExplanationSchema

```typescript
z.object({
  summary: z.string(),
  top_picks: z.array(z.object({
    bank: z.string(),
    product: z.string(),
    position: z.number(),
    benefit: z.number(),
    why: z.string(),
    risks: z.array(z.string()).optional(),
  })),
  comparisons: z
    .array(z.object({ product_a: z.string(), product_b: z.string(), difference: z.string() }))
    .optional(),
  disclaimer: z.string(),
})
```

### RegulatoryIntentSchema

```typescript
z.object({
  category: z.enum([
    "banking_comparison",
    "financial_education",
    "general_investment_recommendation",
    "personalized_investment_advice",
    "cryptoasset_discussion",
    "promotion_or_affiliate",
    "unknown",
  ]),
  allowed: z.boolean(),
  reason: z.string(),
  safe_response_mode: z.enum(["normal_banking_comparison", "educational_only", "refuse_personalized_advice", "manual_review"]),
})
```

## 2) Política de salida

- Emitir SOLO JSON (sin texto plano, sin Markdown, sin notas).
- No inventar campos no solicitados.
- No explicar ni justificar; la explicación se genera en otro paso.
- `null` para valores numéricos desconocidos.
- Si no hay evidencia textual en un campo, no rellenar ese campo con valor ficticio.

## 3) Política de validación y reintentos

- Toda salida JSON se valida con Zod por contrato en `src/domain/financial-engine.ts` mediante `validateLlmJson`.
- Flujo de reintento ante error:
  1. Intento inicial + validación Zod.
  2. Si falla, segundo intento usando prompt de corrección.
  3. Si falla otra vez, tercer intento con corrección reforzada.
  4. Si falla de nuevo, no usar esa salida para lógica de negocio y cerrar el flujo en estado `pending_review`.
- Límite de intento configurable por contrato:
  - `MAX_LLM_OUTPUT_RETRY_COUNT = 2`.
  - Reintentos máximos admitidos: 2 (3 intentos en total).
- Límite de entrada previa al LLM para documentos: `MAX_LLM_INPUT_CHARACTERS = 100000`.

## 4) Prompt de corrección sugerido

```text
La salida anterior no cumple el contrato especificado. Responde SOLO con JSON válido,
con exactamente la misma estructura. No añadir texto adicional.
```
