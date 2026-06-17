# Banco AI — Financial Assistant Spec

**Date:** 2026-06-16
**Status:** Final (pre-implementation)
**Version:** 1.3

---

## 1. Architecture Overview

### 1.1 Containers (docker-compose)

```yaml
services:
  web:        # Hono + HTMX — servidor web con sesiones, chat, admin, upload
  telegram:   # grammY worker — long polling, recibe mensajes y responde
  scheduler:  # loop interno con pg_try_advisory_lock — scraping periódico
  postgres:   # PostgreSQL 16 — única fuente de verdad
```

Misma imagen Docker, tres entrypoints distintos:
- `node dist/entrypoints/web.js`
- `node dist/entrypoints/telegram.js`
- `node dist/entrypoints/scheduler.js`

Healthcheck por contenedor. Backup de PostgreSQL vía script ops o docker-compose cron.

### 1.2 Capas

```
entrypoints/     → orquestan, sin lógica de negocio
web/             → rutas Hono, middleware, vistas HTML
domain/          → lógica pura, sin I/O, testeable
infrastructure/  → I/O: LLM, scraper, Telegram, PDF, storage
db/              → schema Drizzle, cliente, migraciones
shared/          → tipos, config (Zod), logger con redacción
```

Regla de dependencia: `domain/` nunca importa `infrastructure/`. `entrypoints/` y `web/` orquestan ambas.

### 1.3 Entrypoints

| Entrypoint | Proceso | Puerto |
|---|---|---|
| `web.ts` | Hono server | 3000 |
| `telegram.ts` | grammY long polling | — |
| `scheduler.ts` | Loop con jitter + advisory lock | — |

Cada uno arranca solo lo que necesita, pero comparten el mismo pool de DB y módulos.

---

## 2. Modelo de Datos

### 2.1 `users`

```sql
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  role            TEXT DEFAULT 'user',       -- 'user' | 'admin'
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 `telegram_users`

```sql
CREATE TABLE telegram_users (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id),
  telegram_id     BIGINT UNIQUE NOT NULL,
  chat_id         BIGINT NOT NULL,
  username        TEXT,
  first_name      TEXT,
  last_name       TEXT,
  is_admin        BOOLEAN DEFAULT false,
  linked_at       TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 `sources`

```sql
CREATE TABLE sources (
  id                SERIAL PRIMARY KEY,
  bank_name         TEXT NOT NULL,
  product_family    TEXT NOT NULL,
  url               TEXT NOT NULL,
  scrape_strategy   TEXT DEFAULT 'fetch',
  active            BOOLEAN DEFAULT true,
  last_success_at   TIMESTAMPTZ,
  last_error_at     TIMESTAMPTZ,
  last_error_msg    TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 `scrape_runs`

```sql
CREATE TABLE scrape_runs (
  id              SERIAL PRIMARY KEY,
  source_id       INT REFERENCES sources(id),
  status          TEXT NOT NULL,             -- 'running' | 'success' | 'error'
  raw_text_path   TEXT,
  extracted_json  JSONB,
  confidence      NUMERIC(4,3),
  error           TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ
);
```

### 2.5 `products`

```sql
CREATE TABLE products (
  id                    SERIAL PRIMARY KEY,
  source_id             INT REFERENCES sources(id),
  bank                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL,           -- 'cuenta_remunerada' | 'deposito' | 'cuenta_nomina'
  regulatory_category   TEXT NOT NULL DEFAULT 'unknown',
  supervisor            TEXT,                    -- 'bde' | 'cnmv' | 'dgsfp' | 'unknown'
  is_investment_instrument BOOLEAN DEFAULT false,
  is_cryptoasset        BOOLEAN DEFAULT false,
  fgd_covered           BOOLEAN,
  risk_level            TEXT,
  affiliate_url         TEXT,
  has_commercial_relationship BOOLEAN DEFAULT false,
  commercial_disclosure TEXT,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bank, name, kind)
);
```

### 2.6 `product_versions`

```sql
CREATE TABLE product_versions (
  id                SERIAL PRIMARY KEY,
  product_id        INT REFERENCES products(id),
  valid_from        TIMESTAMPTZ NOT NULL,
  valid_to          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'pending_review',
  -- 'pending_review' | 'approved' | 'rejected' | 'superseded'
  tae               NUMERIC(6,3),
  tin               NUMERIC(6,3),
  max_balance       NUMERIC(12,2),
  min_balance       NUMERIC(12,2),
  fees_json         JSONB,
  requirements_json JSONB,
  duration_months   INT,
  bonus_amount      NUMERIC(10,2),
  permanencia       TEXT,
  cancellation_fees JSONB,
  evidence_json     JSONB NOT NULL,
  source_scrape_id  INT REFERENCES scrape_runs(id),
  approved_by       INT REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_by       INT REFERENCES users(id),
  rejected_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX product_versions_one_current_approved
ON product_versions(product_id)
WHERE valid_to IS NULL AND status = 'approved';
```

### 2.7 `uploaded_documents`

```sql
CREATE TABLE uploaded_documents (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id),
  original_name   TEXT NOT NULL,
  stored_path     TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  page_count      INT,
  status          TEXT DEFAULT 'pending',
  extracted_json  JSONB,
  comparison_json JSONB,
  report_text     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
```

### 2.8 `disclaimers`

```sql
CREATE TABLE disclaimers (
  id              SERIAL PRIMARY KEY,
  version         INT NOT NULL,
  context         TEXT NOT NULL,             -- 'banking' | 'investment' | 'crypto' | 'general'
  text            TEXT NOT NULL,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(version, context)
);
```

### 2.9 `recommendations`

```sql
CREATE TABLE recommendations (
  id                        SERIAL PRIMARY KEY,
  user_id                   INT REFERENCES users(id),
  telegram_chat_id          BIGINT,
  input_json                JSONB NOT NULL,
  ranked_products_json      JSONB NOT NULL,
  assumptions_json          JSONB,
  regulatory_category       TEXT NOT NULL DEFAULT 'banking_comparison',
  blocked                   BOOLEAN DEFAULT false,
  block_reason              TEXT,
  disclaimer_id             INT REFERENCES disclaimers(id),
  commercial_disclosure_shown BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now()
);
```

### 2.10 `audit_log`

```sql
CREATE TABLE audit_log (
  id              SERIAL PRIMARY KEY,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       INT,
  payload_json    JSONB,
  actor           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Contratos Zod del LLM

### 3.1 `ExtractedProductSchema`

```typescript
const ExtractedProductSchema = z.object({
  product_name: z.string(),
  product_kind: z.enum(['cuenta_remunerada', 'cuenta_nomina', 'deposito']),
  tae: z.number().nullable(),
  tin: z.number().nullable(),
  max_balance: z.number().nullable(),
  min_balance: z.number().nullable(),
  duration_months: z.number().nullable(),
  bonus_amount: z.number().nullable(),
  permanencia: z.string().nullable(),
  fees: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    period: z.enum(['monthly', 'yearly', 'one_time'])
  })),
  requirements: z.object({
    nomina: z.boolean(),
    recibos: z.boolean(),
    tarjeta: z.boolean(),
    bizum: z.boolean(),
    plan_pago: z.boolean(),
    inversion: z.boolean()
  }),
  cancellation_fees: z.array(z.string()).nullable(),
  evidence: z.array(z.object({
    field: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    evidence: z.string(),
    source_url: z.string().url().optional(),
    confidence: z.number().min(0).max(1)
  })),
  confidence: z.number().min(0).max(1),
  page_summary: z.string().optional()
});
```

### 3.2 `ExtractedUserProfileSchema`

```typescript
const ExtractedUserProfileSchema = z.object({
  objetivo: z.enum(['ahorro', 'nomina', 'alta_rentabilidad']),
  capital: z.number().positive(),
  liquidez: z.enum(['inmediata', 'plazo_fijo']).optional(),
  vinculacion: z.enum(['sin_condiciones', 'con_condiciones', 'indiferente']),
  iban: z.enum(['es', 'global']).optional(),
  horizonte: z.enum(['corto', 'medio', 'largo']).optional(),
  ingresos_mensuales: z.number().optional(),
  raw_input_redacted: z.string()
});
```

### 3.3 `ExtractedPdfConditionsSchema`

```typescript
const ExtractedPdfConditionsSchema = z.object({
  bank: z.string(),
  product_name: z.string(),
  product_kind: z.enum(['cuenta_remunerada', 'cuenta_nomina', 'deposito', 'desconocido']),
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
  raw_text_excerpts: z.array(z.string())
});
```

### 3.4 `RecommendationExplanationSchema`

```typescript
const RecommendationExplanationSchema = z.object({
  summary: z.string(),
  top_picks: z.array(z.object({
    bank: z.string(),
    product: z.string(),
    position: z.number(),
    benefit: z.number(),
    why: z.string(),
    risks: z.array(z.string()).optional()
  })),
  comparisons: z.array(z.object({
    product_a: z.string(),
    product_b: z.string(),
    difference: z.string()
  })).optional(),
  disclaimer: z.string()
});
```

### 3.5 `RegulatoryIntentSchema`

```typescript
const RegulatoryIntentSchema = z.object({
  category: z.enum([
    'banking_comparison',
    'financial_education',
    'general_investment_recommendation',
    'personalized_investment_advice',
    'cryptoasset_discussion',
    'promotion_or_affiliate',
    'unknown'
  ]),
  allowed: z.boolean(),
  reason: z.string(),
  safe_response_mode: z.enum([
    'normal_banking_comparison',
    'educational_only',
    'refuse_personalized_advice',
    'manual_review'
  ])
});
```

### 3.6 `RegulatoryCategory`

```typescript
type RegulatoryCategory =
  | 'bank_account'
  | 'bank_deposit'
  | 'structured_deposit'
  | 'investment_fund'
  | 'etf'
  | 'stock'
  | 'bond'
  | 'cryptoasset'
  | 'insurance'
  | 'unknown';
```

### 3.7 Reglas de validación de output LLM

Todo output del LLM para lógica interna pasa por Zod. Si falla → retry con prompt de corrección (máx 2). Si sigue fallando → error controlado, `pending_review`.

Límite de entrada: 100K caracteres por documento antes de enviar al LLM (truncar si excede).

---

## 4. Flujos

### 4.1 Web — Chat

```
GET /login → formulario → POST /login → sesión httpOnly + secure + sameSite
GET /chat → vista HTMX con historial
POST /chat → { mensaje: "recomiéndame una cuenta con 20000€..." }
  → redactar datos sensibles en input
  → clasificar intención regulatoria (RegulatoryIntentSchema)
  → si blocked → responder mensaje de bloqueo + guardar recommendation con blocked=true
  → si allowed:
      → LLM extrae parámetros (ExtractedUserProfileSchema)
      → domain/recommender calcula top 5 con Financial Engine
         (solo product_versions WHERE status = 'approved' AND valid_to IS NULL)
      → LLM genera explicación (RecommendationExplanationSchema)
      → guarda recommendation
      → responde HTML (HTMX swap)
```

### 4.2 Web — Upload PDF

```
GET /upload → formulario
POST /upload → multipart → validar tamaño (max 20MB) y páginas (max 50)
  → SHA-256 → check duplicado
  → guardar en /data/uploads/<hash>.pdf (fuera de public/)
  → PDF digital: extracción con pdf.js
  → PDF escaneado: OCR con tesseract.js o visión LLM
  → límite de 100K chars antes de enviar al LLM
  → LLM extrae condiciones (ExtractedPdfConditionsSchema)
  → clasificar regulatory_category del producto
  → domain/documents compara vs productos en DB
  → LLM genera informe con disclaimer según categoría
  → cola de borrado a los 30 días
  → responde HTML con informe + tabla comparativa
```

### 4.3 Telegram — Recomendación

```
/menu → botón "Comparar" → usuario escribe condiciones → mismo flujo que web
```

### 4.4 Telegram — PDF

El usuario envía un PDF por chat. Mismo pipeline que web. Responde con informe como texto formateado.

### 4.5 Scraper

```
Cada 6 horas (con jitter aleatorio ±30min):
  for each source in sources WHERE active:
    lock = SELECT pg_try_advisory_lock(1, source.id);  -- namespace 1 = scrape
    if !lock → skip
    fetch URL (timeout 30s, user-agent identificable, 1 req/5s por dominio)
    → guardar raw_text en /data/scrapes/<run_id>.txt
    → LLM extrae producto (ExtractedProductSchema)
    → guardar scrape_run
    → comparar con última product_version vigente (status = 'approved', valid_to IS NULL)
    → si hay cambios en campos financieros → crear product_version con status = 'pending_review'
    → si no hay cambios → actualizar last_success_at
    release lock
```

Retention: `/data/scrapes/` se limpia cada 90 días. `/data/uploads/` a los 30 días (borrado lógico con `deleted_at`).

Criterio `robots.txt`: el scraper respeta `robots.txt` y tiene rate limit de 1 req/5s por dominio.

---

## 5. Reglas de Validación Financiera

### 5.1 Campos que nunca se autoaprueban (MVP)

Cualquier variación detectada en estos campos genera `pending_review`:

- TAE
- TIN
- Plazo / duración
- Saldo máximo remunerado
- Saldo mínimo
- Comisiones (cualquier tipo)
- Requisitos de nómina
- Recibos domiciliados
- Tarjeta (obligatoria / no)
- Bizum
- Permanencia
- Penalización por cancelación
- Bonificaciones
- Condiciones de cancelación

### 5.2 Deltas en puntos básicos

```
< 5 bps      → registrar, no alertar
5–15 bps     → pending_review
≥ 15 bps     → alerta admin + pending_review
```

### 5.3 Evidencia requerida

Cada campo extraído debe incluir `evidence` textual que lo justifique. Sin `evidence`, el campo no puede aprobarse (ni siquiera por admin sin revisar el scrape original). `source_url` se hereda de `sources.url` si no se especifica por campo.

### 5.4 Flujo de aprobación de versión

Cuando admin aprueba una `product_version` pendiente:
1. Cerrar `valid_to` de la versión vigente anterior (status → `superseded`)
2. Poner `status = 'approved'` y `valid_to = NULL` en la nueva
3. Escribir `audit_log`

### 5.5 Financial Engine determinista

El cálculo de beneficio anual (`calculateFirstYearReturn`) es código puro, sin LLM. El LLM solo extrae parámetros del usuario y explica resultados. El ranking es determinista.

`domain/recommender` solo consulta `product_versions WHERE status = 'approved' AND valid_to IS NULL`.

---

## 6. Guardrails Regulatorios CNMV / Banco de España

### 6.1 Clasificación obligatoria del producto

Cada producto en DB lleva una categoría regulatoria que determina qué puede hacer el sistema con él.

Para el MVP:

| Categoría | Permitido | Comportamiento |
|---|---|---|
| `bank_account` | Sí | Comparativa normal |
| `bank_deposit` | Sí | Comparativa normal |
| `structured_deposit` | No | Bloquear + mensaje educativo |
| `investment_fund` | No | Bloquear + derivar a entidad autorizada |
| `etf` | No | Bloquear |
| `stock` | No | Bloquear |
| `bond` | No | Bloquear |
| `cryptoasset` | No | Bloquear + advertencia MiCA |
| `insurance` | No | Bloquear |
| `unknown` | No | Bloquear |

### 6.2 Clasificador de intención antes de responder

Todo mensaje de usuario pasa por `RegulatoryIntentSchema` antes de cualquier otra lógica:

```
POST /chat
  → redactar datos sensibles
  → clasificar intención regulatoria
  → si banking_comparison → continuar
  → si personalized_investment_advice → bloquear
  → si general_investment_recommendation → solo educativo + disclaimer reforzado
  → si cryptoasset_discussion → advertencia + no recomendación
  → si promotion_or_affiliate → marcar como promocional
```

**Ejemplos de bloqueo:**
- "Tengo 20.000€, ¿qué acciones compro?"
- "¿Me conviene comprar Nvidia hoy?"
- "Dime qué ETF contratar para mi perfil"
- "Crea una cartera para mí"
- "¿Compro Bitcoin ahora?"

Respuesta estándar de bloqueo:
> No puedo prestarte asesoramiento personalizado sobre instrumentos financieros. Puedo explicarte conceptos generales y criterios que podrías revisar, pero no indicarte qué instrumento concreto contratar. Para asesoramiento personalizado, acude a una entidad autorizada.

**Ejemplos permitidos:**
- "Explícame qué es una cuenta remunerada"
- "Compara cuentas remuneradas con 20.000€"
- "Calcula cuánto daría un depósito al 2,5% TAE"
- "Qué significa TAE"

### 6.3 Lenguaje de la interfaz

Prohibido en UI y respuestas del LLM:
- "Te recomiendo contratar X"
- "La mejor opción para ti es X"
- "Debes mover tu dinero a X"
- "asesor financiero", "asesoramiento personalizado", "recomendación de inversión"

Permitido:
- "Según los datos introducidos, esta comparativa ordena los productos por rentabilidad estimada"
- "Producto con mayor beneficio estimado bajo los supuestos indicados"
- "comparador", "ranking", "simulación", "estimación", "producto destacado según criterios introducidos"

Internamente el módulo puede llamarse `recommender.ts`, pero en UI y documentación se usa "comparador" o "ranking".

### 6.4 Disclaimers por contexto

| Contexto | Texto |
|---|---|
| `banking` | Esto es una comparativa informativa de productos bancarios basada en los datos introducidos y en las condiciones disponibles. No garantiza la contratación ni sustituye la revisión de la documentación oficial de la entidad. |
| `investment` | Esto no constituye asesoramiento de inversión ni una recomendación personalizada sobre instrumentos financieros. Para recibir asesoramiento personalizado debes acudir a una entidad autorizada. |
| `crypto` | Los criptoactivos son productos de alto riesgo, pueden sufrir pérdidas significativas o totales y no cuentan necesariamente con las mismas protecciones que otros productos financieros regulados. |
| `general` | Esta información tiene carácter divulgativo y no constituye asesoramiento financiero personalizado. |

### 6.5 Conflictos de interés y afiliación

- Cada producto en DB tiene `has_commercial_relationship` y `commercial_disclosure`
- En cada resultado se muestra: "Relación comercial: sí/no" + "Criterio de ordenación: rentabilidad estimada"
- Un patrocinio no puede alterar el ranking sin etiqueta visible
- `recommendations.commercial_disclosure_shown` registra si se mostró

### 6.6 Trazabilidad

Cada recomendación guarda:
- `regulatory_category` (cómo se clasificó la consulta)
- `blocked` y `block_reason` (si se bloqueó)
- `disclaimer_id` (qué disclaimer se mostró)
- `commercial_disclosure_shown` (si aplica)

---

## 7. Seguridad

### 7.1 Web

- Sesiones: httpOnly + secure + sameSite=Strict
- CSRF token en todos los POST vía middleware Hono
- Rate limiting: 30 req/min por IP (web), 20 req/min por chat_id (Telegram)
- Roles: `user` y `admin`
- Login: email + bcrypt, sesión en cookie firmada

### 7.2 Telegram

- Admin validado por `telegram_user_id` numérico, no por username
- Lista blanca de admins en `ADMIN_TELEGRAM_IDS` (env) o `telegram_users.is_admin`
- Comandos admin solo visibles si el user_id está en la lista blanca

### 7.3 PDFs

- Tamaño máximo: 20 MB
- Páginas máximas: 50
- Límite de 100K caracteres de entrada al LLM
- Almacenamiento fuera de `public/`
- Hash SHA-256 para detectar duplicados
- Borrado automático tras 30 días
- No loguear contenido del PDF ni prompts con datos extraídos
- Logs redactados: IBAN, DNI, email, teléfono → `[REDACTED]`

### 7.4 Secretos

- `NAN_API_KEY`, `SESSION_SECRET`, `ADMIN_TELEGRAM_IDS` solo por env
- `.env` nunca se commitea
- Base de datos no expuesta al exterior (solo red interna Docker)

---

## 8. Logging

- Logger estructurado (pino)
- Niveles: debug, info, warn, error
- Redactar automáticamente patrones: IBAN (`ES\d{22}`), DNI, email, teléfono
- No loguear prompts completos si contienen datos personales
- `audit_log` para acciones críticas desde F-2 (scrape, producto update, login admin, upload)

---

## 9. Disclaimer Legal — Visualización

- **Web:** al pie del chat, al pie del upload PDF, al pie de cada resultado de comparativa. El disclaimer concreto depende del `context` del producto: `banking`, `investment`, `crypto` o `general`.
- **Telegram:** al final de cada respuesta, tras cada comparativa. Misma lógica de contexto.
- Se almacenan en DB `disclaimers` para trazabilidad por versión y contexto.

---

## 10. MVP vs Post-MVP

### MVP (alcance de esta implementación)

- Web + Telegram funcionando
- Comparativa conversacional con extracción LLM de parámetros
- Ranking determinista con Financial Engine
- Clasificador regulatorio de intención + bloqueo de asesoramiento no permitido
- Scraping periódico con revisión manual (todo cambio financiero → pending_review)
- Subida de PDFs con extracción y comparación
- Admin dashboard mínimo (ver scrape_runs, aprobar/rechazar cambios, ver productos)
- Autenticación web con sesiones
- Disclaimers por contexto (banking, investment, crypto, general)
- Disclosure de relaciones comerciales
- Logging con redacción desde el inicio

### Post-MVP (explícitamente fuera del alcance ahora)

- Auto-approve limitado para fuentes muy estables
- OCR avanzado con modelos de visión
- Notificaciones push/email de cambios detectados
- Múltiples proveedores LLM (Ollama, OpenAI, OpenRouter)
- Colas Redis / worker pool si escala
- Múltiples idiomas

---

## 11. Estructura de Directorios

```
banco-ai/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── entrypoints/
│   │   ├── web.ts
│   │   ├── telegram.ts
│   │   └── scheduler.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── domain/
│   │   ├── financial-engine.ts
│   │   ├── recommender.ts
│   │   ├── products.ts
│   │   ├── documents.ts
│   │   └── regulatory.ts         # Clasificador + reglas regulatorias
│   ├── infrastructure/
│   │   ├── llm/
│   │   │   ├── client.ts
│   │   │   ├── schemas.ts
│   │   │   └── prompts.ts
│   │   ├── scraper/
│   │   │   ├── fetcher.ts
│   │   │   └── normalizer.ts
│   │   ├── pdf/
│   │   │   ├── extract-text.ts
│   │   │   ├── ocr.ts
│   │   │   └── sanitize.ts
│   │   ├── telegram/
│   │   │   ├── bot.ts
│   │   │   ├── auth.ts
│   │   │   └── handlers/
│   │   │       ├── start.ts
│   │   │       ├── recommend.ts
│   │   │       ├── pdf.ts
│   │   │       └── admin.ts
│   │   └── storage/
│   │       └── files.ts
│   ├── web/
│   │   ├── app.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── chat.ts
│   │   │   ├── admin.ts
│   │   │   └── upload.ts
│   │   ├── views/
│   │   │   ├── layout.ts
│   │   │   ├── login.ts
│   │   │   ├── chat.ts
│   │   │   ├── upload.ts
│   │   │   └── admin.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── csrf.ts
│   └── shared/
│       ├── types.ts
│       ├── config.ts
│       └── logger.ts
├── data/
│   ├── uploads/
│   ├── scrapes/
│   └── entities.yml
└── tests/
    ├── financial-engine.test.ts
    ├── recommender.test.ts
    ├── pdf-analyzer.test.ts
    └── regulatory.test.ts
```

---

## 12. Plan de Implementación por Fases

| Fase | Contenido | Definition of Done | Depende de |
|------|-----------|--------------------|------------|
| **F-1** | Scaffolding: `package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, Drizzle schema + client + migrations | `docker compose up` arranca sin errores, migraciones aplicadas | — |
| **F-2** | `shared/`: config con Zod, logger con redacción, tipos base. Seed de `disclaimers` en DB. `audit_log` hook base | Logger redacta IBAN/DNI/email en test unitario | F-1 |
| **F-3** | `domain/financial-engine.ts`: adaptar `calculateFirstYearReturn` desde mejorcuenta. Tests unitarios | `npm test` pasa casos conocidos (depósito 2.5%, cuenta con límite, nómina con bonificación) | F-2 |
| **F-4** | `domain/regulatory.ts`: taxonomía, clasificador de intención, reglas de bloqueo. Tests | Clasifica correctamente "qué acciones compro" (blocked) vs "compara cuentas" (allowed) | F-2 |
| **F-5** | `infrastructure/llm/`: client OpenAI-compatible (nan.builders), schemas Zod, prompts base | Test de integración opcional, al menos tipos compilan | F-2 |
| **F-6** | `domain/recommender.ts`: lógica de ranking + integración con Financial Engine. Tests | Ranking reprodu浮ible con datos de prueba | F-3 |
| **F-7** | `web/`: Hono app, auth (sesiones + bcrypt + CSRF), vistas chat con HTMX, integración con classifier + recommender + LLM | Login funcional, chat responde comparativa bancaria, bloquea asesoramiento de inversión | F-4, F-5, F-6 |
| **F-8** | Telegram: bot grammY, handlers (start, recommend, admin), auth por telegram_id, disclaimers | Bot responde /start, acepta consultas, bloquea inversión, muestra disclaimer | F-4, F-5, F-6 |
| **F-9** | `infrastructure/scraper/`: fetcher, normalizer, scheduler con advisory lock. Seed de `sources` | `node dist/entrypoints/scheduler.js` scrapea una URL real, detecta cambio y crea `pending_review` | F-5 |
| **F-10** | `infrastructure/pdf/`: extract-text, ocr, sanitize. `web/upload`: subida + pipeline + informe | Subir PDF de condiciones extrae TAE y compara contra DB | F-5, F-7 |
| **F-11** | `web/admin`: dashboard (ver scrape_runs, aprobar/rechazar product_versions, ver productos + relaciones comerciales) | Admin logueado puede ver pendientes y aprobar/rechazar | F-9 |
| **F-12** | Endurecimiento final: rate limits, retention policies, healthchecks Docker, backup script, `robots.txt`, verify `robots.txt` compliance | `docker compose ps` muestra todos healthy, backup script exporta DB | F-11 |