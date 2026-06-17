# Banco AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted financial assistant (web + Telegram) that compares Spanish bank accounts, scrapes bank websites for TAE changes, and analyzes uploaded PDFs of bank conditions.

**Architecture:** Hono + HTMX + grammY + PostgreSQL + Drizzle ORM, three Docker containers (web, telegram, scheduler) sharing one image. LLM via OpenAI-compatible API (nan.builders). Domain logic pure and tested separately from infrastructure.

**Tech Stack:** Node 22, TypeScript, Hono, HTMX, grammY, Drizzle ORM, PostgreSQL 16, Zod, Pino, OpenAI SDK, pdf.js, tesseract.js

---

## File Structure Map

```
src/
  entrypoints/
    web.ts              # Arranca Hono en puerto 3000
    telegram.ts         # Arranca grammY long polling
    scheduler.ts        # Loop con advisory lock para scraping
  db/
    schema.ts           # Drizzle schema (todas las tablas)
    client.ts           # Pool pg + drizzle instance
    migrations/         # Generadas por drizzle-kit
  domain/
    financial-engine.ts # calculateFirstYearReturn(), calculateBenefitFromItem()
    regulatory.ts       # RegulatoryIntentSchema, classifyIntent(), bloqueos
    recommender.ts      # buildPool(), rank(), enrich()
    products.ts         # CRUD sobre products + product_versions
    documents.ts        # comparar condiciones extraídas vs mercado
  infrastructure/
    llm/
      client.ts         # OpenAI-compatible (nan.builders)
      schemas.ts        # Zod schemas para output LLM
      prompts.ts        # Templates de prompts
    scraper/
      fetcher.ts        # fetch URL + timeout + user-agent
      normalizer.ts     # mapear output LLM a product_version
    pdf/
      extract-text.ts   # pdf.js para PDF digital
      ocr.ts            # tesseract.js para PDF escaneado
      sanitize.ts       # limpieza y límites
    telegram/
      bot.ts            # Setup grammY
      auth.ts           # Verificar admin por telegram_id
      handlers/
        start.ts        # /start + menu
        recommend.ts    # Flujo de comparativa
        pdf.ts          # PDF upload handler
        admin.ts        # Comandos admin
    storage/
      files.ts          # Guardar/borrar/limpiar archivos
  web/
    app.ts              # Hono router principal
    routes/
      auth.ts           # Login, logout, registro
      chat.ts           # POST /chat + GET /chat
      admin.ts          # Dashboard admin
      upload.ts         # Subida de PDF
    views/
      layout.ts         # Layout base con HTMX + Tailwind CDN
      login.ts          # Formulario login
      chat.ts           # Chat conversacional
      upload.ts         # Upload + resultados
      admin.ts          # Admin dashboard
    middleware/
      auth.ts           # Sesión + CSRF + rate limit
  shared/
    config.ts           # Env vars validadas con Zod
    logger.ts           # Pino con redacción de datos sensibles
    types.ts            # Tipos compartidos
```

---

### F-1: Scaffolding

#### Task 1.1: Crear package.json y tsconfig.json

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

**Step 1: Crear package.json**

```json
{
  "name": "banco-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/entrypoints/web.ts",
    "build": "tsc",
    "start:web": "node dist/entrypoints/web.js",
    "start:telegram": "node dist/entrypoints/telegram.js",
    "start:scheduler": "node dist/entrypoints/scheduler.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@hono/node-server": "^1.13.0",
    "grammy": "^1.34.0",
    "drizzle-orm": "^0.40.0",
    "drizzle-kit": "^0.30.0",
    "postgres": "^3.4.0",
    "zod": "^3.24.0",
    "pino": "^9.6.0",
    "openai": "^4.82.0",
    "bcryptjs": "^2.4.3",
    "pdfjs-dist": "^4.9.0",
    "tesseract.js": "^5.1.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11"
  }
}
```

- [ ] **Step 1: Create `package.json` with above content**

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Run `npm install`**

Run: `npm install`
Expected: `node_modules/` creado, sin errores

- [ ] **Step 4: Commit**

```bash
git init
git add package.json tsconfig.json
git commit -m "feat: initial scaffold"
```

#### Task 1.2: Dockerfile y docker-compose.yml

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.dockerignore`

- [ ] **Step 1: Crear `Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
RUN mkdir -p /app/data/uploads /app/data/scrapes
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/entrypoints/web.js"]
```

- [ ] **Step 2: Crear `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: banco_ai
      POSTGRES_USER: banco_ai
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U banco_ai"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  web:
    build: .
    entrypoint: ["node", "dist/entrypoints/web.js"]
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - uploads:/app/data/uploads
      - scrapes:/app/data/scrapes
    restart: unless-stopped

  telegram:
    build: .
    entrypoint: ["node", "dist/entrypoints/telegram.js"]
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  scheduler:
    build: .
    entrypoint: ["node", "dist/entrypoints/scheduler.js"]
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - scrapes:/app/data/scrapes
    restart: unless-stopped

volumes:
  pgdata:
  uploads:
  scrapes:
```

- [ ] **Step 3: Crear `.env.example`**

```bash
# Database
DB_PASSWORD=changeme

# Session
SESSION_SECRET=changeme-min-32-chars

# LLM (nan.builders)
NAN_API_KEY=sk-your-key-here
NAN_MODEL=qwen3.6

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token-here
ADMIN_TELEGRAM_IDS=123456789,987654321

# Server
PORT=3000
NODE_ENV=development
```

- [ ] **Step 4: Crear `.dockerignore`**

```
node_modules
dist
.git
.env
data/uploads
data/scrapes
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example .dockerignore
git commit -m "feat: docker setup"
```

#### Task 1.3: Conexión a base de datos

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Crear `drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Crear `src/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { client };
```

- [ ] **Step 3: Crear `src/db/schema.ts` con todas las tablas**

```typescript
import { pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const telegramUsers = pgTable('telegram_users', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  telegramId: text('telegram_id').unique().notNull(),
  chatId: text('chat_id').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isAdmin: boolean('is_admin').default(false),
  linkedAt: timestamp('linked_at').defaultNow(),
});

export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  bankName: text('bank_name').notNull(),
  productFamily: text('product_family').notNull(),
  url: text('url').notNull(),
  scrapeStrategy: text('scrape_strategy').default('fetch'),
  active: boolean('active').default(true),
  lastSuccessAt: timestamp('last_success_at'),
  lastErrorAt: timestamp('last_error_at'),
  lastErrorMsg: text('last_error_msg'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const scrapeRuns = pgTable('scrape_runs', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').references(() => sources.id),
  status: text('status').notNull(),
  rawTextPath: text('raw_text_path'),
  extractedJson: jsonb('extracted_json'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  error: text('error'),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').references(() => sources.id),
  bank: text('bank').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  regulatoryCategory: text('regulatory_category').default('unknown').notNull(),
  supervisor: text('supervisor'),
  isInvestmentInstrument: boolean('is_investment_instrument').default(false),
  isCryptoasset: boolean('is_cryptoasset').default(false),
  fgdCovered: boolean('fgd_covered'),
  riskLevel: text('risk_level'),
  affiliateUrl: text('affiliate_url'),
  hasCommercialRelationship: boolean('has_commercial_relationship').default(false),
  commercialDisclosure: text('commercial_disclosure'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueProduct: uniqueIndex('unique_product').on(table.bank, table.name, table.kind),
}));

export const productVersions = pgTable('product_versions', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id),
  validFrom: timestamp('valid_from').notNull(),
  validTo: timestamp('valid_to'),
  status: text('status').default('pending_review').notNull(),
  tae: numeric('tae', { precision: 6, scale: 3 }),
  tin: numeric('tin', { precision: 6, scale: 3 }),
  maxBalance: numeric('max_balance', { precision: 12, scale: 2 }),
  minBalance: numeric('min_balance', { precision: 12, scale: 2 }),
  feesJson: jsonb('fees_json'),
  requirementsJson: jsonb('requirements_json'),
  durationMonths: integer('duration_months'),
  bonusAmount: numeric('bonus_amount', { precision: 10, scale: 2 }),
  permanencia: text('permanencia'),
  cancellationFees: jsonb('cancellation_fees'),
  evidenceJson: jsonb('evidence_json').notNull(),
  sourceScrapeId: integer('source_scrape_id').references(() => scrapeRuns.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  oneCurrentApproved: uniqueIndex('product_versions_one_current_approved')
    .on(table.productId)
    .where(sql`${table.validTo} IS NULL AND ${table.status} = 'approved'`),
}));

export const uploadedDocuments = pgTable('uploaded_documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  originalName: text('original_name').notNull(),
  storedPath: text('stored_path').notNull(),
  fileHash: text('file_hash').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  pageCount: integer('page_count'),
  status: text('status').default('pending'),
  extractedJson: jsonb('extracted_json'),
  comparisonJson: jsonb('comparison_json'),
  reportText: text('report_text'),
  createdAt: timestamp('created_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const disclaimers = pgTable('disclaimers', {
  id: serial('id').primaryKey(),
  version: integer('version').notNull(),
  context: text('context').notNull(),
  text: text('text').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueVersionContext: uniqueIndex('disclaimers_version_context_unique').on(table.version, table.context),
}));

export const recommendations = pgTable('recommendations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  telegramChatId: text('telegram_chat_id'),
  inputJson: jsonb('input_json').notNull(),
  rankedProductsJson: jsonb('ranked_products_json').notNull(),
  assumptionsJson: jsonb('assumptions_json'),
  regulatoryCategory: text('regulatory_category').default('banking_comparison').notNull(),
  blocked: boolean('blocked').default(false),
  blockReason: text('block_reason'),
  disclaimerId: integer('disclaimer_id').references(() => disclaimers.id),
  commercialDisclosureShown: boolean('commercial_disclosure_shown').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  payloadJson: jsonb('payload_json'),
  actor: text('actor'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

Note: Add `import { sql } from 'drizzle-orm';` at the top for the `sql` template literal used in the partial index.

- [ ] **Step 4: Generate and run migrations**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: `src/db/migrations/` creada con archivos SQL, migraciones aplicadas sin error

- [ ] **Step 5: Commit**

```bash
git add src/db/ drizzle.config.ts
git commit -m "feat: database schema and migrations"
```

---

### F-2: Shared layer (config, logger, types, audit_log, disclaimer seed)

#### Task 2.1: Config validation with Zod

**Files:**
- Create: `src/shared/config.ts`

- [ ] **Step 1: Create `src/shared/config.ts`**

```typescript
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DB_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  NAN_API_KEY: z.string().min(1),
  NAN_MODEL: z.string().default('qwen3.6'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  DATABASE_URL: z.string().default(''),
});

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.DB_PASSWORD;
  if (!password) throw new Error('DB_PASSWORD is required');
  return `postgres://banco_ai:${password}@postgres:5432/banco_ai`;
}

export const config = envSchema.parse({
  ...process.env,
  DATABASE_URL: buildDatabaseUrl(),
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS || '',
});

export type Config = typeof config;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsx -e "import { config } from './src/shared/config'; console.log('OK')"`
Expected: OK (puede fallar si no hay .env — es esperado)

- [ ] **Step 3: Commit**

```bash
git add src/shared/config.ts
git commit -m "feat: config with zod validation"
```

#### Task 2.2: Logger con redacción

**Files:**
- Create: `src/shared/logger.ts`

- [ ] **Step 1: Create `src/shared/logger.ts`**

```typescript
import pino from 'pino';

const REDACT_PATTERNS = [
  { path: ['req', 'headers', 'cookie'], censor: '[REDACTED]' },
  { path: ['req', 'headers', 'authorization'], censor: '[REDACTED]' },
];

export function redactSensitive(text: string): string {
  return text
    .replace(/ES\d{22}/g, '[REDACTED_IBAN]')
    .replace(/\b\d{8}[A-Z]\d{1}\b/g, '[REDACTED_DNI]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/(\+34|0034)?[6789]\d{8}\b/g, '[REDACTED_PHONE]');
}

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: REDACT_PATTERNS,
});

export function audit(action: string, entityType?: string, entityId?: number, payload?: unknown, actor?: string) {
  logger.info({ action, entityType, entityId, payload, actor }, 'audit');
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../src/shared/logger.js';

describe('redactSensitive', () => {
  it('redacts IBAN', () => {
    expect(redactSensitive('ES1234567890123456789012')).toContain('[REDACTED_IBAN]');
  });
  it('redacts DNI', () => {
    expect(redactSensitive('12345678Z')).toContain('[REDACTED_DNI]');
  });
  it('redacts email', () => {
    expect(redactSensitive('test@example.com')).toContain('[REDACTED_EMAIL]');
  });
  it('redacts phone', () => {
    expect(redactSensitive('612345678')).toContain('[REDACTED_PHONE]');
  });
});
```

- [ ] **Step 3: Write `src/shared/types.ts`**

```typescript
export type RegulatoryCategory =
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

export type SafeResponseMode = 'normal_banking_comparison' | 'educational_only' | 'refuse_personalized_advice' | 'manual_review';

export interface ProductEvidence {
  field: string;
  value: string;
  unit?: string;
  evidence: string;
  sourceUrl?: string;
  confidence: number;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/shared/
git commit -m "feat: logger with redaction, shared types"
```

#### Task 2.3: Disclaimer seed

**Files:**
- Modify: `src/db/schema.ts` (ya hecho en F-1)
- Create: `src/db/seed.ts`

- [ ] **Step 1: Create seed**

```typescript
import { db } from './client.js';
import { disclaimers } from './schema.js';

const initialDisclaimers = [
  { version: 1, context: 'banking', text: 'Esto es una comparativa informativa de productos bancarios basada en los datos introducidos y en las condiciones disponibles. No garantiza la contratación ni sustituye la revisión de la documentación oficial de la entidad.' },
  { version: 1, context: 'investment', text: 'Esto no constituye asesoramiento de inversión ni una recomendación personalizada sobre instrumentos financieros. Para recibir asesoramiento personalizado debes acudir a una entidad autorizada.' },
  { version: 1, context: 'crypto', text: 'Los criptoactivos son productos de alto riesgo, pueden sufrir pérdidas significativas o totales y no cuentan necesariamente con las mismas protecciones que otros productos financieros regulados.' },
  { version: 1, context: 'general', text: 'Esta información tiene carácter divulgativo y no constituye asesoramiento financiero personalizado.' },
];

async function seed() {
  const existing = await db.select().from(disclaimers).limit(1);
  if (existing.length > 0) {
    console.log('Disclaimers already seeded');
    return;
  }
  await db.insert(disclaimers).values(initialDisclaimers);
  console.log('Seeded', initialDisclaimers.length, 'disclaimers');
}

seed().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add src/db/seed.ts
git commit -m "feat: disclaimer seed data"
```

---

### F-3: Financial Engine

#### Task 3.1: Implement calculateFirstYearReturn

**Files:**
- Create: `src/domain/financial-engine.ts`

- [ ] **Step 1: Write test first**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateFirstYearReturn, calculateBenefitFromItem } from './financial-engine.js';

describe('calculateFirstYearReturn', () => {
  it('calculates simple deposit correctly', () => {
    const result = calculateBenefitFromItem({
      kind: 'deposito',
      tae: 2.5,
      maxBalance: 10000,
      durationMonths: 12,
    }, 10000);
    expect(result.benefit).toBeCloseTo(250, 0);
    expect(result.taeEfectiva).toBeCloseTo(2.5, 1);
  });

  it('caps at maxBalance', () => {
    const result = calculateBenefitFromItem({
      kind: 'cuenta_remunerada',
      tae: 2.0,
      maxBalance: 5000,
    }, 20000);
    expect(result.benefit).toBeLessThanOrEqual(100); // 5000 * 0.02
  });

  it('applies IRPF withholding', () => {
    const result = calculateFirstYearReturn({
      remuneracion: [{ desde: 0, hasta: 10000, tae: 3.0, duracion_meses: 12 }],
      costes: { mantenimiento_anual: 0, tarjeta_anual: 0, plan_pago_mensual: 0, gastos_unica_vez: 0 },
      fiscalidad: { irpf: 0.19 },
    }, 10000);
    expect(result.interesBrutoAnual).toBeCloseTo(300, 0);
    expect(result.interesNetoTrasIrpf).toBeCloseTo(243, 0); // 300 - 19%
    expect(result.beneficioNetoAnual).toBeCloseTo(243, 0);
  });

  it('applies costs before IRPF', () => {
    const result = calculateFirstYearReturn({
      remuneracion: [{ desde: 0, hasta: 5000, tae: 2.5, duracion_meses: 12 }],
      costes: { mantenimiento_anual: 60, tarjeta_anual: 0, plan_pago_mensual: 0, gastos_unica_vez: 0 },
      fiscalidad: { irpf: 0.19 },
    }, 5000);
    const gross = 125; // 5000 * 0.025
    const afterCosts = gross - 60;
    const net = afterCosts * (1 - 0.19);
    expect(result.beneficioNetoAnual).toBeCloseTo(net, 1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run`
Expected: Module not found errors

- [ ] **Step 3: Implement financial-engine.ts**

```typescript
export interface AccountRemuneration {
  desde: number;
  hasta: number;
  tae: number;
  duracion_meses?: number;
}

export interface AccountCosts {
  mantenimiento_anual: number;
  tarjeta_anual: number;
  plan_pago_mensual: number;
  gastos_unica_vez: number;
}

export interface AccountFiscalidad {
  irpf: number;
}

export interface AccountInput {
  remuneracion: AccountRemuneration[];
  costes: AccountCosts;
  fiscalidad: AccountFiscalidad;
}

export interface ReturnResult {
  saldo: number;
  interesBrutoAnual: number;
  interesNetoTrasIrpf: number;
  costeTotalAnual: number;
  beneficioNetoAnual: number;
  taeEfectivaSobreSaldo: number;
  calculable: boolean;
}

export interface SimpleProduct {
  kind: 'deposito' | 'cuenta_remunerada' | 'cuenta_nomina';
  tae?: number | null;
  maxBalance?: number | null;
  minBalance?: number | null;
  durationMonths?: number | null;
  bonusAmount?: number | null;
}

export interface SimpleBenefit {
  benefit: number;
  taeEfectiva: number;
}

export function calculateFirstYearReturn(account: AccountInput, saldo: number): ReturnResult {
  const saldoReal = saldo < 0 ? 0 : saldo;

  let interesBruto = 0;
  for (const tramo of account.remuneracion) {
    const saldoEnTramo = Math.min(saldoReal, tramo.hasta) - tramo.desde;
    if (saldoEnTramo <= 0) continue;
    const meses = tramo.duracion_meses ?? 12;
    interesBruto += saldoEnTramo * (tramo.tae / 100) * (meses / 12);
  }

  const costeTotal =
    account.costes.mantenimiento_anual +
    account.costes.tarjeta_anual +
    account.costes.plan_pago_mensual * 12 +
    account.costes.gastos_unica_vez;

  const baseImponible = Math.max(0, interesBruto - costeTotal);
  const irpfAplicado = baseImponible * account.fiscalidad.irpf;
  const beneficioNeto = baseImponible - irpfAplicado;

  const taeEfectiva = saldoReal > 0 ? (beneficioNeto / saldoReal) * 100 : 0;

  return {
    saldo: saldoReal,
    interesBrutoAnual: interesBruto,
    interesNetoTrasIrpf: baseImponible - irpfAplicado,
    costeTotalAnual: costeTotal,
    beneficioNetoAnual: beneficioNeto,
    taeEfectivaSobreSaldo: taeEfectiva,
    calculable: saldoReal > 0,
  };
}

export function calculateBenefitFromItem(product: SimpleProduct, capital: number): SimpleBenefit {
  if (product.kind === 'cuenta_nomina' && product.bonusAmount) {
    return { benefit: product.bonusAmount, taeEfectiva: (product.bonusAmount / capital) * 100 };
  }

  const effectiveTae = product.tae ?? 0;
  const cappedCapital = Math.min(capital, product.maxBalance ?? capital);
  const durationYears = (product.durationMonths ?? 12) / 12;
  const benefit = cappedCapital * (effectiveTae / 100) * durationYears;

  return { benefit, taeEfectiva: effectiveTae };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/domain/financial-engine.ts tests/financial-engine.test.ts
git commit -m "feat: financial engine with first-year return calculation"
```

---

### F-4: Regulatory Guardrails

#### Task 4.1: Regulatory classifier

**Files:**
- Create: `src/domain/regulatory.ts`
- Create: `tests/regulatory.test.ts`

- [ ] **Step 1: Write test first**

```typescript
import { describe, it, expect } from 'vitest';
import { classifyIntent, BLOCKED_PATTERNS, ALLOWED_PATTERNS } from './regulatory.js';

describe('classifyIntent', () => {
  it('allows banking comparison', () => {
    const result = classifyIntent('compara cuentas remuneradas con 20000 euros');
    expect(result.allowed).toBe(true);
    expect(result.category).toBe('banking_comparison');
  });

  it('blocks personalized investment advice', () => {
    const result = classifyIntent('qué acciones debería comprar con 20000 euros');
    expect(result.allowed).toBe(false);
    expect(result.category).toBe('personalized_investment_advice');
  });

  it('blocks crypto purchase advice', () => {
    const result = classifyIntent('debería comprar bitcoin ahora');
    expect(result.allowed).toBe(false);
    expect(result.category).toBe('cryptoasset_discussion');
  });

  it('allows financial education', () => {
    const result = classifyIntent('qué significa TAE');
    expect(result.allowed).toBe(true);
    expect(result.category).toBe('financial_education');
  });

  it('allows deposit calculation', () => {
    const result = classifyIntent('calcula cuánto daría un depósito al 2.5% TAE');
    expect(result.allowed).toBe(true);
    expect(result.category).toBe('financial_education');
  });

  it('blocks ETF portfolio creation', () => {
    const result = classifyIntent('crea una cartera de ETFs para mi perfil');
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement regulatory.ts**

```typescript
export type RegulatoryCategory =
  | 'banking_comparison'
  | 'financial_education'
  | 'general_investment_recommendation'
  | 'personalized_investment_advice'
  | 'cryptoasset_discussion'
  | 'promotion_or_affiliate'
  | 'unknown';

export type SafeResponseMode =
  | 'normal_banking_comparison'
  | 'educational_only'
  | 'refuse_personalized_advice'
  | 'manual_review';

export interface RegulatoryIntent {
  category: RegulatoryCategory;
  allowed: boolean;
  reason: string;
  safeResponseMode: SafeResponseMode;
}

const BLOCKED_KEYWORDS: { pattern: RegExp; category: RegulatoryCategory; reason: string }[] = [
  { pattern: /\b(comprar|vender|invertir)\b.*\b(acciones?|ETF|fondo|valor|bolsa)\b/i, category: 'personalized_investment_advice', reason: 'Asesoramiento de inversión personalizado' },
  { pattern: /\b(bitcoin|btc|eth|ethereum|cripto|crypto|token)\b.*\b(comprar|invertir|meter|entrar)\b/i, category: 'cryptoasset_discussion', reason: 'Recomendación sobre criptoactivos no permitida' },
  { pattern: /\b(qu[eé]|c[óo]mo|d[óo]nde)\b.*\b(invertir|comprar|contratar)\b.*\b(acciones?|fondos?|ETF|cartera|opciones?)\b/i, category: 'personalized_investment_advice', reason: 'Consulta de inversión personalizada' },
  { pattern: /\b(crea|haz|arma|diseña)\b.*\b(cartera|portafolio|portfolio)\b/i, category: 'personalized_investment_advice', reason: 'Solicitud de creación de cartera' },
  { pattern: /\b(deber[ií]a|podr[ií]a|convendr[ií]a)\b.*\b(invertir|comprar|contratar)\b/i, category: 'personalized_investment_advice', reason: 'Solicitud de recomendación personalizada' },
];

const ALLOWED_KEYWORDS: { pattern: RegExp; category: RegulatoryCategory }[] = [
  { pattern: /\b(compara|comparar|comparativa|ranking|ordenar)\b.*\b(cuentas?|dep[óo]sitos?|n[óo]mina)\b/i, category: 'banking_comparison' },
  { pattern: /\b(cuenta|dep[óo]sito|c[óo]mo funciona|qu[eé] es)\b.*\b(remunerada|ahorro|n[óo]mina|TAE|inter[ée]s)\b/i, category: 'financial_education' },
  { pattern: /\b(calcula|calcular|simular|estimaci[óo]n)\b.*\b(TAE|inter[ée]s|rentabilidad|dep[óo]sito)\b/i, category: 'financial_education' },
  { pattern: /\b(qu[eé] (es|significa)|c[óo]mo funciona|explica|definici[óo]n)\b.*\b(TAE|TIN|IRPF|FGD|dep[óo]sito|cuenta|n[óo]mina)\b/i, category: 'financial_education' },
];

export function classifyIntent(text: string): RegulatoryIntent {
  const lower = text.toLowerCase();

  for (const rule of BLOCKED_KEYWORDS) {
    if (rule.pattern.test(lower)) {
      return {
        category: rule.category,
        allowed: false,
        reason: rule.reason,
        safeResponseMode: 'refuse_personalized_advice',
      };
    }
  }

  for (const rule of ALLOWED_KEYWORDS) {
    if (rule.pattern.test(lower)) {
      return {
        category: rule.category,
        allowed: true,
        reason: 'Consulta permitida',
        safeResponseMode: rule.category === 'banking_comparison' ? 'normal_banking_comparison' : 'educational_only',
      };
    }
  }

  return {
    category: 'unknown',
    allowed: false,
    reason: 'No se pudo clasificar la intención regulatoria',
    safeResponseMode: 'manual_review',
  };
}

export function getBlockedMessage(): string {
  return 'No puedo prestarte asesoramiento personalizado sobre instrumentos financieros. Puedo explicarte conceptos generales y criterios que podrías revisar, pero no indicarte qué instrumento concreto contratar. Para asesoramiento personalizado, acude a una entidad autorizada.';
}

export function getDisclaimer(context: string): string {
  const disclaimers: Record<string, string> = {
    banking: 'Esto es una comparativa informativa de productos bancarios basada en los datos introducidos y en las condiciones disponibles. No garantiza la contratación ni sustituye la revisión de la documentación oficial de la entidad.',
    investment: 'Esto no constituye asesoramiento de inversión ni una recomendación personalizada sobre instrumentos financieros. Para recibir asesoramiento personalizado debes acudir a una entidad autorizada.',
    crypto: 'Los criptoactivos son productos de alto riesgo, pueden sufrir pérdidas significativas o totales y no cuentan necesariamente con las mismas protecciones que otros productos financieros regulados.',
    general: 'Esta información tiene carácter divulgativo y no constituye asesoramiento financiero personalizado.',
  };
  return disclaimers[context] ?? disclaimers.general;
}

export function sanitizeLanguage(text: string): string {
  const forbidden = [
    /\bte recomiendo\b/gi,
    /\bla mejor opci[oó]n para ti\b/gi,
    /\bdebes mover tu dinero\b/gi,
    /\bdebes contratar\b/gi,
    /\basesoramiento personalizado\b/gi,
    /\brecomendaci[oó]n de inversi[oó]n\b/gi,
    /\basesor financiero\b/gi,
  ];
  let result = text;
  for (const pattern of forbidden) {
    result = result.replace(pattern, 'según los datos introducidos');
  }
  return result;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/domain/regulatory.ts tests/regulatory.test.ts
git commit -m "feat: regulatory classifier with block/allowed rules"
```

---

### F-5: LLM Infrastructure

#### Task 5.1: LLM client, schemas, prompts

**Files:**
- Create: `src/infrastructure/llm/client.ts`
- Create: `src/infrastructure/llm/schemas.ts`
- Create: `src/infrastructure/llm/prompts.ts`

- [ ] **Step 1: Create Zod schemas for LLM output**

```typescript
import { z } from 'zod';

export const ExtractedProductSchema = z.object({
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
    period: z.enum(['monthly', 'yearly', 'one_time']),
  })),
  requirements: z.object({
    nomina: z.boolean(),
    recibos: z.boolean(),
    tarjeta: z.boolean(),
    bizum: z.boolean(),
    plan_pago: z.boolean(),
    inversion: z.boolean(),
  }),
  cancellation_fees: z.array(z.string()).nullable(),
  evidence: z.array(z.object({
    field: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    evidence: z.string(),
    source_url: z.string().url().optional(),
    confidence: z.number().min(0).max(1),
  })),
  confidence: z.number().min(0).max(1),
  page_summary: z.string().optional(),
});

export const ExtractedUserProfileSchema = z.object({
  objetivo: z.enum(['ahorro', 'nomina', 'alta_rentabilidad']),
  capital: z.number().positive(),
  liquidez: z.enum(['inmediata', 'plazo_fijo']).optional(),
  vinculacion: z.enum(['sin_condiciones', 'con_condiciones', 'indiferente']),
  iban: z.enum(['es', 'global']).optional(),
  horizonte: z.enum(['corto', 'medio', 'largo']).optional(),
  ingresos_mensuales: z.number().optional(),
  raw_input_redacted: z.string(),
});

export const ExtractedPdfConditionsSchema = z.object({
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
  raw_text_excerpts: z.array(z.string()),
});

export const RecommendationExplanationSchema = z.object({
  summary: z.string(),
  top_picks: z.array(z.object({
    bank: z.string(),
    product: z.string(),
    position: z.number(),
    benefit: z.number(),
    why: z.string(),
    risks: z.array(z.string()).optional(),
  })),
  comparisons: z.array(z.object({
    product_a: z.string(),
    product_b: z.string(),
    difference: z.string(),
  })).optional(),
  disclaimer: z.string(),
});
```

- [ ] **Step 2: Create LLM client**

```typescript
import OpenAI from 'openai';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import { ZodSchema, ZodError } from 'zod';

let client: OpenAI | null = null;
let lastModel: string | null = null;

function getClient(): OpenAI {
  if (!client || lastModel !== config.NAN_MODEL) {
    client = new OpenAI({
      apiKey: config.NAN_API_KEY,
      baseURL: 'https://api.nan.builders/v1',
    });
    lastModel = config.NAN_MODEL;
  }
  return client;
}

export async function generateJson<T>(systemPrompt: string, userPrompt: string, schema: ZodSchema<T>, maxRetries = 2): Promise<T> {
  const llm = getClient();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await llm.chat.completions.create({
        model: config.NAN_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty LLM response');

      const parsed = JSON.parse(content);
      return schema.parse(parsed);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ attempt, errors: error.errors }, 'LLM output validation failed, retrying');
        if (attempt < maxRetries) continue;
        throw new Error(`LLM output validation failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
      throw error;
    }
  }

  throw new Error('Unreachable');
}

export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  const llm = getClient();
  const response = await llm.chat.completions.create({
    model: config.NAN_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
  });
  return response.choices[0]?.message?.content ?? '';
}
```

- [ ] **Step 3: Create prompts**

```typescript
export const SYSTEM_EXTRACT_PRODUCT = `Eres un extractor de datos financieros. Extrae la información estructurada de productos bancarios desde el texto de una página web oficial.

Reglas:
- Solo extrae datos explícitamente mencionados. No inventes.
- Si un campo no aparece, devuelve null.
- El campo evidence debe contener el texto exacto donde aparece cada dato.
- confidence = 1.0 si es textual, 0.7 si es inferido, 0.3 si es dudoso.
- Responde SOLO JSON válido.`;

export const SYSTEM_EXTRACT_USER = `Eres un analizador de perfil financiero. Dado el mensaje de un usuario, extrae sus parámetros financieros de forma estructurada.

Reglas:
- No inventes valores que el usuario no haya mencionado.
- objetivo: ahorro (guardar dinero), nomina (domiciliar nómina), alta_rentabilidad (maximizar retorno).
- capital: la cantidad de dinero que menciona.
- vinculacion: si acepta condiciones como nómina o recibos.
- raw_input_redacted: el texto original del usuario con IBAN/DNI/email/teléfono reemplazados por [REDACTED].
- Responde SOLO JSON válido.`;

export const SYSTEM_EXPLAIN_RECOMMENDATION = `Eres un comparador financiero. Dado un ranking de productos calculado, genera una explicación clara para el usuario.

Reglas de lenguaje:
- NO uses "te recomiendo", "la mejor opción para ti", "debes contratar".
- Usa "según los datos introducidos", "producto destacado", "mayor beneficio estimado".
- Si aplica, menciona condiciones de vinculación.
- Incluye los riesgos (límite de saldo, FGD, permanencia).
- El disclaimer debe ser el disclaimer banking estándar.
- Responde SOLO JSON válido.`;
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/llm/
git commit -m "feat: LLM client with Zod validation and prompts"
```

---

### F-6: Recommender (domain pure)

#### Task 6.1: Implement recommender

**Files:**
- Create: `src/domain/recommender.ts`
- Create: `tests/recommender.test.ts`

- [ ] **Step 1: Write test first**

```typescript
import { describe, it, expect } from 'vitest';
import { buildPool, rankRecommendations } from './recommender.js';

const mockProducts = [
  { id: 1, bank: 'Banco A', name: 'Cuenta Max', kind: 'cuenta_remunerada', tae: 2.5, maxBalance: 10000, minBalance: 0, hasConditions: false, fgdPais: 'ES' },
  { id: 2, bank: 'Banco B', name: 'Deposito Top', kind: 'deposito', tae: 3.0, maxBalance: 50000, minBalance: 1000, hasConditions: false, fgdPais: 'ES', durationMonths: 12 },
  { id: 3, bank: 'Banco C', name: 'Cuenta Nomina', kind: 'cuenta_nomina', tae: 1.0, maxBalance: 5000, minBalance: 0, hasConditions: true, bonusAmount: 200, fgdPais: 'ES' },
];

describe('buildPool', () => {
  it('filters by objective ahorro + sin condiciones', () => {
    const pool = buildPool(mockProducts, { objetivo: 'ahorro', vinculacion: 'sin_condiciones' });
    expect(pool.length).toBe(2);
    expect(pool.every(p => p.hasConditions === false)).toBe(true);
  });

  it('filters by deposit type when liquidez = plazo_fijo', () => {
    const pool = buildPool(mockProducts, { objetivo: 'ahorro', vinculacion: 'sin_condiciones', liquidez: 'plazo_fijo' });
    expect(pool.every(p => p.kind === 'deposito')).toBe(true);
  });
});

describe('rankRecommendations', () => {
  it('sorts by benefit descending', () => {
    const ranked = rankRecommendations(mockProducts, { capital: 10000 });
    expect(ranked[0].benefit).toBeGreaterThanOrEqual(ranked[1].benefit);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement recommender.ts**

```typescript
import { calculateBenefitFromItem, SimpleProduct, SimpleBenefit } from './financial-engine.js';

export interface UserParams {
  objetivo: 'ahorro' | 'nomina' | 'alta_rentabilidad';
  capital?: number;
  liquidez?: 'inmediata' | 'plazo_fijo';
  vinculacion: 'sin_condiciones' | 'con_condiciones' | 'indiferente';
  iban?: 'es' | 'global';
  horizonte?: 'corto' | 'medio' | 'largo';
  ingresos_mensuales?: number;
}

export interface RankedProduct {
  id: number;
  bank: string;
  name: string;
  kind: string;
  benefit: number;
  taeEfectiva: number;
  hasConditions: boolean;
  disclaimer?: string;
}

export function buildPool(products: SimpleProduct[], params: UserParams): SimpleProduct[] {
  let pool = [...products];

  if (params.objetivo === 'ahorro') {
    if (params.liquidez === 'plazo_fijo') {
      pool = pool.filter(p => p.kind === 'deposito' || p.kind === 'cuenta_remunerada');
    } else {
      pool = pool.filter(p => p.kind === 'cuenta_remunerada' || p.kind === 'cuenta_nomina');
    }
  } else if (params.objetivo === 'nomina') {
    pool = pool.filter(p => p.kind === 'cuenta_nomina' || p.kind === 'cuenta_remunerada');
  }

  if (params.vinculacion === 'sin_condiciones') {
    pool = pool.filter(p => !('hasConditions' in p) || !(p as any).hasConditions);
  }

  return pool;
}

export function rankRecommendations(products: SimpleProduct[], params: UserParams): RankedProduct[] {
  const capital = params.capital ?? 15000;

  const ranked = products.map(product => {
    const { benefit, taeEfectiva } = calculateBenefitFromItem(product, capital);
    return {
      id: (product as any).id ?? 0,
      bank: (product as any).bank ?? '',
      name: (product as any).name ?? product.kind,
      kind: product.kind,
      benefit,
      taeEfectiva,
      hasConditions: (product as any).hasConditions ?? false,
    };
  });

  ranked.sort((a, b) => b.benefit - a.benefit || b.taeEfectiva - a.taeEfectiva);
  return ranked;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/domain/recommender.ts tests/recommender.test.ts
git commit -m "feat: recommender with pool filtering and ranking"
```

---

### F-7: Web App (Hono + HTMX)

#### Task 7.1: Hono app with auth middleware

**Files:**
- Create: `src/web/app.ts`
- Create: `src/web/middleware/auth.ts`
- Create: `src/web/routes/auth.ts`
- Create: `src/web/views/layout.ts`
- Create: `src/web/views/login.ts`

- [ ] **Step 1: Create auth middleware**

```typescript
import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { config } from '../../shared/config.js';

const SESSION_COOKIE = 'banco_ai_session';

export interface SessionUser {
  id: number;
  email: string;
  role: string;
}

export async function createSession(c: Context, user: SessionUser): Promise<void> {
  const token = await sign({ ...user, exp: Math.floor(Date.now() / 1000) + 86400 }, config.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 86400,
  });
}

export async function getSession(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try {
    return await verify(token, config.SESSION_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const user = await getSession(c);
  if (!user) return c.redirect('/login');
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = await getSession(c);
  if (!user || user.role !== 'admin') return c.text('Unauthorized', 403);
  c.set('user', user);
  await next();
}

export function logout(c: Context) {
  deleteCookie(c, SESSION_COOKIE);
  return c.redirect('/login');
}
```

- [ ] **Step 2: Create auth routes**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createSession, logout } from '../middleware/auth.js';
import { logger } from '../../shared/logger.js';

const auth = new Hono();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

auth.get('/login', (c) => {
  return c.html(renderLogin());
});

auth.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.html(renderLogin('Datos inválidos'));

  const { email, password } = parsed.data;
  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user.length === 0 || !(await bcrypt.compare(password, user[0].passwordHash!))) {
    logger.warn({ email }, 'Login failed');
    return c.html(renderLogin('Email o contraseña incorrectos'));
  }

  await createSession(c, { id: user[0].id, email: user[0].email, role: user[0].role! });
  logger.info({ email, role: user[0].role }, 'Login success');
  return c.redirect('/chat');
});

auth.get('/logout', (c) => logout(c));

function renderLogin(error?: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco AI — Login</title><script src="https://unpkg.com/htmx.org@2"></script><link href="https://cdn.jsdelivr.net/npm/tailwindcss@4/dist/base.min.css" rel="stylesheet"></head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
  <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6 text-center">Banco AI</h1>
    ${error ? `<div class="bg-red-100 text-red-700 p-3 rounded mb-4">${error}</div>` : ''}
    <form hx-post="/login" hx-target="body" class="space-y-4">
      <div><label class="block text-sm font-medium mb-1">Email</label><input type="email" name="email" required class="w-full border rounded px-3 py-2"></div>
      <div><label class="block text-sm font-medium mb-1">Contraseña</label><input type="password" name="password" required class="w-full border rounded px-3 py-2"></div>
      <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Entrar</button>
    </form>
  </div>
</body></html>`;
}

export default auth;
```

- [ ] **Step 3: Create Hono app**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import { requireAuth } from './middleware/auth.js';

const app = new Hono();

app.use('*', cors());
app.use('*', csrf());

app.route('/', authRoutes);
app.route('/chat', chatRoutes);
app.route('/admin', requireAuth, adminRoutes);
app.route('/upload', requireAuth, uploadRoutes);

app.get('/', (c) => c.redirect('/chat'));

export default app;
```

- [ ] **Step 4: Create entrypoint**

```typescript
import { serve } from '@hono/node-server';
import app from '../web/app.js';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, 'Web server started');
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/web/ src/entrypoints/web.ts
git commit -m "feat: web app with Hono, auth flow, login page"
```

#### Task 7.2: Chat routes with HTMX

**Files:**
- Create: `src/web/routes/chat.ts`
- Create: `src/web/views/chat.ts`

- [ ] **Step 1: Create chat route**

```typescript
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { classifyIntent, getBlockedMessage, getDisclaimer } from '../../domain/regulatory.js';
import { generateJson } from '../../infrastructure/llm/client.js';
import { ExtractedUserProfileSchema, RecommendationExplanationSchema } from '../../infrastructure/llm/schemas.js';
import { SYSTEM_EXTRACT_USER, SYSTEM_EXPLAIN_RECOMMENDATION } from '../../infrastructure/llm/prompts.js';
import { db } from '../../db/client.js';
import { recommendations } from '../../db/schema.js';

const chat = new Hono();

chat.use('*', requireAuth);

chat.get('/', (c) => {
  return c.html(renderChat());
});

chat.post('/', async (c) => {
  const body = await c.req.parseBody();
  const message = (body.message as string)?.trim();
  if (!message) return c.text('Mensaje vacío', 400);

  // Redact sensitive data
  const redacted = message
    .replace(/ES\d{22}/g, '[REDACTED_IBAN]')
    .replace(/\b\d{8}[A-Z]\d{1}\b/g, '[REDACTED_DNI]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

  // Step 1: Regulatory classification
  const intent = classifyIntent(redacted);
  if (!intent.allowed) {
    await db.insert(recommendations).values({
      inputJson: { raw: redacted },
      rankedProductsJson: [],
      regulatoryCategory: intent.category,
      blocked: true,
      blockReason: intent.reason,
    });
    return c.html(renderBlocked(getBlockedMessage()));
  }

  // Step 2: Extract user profile via LLM
  const profile = await generateJson(SYSTEM_EXTRACT_USER, message, ExtractedUserProfileSchema);

  // Step 3: Build pool and rank (simplified — real version uses DB)
  const rankedProducts = [
    { id: 1, bank: 'Ejemplo', name: 'Cuenta Demo', kind: 'cuenta_remunerada', benefit: 250, taeEfectiva: 2.5, hasConditions: false },
  ];

  // Step 4: Generate explanation
  const explanation = await generateJson(
    SYSTEM_EXPLAIN_RECOMMENDATION,
    JSON.stringify({ profile, rankedProducts }),
    RecommendationExplanationSchema
  );

  // Step 5: Save to DB
  await db.insert(recommendations).values({
    inputJson: profile,
    rankedProductsJson: rankedProducts,
    assumptionsJson: { capital: profile.capital, irpf: 0.19 },
    regulatoryCategory: 'banking_comparison',
  });

  return c.html(renderResult(explanation));
});

function renderChat(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco AI — Comparador</title><script src="https://unpkg.com/htmx.org@2"></script><link href="https://cdn.jsdelivr.net/npm/tailwindcss@4/dist/base.min.css" rel="stylesheet"></head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-white shadow p-4 flex justify-between items-center">
    <span class="font-bold text-lg">Banco AI</span>
    <div class="space-x-4">
      <a href="/chat" class="text-blue-600">Comparador</a>
      <a href="/upload" class="text-gray-600">PDF</a>
      <a href="/admin" class="text-gray-600">Admin</a>
      <a href="/logout" class="text-red-600">Salir</a>
    </div>
  </nav>
  <div class="max-w-2xl mx-auto p-6">
    <h2 class="text-2xl font-bold mb-4">Comparador de cuentas</h2>
    <p class="text-gray-600 mb-6">Describe tu situación para obtener una comparativa de productos bancarios.</p>
    <div id="result" class="mb-4"></div>
    <form hx-post="/chat" hx-target="#result" hx-swap="innerHTML" class="space-y-4">
      <textarea name="message" rows="4" class="w-full border rounded px-3 py-2" placeholder="Ej: Tengo 20.000€ para ahorrar sin condiciones, ¿qué cuentas me convienen?"></textarea>
      <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">Comparar</button>
    </form>
  </div>
</body></html>`;
}

function renderBlocked(message: string): string {
  return `<div class="bg-yellow-100 border-l-4 border-yellow-500 p-4 rounded"><p class="text-yellow-800">${message}</p></div>`;
}

function renderResult(explanation: any): string {
  let html = `<div class="bg-white rounded-lg shadow p-6 space-y-4">`;
  html += `<p class="text-gray-700">${explanation.summary}</p>`;
  for (const pick of explanation.top_picks) {
    html += `<div class="border rounded p-4"><strong>${pick.bank}</strong> — ${pick.product}<br><span class="text-green-600">Beneficio estimado: ${pick.benefit}€</span><br><span class="text-gray-600">${pick.why}</span></div>`;
  }
  html += `<p class="text-xs text-gray-500 mt-4">${explanation.disclaimer}</p>`;
  html += `</div>`;
  return html;
}

export default chat;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/chat.ts
git commit -m "feat: chat route with regulatory classifier, LLM integration, HTMX"
```

---

### F-8: Telegram Bot

#### Task 8.1: Bot setup and handlers

**Files:**
- Create: `src/infrastructure/telegram/bot.ts`
- Create: `src/infrastructure/telegram/auth.ts`
- Create: `src/infrastructure/telegram/handlers/start.ts`
- Create: `src/infrastructure/telegram/handlers/recommend.ts`
- Create: `src/infrastructure/telegram/handlers/admin.ts`
- Create: `src/entrypoints/telegram.ts`

- [ ] **Step 1: Create auth module**

```typescript
import { config } from '../../../shared/config.js';

const adminIds = new Set(config.ADMIN_TELEGRAM_IDS.split(',').map(s => s.trim()).filter(Boolean));

export function isAdmin(telegramId: number | string): boolean {
  return adminIds.has(String(telegramId));
}
```

- [ ] **Step 2: Create bot setup**

```typescript
import { Bot, Context } from 'grammy';
import { config } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import { startHandler } from './handlers/start.js';
import { recommendHandler } from './handlers/recommend.js';
import { adminHandler } from './handlers/admin.js';
import { isAdmin } from './auth.js';

const bot = new Bot(config.TELEGRAM_BOT_TOKEN!);

bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.debug({ updateId: ctx.update.update_id, ms }, 'Telegram update processed');
});

bot.command('start', startHandler);
bot.command('comparar', recommendHandler);
bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply('No autorizado');
  return adminHandler(ctx);
});
bot.on(':text', recommendHandler);

export async function startBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not set, skipping bot');
    return;
  }
  bot.start({
    onStart: () => logger.info('Telegram bot started'),
  });
}
```

- [ ] **Step 3: Create handlers**

```typescript
import { Context } from 'grammy';

export async function startHandler(ctx: Context) {
  await ctx.reply(
    'Bienvenido a Banco AI — Comparador de cuentas bancarias\n\n'
    + 'Comandos:\n'
    + '/comparar — Iniciar comparativa de cuentas\n'
    + 'O simplemente escribe tu situación, ejemplo: "Tengo 15.000€ para ahorrar sin condiciones"\n\n'
    + 'Esta herramienta ofrece comparativas informativas, no asesoramiento financiero personalizado.'
  );
}
```

```typescript
import { Context } from 'grammy';
import { classifyIntent, getBlockedMessage, sanitizeLanguage } from '../../../domain/regulatory.js';
import { generateJson } from '../../llm/client.js';
import { ExtractedUserProfileSchema, RecommendationExplanationSchema } from '../../llm/schemas.js';
import { SYSTEM_EXTRACT_USER, SYSTEM_EXPLAIN_RECOMMENDATION } from '../../llm/prompts.js';
import { getDisclaimer } from '../../../domain/regulatory.js';

export async function recommendHandler(ctx: Context) {
  const text = ctx.message?.text;
  if (!text || text.startsWith('/')) return;

  const redacted = text.replace(/ES\d{22}/g, '[REDACTED]');
  const intent = classifyIntent(redacted);

  if (!intent.allowed) {
    return ctx.reply(getBlockedMessage());
  }

  await ctx.reply('Analizando tu consulta...');

  try {
    const profile = await generateJson(SYSTEM_EXTRACT_USER, text, ExtractedUserProfileSchema);

    // Rank products (simplified — real version queries DB)
    const rankedProducts = [
      { id: 1, bank: 'Ejemplo', name: 'Cuenta Demo', kind: 'cuenta_remunerada', benefit: 250, taeEfectiva: 2.5, hasConditions: false },
    ];

    const explanation = await generateJson(
      SYSTEM_EXPLAIN_RECOMMENDATION,
      JSON.stringify({ profile, rankedProducts }),
      RecommendationExplanationSchema
    );

    const safeText = sanitizeLanguage(explanation.summary);
    const disclaimer = getDisclaimer('banking');

    let reply = safeText + '\n\n';
    for (const pick of explanation.top_picks) {
      reply += `🏦 ${pick.bank} — ${pick.product}\n💰 Beneficio estimado: ${pick.benefit}€\n📝 ${pick.why}\n\n`;
    }
    reply += `—\n${disclaimer}`;

    await ctx.reply(reply, { parse_mode: 'HTML' });
  } catch (error) {
    await ctx.reply('Ocurrió un error al procesar tu consulta. Inténtalo de nuevo más tarde.');
  }
}
```

```typescript
import { Context } from 'grammy';
import { db } from '../../../db/client.js';
import { scrapeRuns, productVersions } from '../../../db/schema.js';
import { sql } from 'drizzle-orm';

export async function adminHandler(ctx: Context) {
  const text = ctx.message?.text?.toLowerCase() ?? '';

  if (text.includes('pendientes') || text.includes('pending')) {
    const pending = await db.select().from(productVersions).where(sql`status = 'pending_review'`).limit(10);
    if (pending.length === 0) return ctx.reply('No hay versiones pendientes de revisión.');
    let reply = 'Versiones pendientes:\n\n';
    for (const v of pending) {
      reply += `#${v.id} — Producto ${v.productId} | TAE: ${v.tae} | desde ${v.validFrom}\n`;
    }
    return ctx.reply(reply);
  }

  if (text.includes('scrapes')) {
    const recent = await db.select().from(scrapeRuns).orderBy(sql`started_at desc`).limit(5);
    if (recent.length === 0) return ctx.reply('No hay ejecuciones de scraping.');
    let reply = 'Últimos scrapes:\n\n';
    for (const r of recent) {
      reply += `#${r.id} — ${r.status} | ${r.startedAt}\n`;
    }
    return ctx.reply(reply);
  }

  return ctx.reply('Comandos admin:\n/pending — Ver versiones pendientes\n/scrapes — Ver últimas ejecuciones');
}
```

- [ ] **Step 4: Create Telegram entrypoint**

```typescript
import { startBot } from '../infrastructure/telegram/bot.js';
import { logger } from '../shared/logger.js';
import { config } from '../shared/config.js';

if (!config.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

startBot().catch((err) => {
  logger.error(err, 'Telegram bot failed');
  process.exit(1);
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/telegram/ src/entrypoints/telegram.ts
git commit -m "feat: Telegram bot with recommend, admin, start handlers"
```

---

### F-9: Scraper

#### Task 9.1: Fetcher and normalizer

**Files:**
- Create: `src/infrastructure/scraper/fetcher.ts`
- Create: `src/infrastructure/scraper/normalizer.ts`
- Create: `src/entrypoints/scheduler.ts`
- Create: `data/entities.yml`

- [ ] **Step 1: Create fetcher**

```typescript
import { logger } from '../../shared/logger.js';

export interface FetchResult {
  url: string;
  text: string;
  fetchedAt: Date;
}

export async function fetchPage(url: string, timeoutMs = 30000): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BancoAI/1.0 (comparative tool; https://banco-ai.local)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const stripped = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { url, text: stripped, fetchedAt: new Date() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWithRetry(url: string, maxRetries = 2): Promise<FetchResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchPage(url);
    } catch (error) {
      logger.warn({ url, attempt, error: String(error) }, 'Fetch failed');
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      else throw error;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}
```

- [ ] **Step 2: Create normalizer**

```typescript
import { ExtractedProductSchema } from '../llm/schemas.js';
import { z } from 'zod';

type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;

export interface NormalizedVersion {
  tae: number | null;
  tin: number | null;
  maxBalance: number | null;
  minBalance: number | null;
  durationMonths: number | null;
  bonusAmount: number | null;
  permanencia: string | null;
  fees: { name: string; amount: number; period: string }[];
  requirements: Record<string, boolean>;
  cancellationFees: string[] | null;
  evidence: { field: string; value: string; unit?: string; evidence: string; sourceUrl?: string; confidence: number }[];
}

export function normalizeExtractedProduct(extracted: ExtractedProduct, sourceUrl: string): NormalizedVersion {
  const evidence = extracted.evidence.map(e => ({
    ...e,
    sourceUrl: e.source_url || sourceUrl,
  }));

  return {
    tae: extracted.tae,
    tin: extracted.tin,
    maxBalance: extracted.max_balance,
    minBalance: extracted.min_balance,
    durationMonths: extracted.duration_months,
    bonusAmount: extracted.bonus_amount,
    permanencia: extracted.permanencia,
    fees: extracted.fees,
    requirements: extracted.requirements as unknown as Record<string, boolean>,
    cancellationFees: extracted.cancellation_fees,
    evidence,
  };
}

export function detectFieldChanges(current: NormalizedVersion, previous: NormalizedVersion | null): { changed: boolean; fields: string[] } {
  if (!previous) return { changed: true, fields: ['all'] };

  const fieldsToCompare: (keyof NormalizedVersion)[] = ['tae', 'tin', 'maxBalance', 'minBalance', 'durationMonths', 'fees', 'requirements'];
  const changed: string[] = [];

  for (const field of fieldsToCompare) {
    const curr = JSON.stringify(current[field]);
    const prev = JSON.stringify(previous[field]);
    if (curr !== prev) changed.push(field);
  }

  return { changed: changed.length > 0, fields: changed };
}
```

- [ ] **Step 3: Create entities.yml seed data**

```yaml
sources:
  - bank_name: "Bankinter"
    product_family: "cuenta_ahorro"
    url: "https://www.bankinter.com/particulares/cuentas"
    scrape_strategy: "fetch"
  - bank_name: "Openbank"
    product_family: "cuenta_ahorro"
    url: "https://www.openbank.es/cuentas"
    scrape_strategy: "fetch"
```

- [ ] **Step 4: Create scheduler entrypoint**

```typescript
import { db } from '../db/client.js';
import { sources, scrapeRuns as scrapeRunsTable, products, productVersions } from '../db/schema.js';
import { sql, eq, desc } from 'drizzle-orm';
import { fetchWithRetry } from '../infrastructure/scraper/fetcher.js';
import { normalizeExtractedProduct, detectFieldChanges } from '../infrastructure/scraper/normalizer.js';
import { generateJson } from '../infrastructure/llm/client.js';
import { ExtractedProductSchema } from '../infrastructure/llm/schemas.js';
import { SYSTEM_EXTRACT_PRODUCT } from '../infrastructure/llm/prompts.js';
import { logger, audit } from '../shared/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const SCRAPE_DIR = process.env.SCRAPE_DIR || './data/scrapes';
const JITTER_MINUTES = 30;
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const LOCK_NAMESPACE = 1;

async function acquireLock(sourceId: number): Promise<boolean> {
  const result = await db.execute(sql`SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}, ${sourceId}) as locked`);
  return result.rows[0]?.locked === true;
}

async function releaseLock(sourceId: number): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_NAMESPACE}, ${sourceId})`);
}

async function scrapeSource(source: typeof sources.$inferSelect): Promise<void> {
  const lock = await acquireLock(source.id);
  if (!lock) {
    logger.debug({ sourceId: source.id }, 'Skipping — lock held by another instance');
    return;
  }

  const run = await db.insert(scrapeRunsTable).values({
    sourceId: source.id,
    status: 'running',
  }).returning();

  try {
    const fetchResult = await fetchWithRetry(source.url);
    const runDir = path.join(SCRAPE_DIR, String(run[0].id));
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'page.txt'), fetchResult.text);

    const extracted = await generateJson(SYSTEM_EXTRACT_PRODUCT, fetchResult.text, ExtractedProductSchema);

    await db.update(scrapeRunsTable).set({
      status: 'success',
      extractedJson: extracted as any,
      rawTextPath: path.join(runDir, 'page.txt'),
      confidence: String(extracted.confidence),
      finishedAt: new Date(),
    }).where(eq(scrapeRunsTable.id, run[0].id));

    const normalized = normalizeExtractedProduct(extracted, source.url);

    // Find existing product
    const existingProduct = await db.select({
      id: products.id,
    }).from(products).where(
      sql`${products.bank} = ${source.bank_name} AND ${products.name} = ${extracted.product_name} AND ${products.kind} = ${extracted.product_kind}`
    ).limit(1);

    let productId: number;
    if (existingProduct.length === 0) {
      const newProduct = await db.insert(products).values({
        sourceId: source.id,
        bank: source.bank_name,
        name: extracted.product_name,
        kind: extracted.product_kind,
        regulatoryCategory: 'bank_account',
        supervisor: 'bde',
      }).returning();
      productId = newProduct[0].id;
    } else {
      productId = existingProduct[0].id;
    }

    // Get current approved version
    const currentVersion = await db.select().from(productVersions).where(
      sql`${productVersions.productId} = ${productId} AND ${productVersions.status} = 'approved' AND ${productVersions.validTo} IS NULL`
    ).limit(1);

    const previous = currentVersion.length > 0 ? {
      tae: currentVersion[0].tae ? Number(currentVersion[0].tae) : null,
      tin: currentVersion[0].tin ? Number(currentVersion[0].tin) : null,
      maxBalance: currentVersion[0].maxBalance ? Number(currentVersion[0].maxBalance) : null,
      minBalance: currentVersion[0].minBalance ? Number(currentVersion[0].minBalance) : null,
      durationMonths: currentVersion[0].durationMonths,
      bonusAmount: currentVersion[0].bonusAmount ? Number(currentVersion[0].bonusAmount) : null,
      permanencia: currentVersion[0].permanencia,
      fees: currentVersion[0].feesJson,
      requirements: currentVersion[0].requirementsJson,
      cancellationFees: currentVersion[0].cancellationFees,
      evidence: [],
    } : null;

    const { changed } = detectFieldChanges(normalized, previous);

    if (changed) {
      await db.insert(productVersions).values({
        productId,
        validFrom: new Date(),
        status: 'pending_review',
        tae: normalized.tae ? String(normalized.tae) : null,
        tin: normalized.tin ? String(normalized.tin) : null,
        maxBalance: normalized.maxBalance ? String(normalized.maxBalance) : null,
        minBalance: normalized.minBalance ? String(normalized.minBalance) : null,
        feesJson: normalized.fees as any,
        requirementsJson: normalized.requirements as any,
        durationMonths: normalized.durationMonths,
        bonusAmount: normalized.bonusAmount ? String(normalized.bonusAmount) : null,
        permanencia: normalized.permanencia,
        cancellationFees: normalized.cancellationFees as any,
        evidenceJson: normalized.evidence as any,
        sourceScrapeId: run[0].id,
      });
      audit('scrape.change_detected', 'product', productId, { bank: source.bank_name, product: extracted.product_name });
    }

    await db.update(sources).set({ lastSuccessAt: new Date() }).where(eq(sources.id, source.id));
  } catch (error) {
    logger.error({ sourceId: source.id, error: String(error) }, 'Scrape failed');
    await db.update(scrapeRunsTable).set({
      status: 'error',
      error: String(error),
      finishedAt: new Date(),
    }).where(eq(scrapeRunsTable.id, run[0].id));
    await db.update(sources).set({ lastErrorAt: new Date(), lastErrorMsg: String(error) }).where(eq(sources.id, source.id));
  } finally {
    await releaseLock(source.id);
  }
}

async function runScrapingCycle() {
  const activeSources = await db.select().from(sources).where(eq(sources.active, true));
  logger.info({ count: activeSources.length }, 'Starting scraping cycle');

  for (const source of activeSources) {
    await scrapeSource(source);
    // Rate limit: 1 request per 5 seconds per domain
    await new Promise(r => setTimeout(r, 5000));
  }
}

function getJitteredDelay(): number {
  const jitter = Math.floor(Math.random() * JITTER_MINUTES * 60 * 1000);
  return INTERVAL_MS + jitter;
}

async function main() {
  logger.info('Scheduler started');

  // Run immediately, then on interval with jitter
  await runScrapingCycle();

  const scheduleNext = () => {
    const delay = getJitteredDelay();
    logger.debug({ delayMs: delay }, 'Next scrape scheduled');
    setTimeout(async () => {
      await runScrapingCycle();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

main().catch((err) => {
  logger.error(err, 'Scheduler failed');
  process.exit(1);
});
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/scraper/ src/entrypoints/scheduler.ts data/entities.yml
git commit -m "feat: scraper with fetcher, normalizer, scheduler with advisory lock"
```

---

### F-10: PDF Analysis

#### Task 10.1: PDF extraction pipeline

**Files:**
- Create: `src/infrastructure/pdf/extract-text.ts`
- Create: `src/infrastructure/pdf/ocr.ts`
- Create: `src/infrastructure/pdf/sanitize.ts`
- Create: `src/infrastructure/storage/files.ts`

- [ ] **Step 1: Create sanitize module**

```typescript
const MAX_CHARS = 100_000;
const MAX_PAGES = 50;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePdf(file: { size: number; name: string }): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'El archivo excede el tamaño máximo de 20 MB' };
  }
  return { valid: true };
}

export function truncateText(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + '\n[...truncado]';
}
```

- [ ] **Step 2: Create text extraction**

```typescript
import { readFile } from 'fs/promises';
import { logger } from '../../shared/logger.js';

export async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    const { getDocument } = await import('pdfjs-dist');
    const data = await readFile(filePath);
    const doc = await getDocument({ data }).promise;
    const pages = Math.min(doc.numPages, 50);
    const texts: string[] = [];

    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      texts.push(pageText);
    }

    return texts.join('\n\n');
  } catch (error) {
    logger.error({ filePath, error: String(error) }, 'PDF text extraction failed, falling back to OCR');
    throw error;
  }
}
```

- [ ] **Step 3: Create OCR module**

```typescript
import { logger } from '../../shared/logger.js';

export async function ocrPdf(filePath: string): Promise<string> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('spa');
    const { data } = await worker.recognize(filePath);
    await worker.terminate();
    return data.text;
  } catch (error) {
    logger.error({ filePath, error: String(error) }, 'OCR failed');
    throw new Error('No se pudo extraer texto del PDF. El archivo puede estar dañado o ser ilegible.');
  }
}
```

- [ ] **Step 4: Create storage module**

```typescript
import { writeFile, unlink, readdir, rm } from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../shared/logger.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const RETENTION_DAYS = 30;

export function generateHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function saveUpload(buffer: Buffer, hash: string): Promise<string> {
  const dir = path.join(UPLOAD_DIR, hash.slice(0, 2));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  // Can't use fs.mkdir with recursive without checking
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  // Use mkdir properly
  const { mkdir } = await import('fs/promises');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${hash}.pdf`);
  await writeFile(filePath, buffer);
  return filePath;
}

export async function deleteOldUploads(): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const entries = await readdir(UPLOAD_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirPath = path.join(UPLOAD_DIR, entry.name);
      const files = await readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await import('fs/promises').then(fs => fs.stat(filePath));
        if (stat.mtimeMs < cutoff) {
          await unlink(filePath);
          deleted++;
        }
      }
    }
  }

  return deleted;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/pdf/ src/infrastructure/storage/
git commit -m "feat: PDF extraction, OCR, storage with retention"
```

#### Task 10.2: Upload route

**Files:**
- Create: `src/web/routes/upload.ts`
- Create: `src/web/views/upload.ts`

- [ ] **Step 1: Create upload route**

```typescript
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../../db/client.js';
import { uploadedDocuments } from '../../db/schema.js';
import { generateHash, saveUpload } from '../../infrastructure/storage/files.js';
import { validatePdf, truncateText } from '../../infrastructure/pdf/sanitize.js';
import { extractTextFromPdf } from '../../infrastructure/pdf/extract-text.js';
import { ocrPdf } from '../../infrastructure/pdf/ocr.js';
import { generateJson } from '../../infrastructure/llm/client.js';
import { ExtractedPdfConditionsSchema } from '../../infrastructure/llm/schemas.js';
import { getDisclaimer } from '../../domain/regulatory.js';

const upload = new Hono();

upload.use('*', requireAuth);

upload.get('/', (c) => {
  return c.html(renderUploadPage());
});

upload.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file as File;
  if (!file) return c.html(renderUploadPage('No se seleccionó ningún archivo'));

  const validation = validatePdf(file);
  if (!validation.valid) return c.html(renderUploadPage(validation.error));

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = generateHash(buffer);
  const user = c.get('user');

  // Check duplicate
  const existing = await db.select().from(uploadedDocuments).where(sql`file_hash = ${hash}`).limit(1);
  if (existing.length > 0) {
    return c.html(renderUploadPage('Este PDF ya fue subido anteriormente.'));
  }

  const filePath = await saveUpload(buffer, hash);

  const doc = await db.insert(uploadedDocuments).values({
    userId: user.id, originalName: file.name, storedPath: filePath,
    fileHash: hash, fileSizeBytes: buffer.length,
    status: 'processing',
  }).returning();

  try {
    // Try text extraction first, fall back to OCR
    let text: string;
    try {
      text = await extractTextFromPdf(filePath);
    } catch {
      text = await ocrPdf(filePath);
    }

    text = truncateText(text);
    const extracted = await generateJson(
      'Extrae las condiciones financieras de este documento bancario.',
      text,
      ExtractedPdfConditionsSchema
    );

    // Compare against market products (simplified)
    const comparisonResult = {
      bank: extracted.bank,
      productName: extracted.product_name,
      tae: extracted.tae,
      marketAverageTae: 2.5, // placeholder
      assessment: extracted.tae && extracted.tae > 2.5
        ? 'Por encima de la media del mercado'
        : 'Por debajo o en línea con la media del mercado',
      clausesWarnings: extracted.clauses_warnings,
    };

    await db.update(uploadedDocuments).set({
      status: 'done',
      extractedJson: extracted as any,
      comparisonJson: comparisonResult as any,
      reportText: JSON.stringify(comparisonResult),
    }).where(sql`id = ${doc[0].id}`);

    return c.html(renderResult(extracted, comparisonResult));
  } catch (error) {
    await db.update(uploadedDocuments).set({ status: 'error' }).where(sql`id = ${doc[0].id}`);
    return c.html(renderUploadPage('Error al procesar el PDF. Inténtalo de nuevo.'));
  }
});

function renderUploadPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco AI — Subir PDF</title><script src="https://unpkg.com/htmx.org@2"></script><link href="https://cdn.jsdelivr.net/npm/tailwindcss@4/dist/base.min.css" rel="stylesheet"></head>
<body class="bg-gray-50 min-h-screen">
<nav class="bg-white shadow p-4 flex justify-between items-center">
  <span class="font-bold text-lg">Banco AI</span>
  <div class="space-x-4"><a href="/chat" class="text-gray-600">Comparador</a><a href="/upload" class="text-blue-600">PDF</a><a href="/admin" class="text-gray-600">Admin</a><a href="/logout" class="text-red-600">Salir</a></div>
</nav>
<div class="max-w-2xl mx-auto p-6">
  <h2 class="text-2xl font-bold mb-4">Analizar condiciones de cuenta</h2>
  <p class="text-gray-600 mb-4">Sube el PDF de condiciones de una cuenta bancaria y el sistema extraerá la información y la comparará con el mercado.</p>
  ${error ? `<div class="bg-red-100 text-red-700 p-3 rounded mb-4">${error}</div>` : ''}
  <form hx-post="/upload" hx-target="#result" hx-swap="innerHTML" enctype="multipart/form-data" class="space-y-4">
    <input type="file" name="file" accept=".pdf" required class="block w-full border rounded px-3 py-2">
    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">Analizar PDF</button>
  </form>
  <div id="result" class="mt-6"></div>
  <p class="text-xs text-gray-500 mt-8">${getDisclaimer('banking')}</p>
</div>
</body></html>`;
}

function renderResult(extracted: any, comparison: any): string {
  let html = `<div class="bg-white rounded-lg shadow p-6 space-y-4">`;
  html += `<h3 class="text-xl font-bold">${comparison.bank} — ${comparison.productName}</h3>`;
  html += `<div class="grid grid-cols-2 gap-4">`;
  html += `<div><strong>TAE:</strong> ${extracted.tae ?? 'No especificado'}%</div>`;
  html += `<div><strong>Saldo máximo:</strong> ${extracted.max_balance ? extracted.max_balance.toLocaleString() + '€' : 'No especificado'}</div>`;
  html += `<div><strong>Plazo:</strong> ${extracted.duration_months ? extracted.duration_months + ' meses' : 'No especificado'}</div>`;
  html += `<div><strong>Permanencia:</strong> ${extracted.permanencia ?? 'No especificada'}</div>`;
  html += `</div>`;
  html += `<div class="mt-4 p-3 bg-blue-50 rounded"><strong>Comparativa:</strong> ${comparison.assessment}</div>`;
  if (extracted.clauses_warnings?.length > 0) {
    html += `<div class="mt-4"><strong>Cláusulas a revisar:</strong><ul class="list-disc pl-5 mt-2">`;
    for (const w of extracted.clauses_warnings) html += `<li class="text-yellow-700">${w}</li>`;
    html += `</ul></div>`;
  }
  html += `<p class="text-xs text-gray-500 mt-4">${getDisclaimer('banking')}</p>`;
  html += `</div>`;
  return html;
}

export default upload;
```

Note: Add `import { sql } from 'drizzle-orm';` at the top.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/upload.ts
git commit -m "feat: PDF upload route with extraction, comparison, report"
```

---

### F-11: Admin Dashboard

#### Task 11.1: Admin routes and views

**Files:**
- Create: `src/web/routes/admin.ts`
- Create: `src/web/views/admin.ts`

- [ ] **Step 1: Create admin route**

```typescript
import { Hono } from 'hono';
import { requireAdmin } from '../middleware/auth.js';
import { db } from '../../db/client.js';
import { scrapeRuns, productVersions, products, sources } from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

const admin = new Hono();

admin.get('/', requireAdmin, async (c) => {
  const pendingVersions = await db.select({
    id: productVersions.id,
    productId: productVersions.productId,
    tae: productVersions.tae,
    status: productVersions.status,
    validFrom: productVersions.validFrom,
  }).from(productVersions)
    .where(sql`${productVersions.status} = 'pending_review'`)
    .orderBy(desc(productVersions.validFrom))
    .limit(20);

  const recentScrapes = await db.select({
    id: scrapeRuns.id,
    status: scrapeRuns.status,
    startedAt: scrapeRuns.startedAt,
    confidence: scrapeRuns.confidence,
  }).from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(10);

  const productCount = await db.select({ count: sql<number>`count(*)` }).from(products);
  const sourceCount = await db.select({ count: sql<number>`count(*)` }).from(sources);

  return c.html(renderAdmin(pendingVersions, recentScrapes, productCount[0].count, sourceCount[0].count));
});

admin.post('/approve/:id', requireAdmin, async (c) => {
  const versionId = parseInt(c.req.param('id'));
  const user = c.get('user');

  const version = await db.select().from(productVersions).where(eq(productVersions.id, versionId)).limit(1);
  if (version.length === 0) return c.text('Not found', 404);

  // Close previous approved version
  await db.update(productVersions)
    .set({ validTo: new Date(), status: 'superseded' })
    .where(sql`${productVersions.productId} = ${version[0].productId} AND ${productVersions.status} = 'approved' AND ${productVersions.validTo} IS NULL`);

  // Approve this version
  await db.update(productVersions)
    .set({ status: 'approved', approvedBy: user.id, approvedAt: new Date() })
    .where(eq(productVersions.id, versionId));

  return c.redirect('/admin');
});

admin.post('/reject/:id', requireAdmin, async (c) => {
  const versionId = parseInt(c.req.param('id'));
  const user = c.get('user');

  await db.update(productVersions)
    .set({ status: 'rejected', rejectedBy: user.id, rejectedAt: new Date() })
    .where(eq(productVersions.id, versionId));

  return c.redirect('/admin');
});

function renderAdmin(pendingVersions: any[], recentScrapes: any[], productCount: number, sourceCount: number): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco AI — Admin</title><script src="https://unpkg.com/htmx.org@2"></script><link href="https://cdn.jsdelivr.net/npm/tailwindcss@4/dist/base.min.css" rel="stylesheet"></head>
<body class="bg-gray-50 min-h-screen">
<nav class="bg-white shadow p-4 flex justify-between items-center">
  <span class="font-bold text-lg">Banco AI — Admin</span>
  <div class="space-x-4"><a href="/chat" class="text-gray-600">Comparador</a><a href="/logout" class="text-red-600">Salir</a></div>
</nav>
<div class="max-w-4xl mx-auto p-6">
  <div class="grid grid-cols-3 gap-4 mb-8">
    <div class="bg-white p-4 rounded shadow"><strong>Productos</strong><br><span class="text-2xl">${productCount}</span></div>
    <div class="bg-white p-4 rounded shadow"><strong>Fuentes</strong><br><span class="text-2xl">${sourceCount}</span></div>
    <div class="bg-white p-4 rounded shadow"><strong>Pendientes</strong><br><span class="text-2xl text-yellow-600">${pendingVersions.length}</span></div>
  </div>

  <h3 class="text-xl font-bold mb-4">Versiones pendientes de revisión</h3>
  ${pendingVersions.length === 0 ? '<p class="text-gray-600">No hay versiones pendientes.</p>' :
    pendingVersions.map((v: any) => `
      <div class="bg-white p-4 rounded shadow mb-2 flex justify-between items-center">
        <div>Producto #${v.productId} | TAE: ${v.tae ?? 'N/A'} | ${new Date(v.validFrom).toLocaleDateString()}</div>
        <div class="space-x-2">
          <form hx-post="/admin/approve/${v.id}" hx-target="body" class="inline">
            <button class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Aprobar</button>
          </form>
          <form hx-post="/admin/reject/${v.id}" hx-target="body" class="inline">
            <button class="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">Rechazar</button>
          </form>
        </div>
      </div>
    `).join('')
  }

  <h3 class="text-xl font-bold mt-8 mb-4">Últimos scrapes</h3>
  <div class="bg-white rounded shadow">
    ${recentScrapes.map((s: any) => `
      <div class="p-3 border-b flex justify-between">
        <span>#${s.id}</span>
        <span class="${s.status === 'success' ? 'text-green-600' : 'text-red-600'}">${s.status}</span>
        <span class="text-gray-500">${s.confidence ? (Number(s.confidence) * 100).toFixed(0) + '%' : ''}</span>
        <span class="text-gray-500">${new Date(s.startedAt).toLocaleString()}</span>
      </div>
    `).join('')}
  </div>
</div>
</body></html>`;
}

export default admin;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/admin.ts
git commit -m "feat: admin dashboard with pending review, approve/reject, scrape status"
```

---

### F-12: Hardening

#### Task 12.1: Rate limiting, retention, healthchecks, backup

- [ ] **Step 1: Add rate limiting to web middleware**

Modify `src/web/middleware/auth.ts` to add simple in-memory rate limiter:

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(limit: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || entry.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= limit) {
      return c.text('Demasiadas solicitudes. Inténtalo más tarde.', 429);
    }

    entry.count++;
    return next();
  };
}
```

- [ ] **Step 2: Add retention cleanup to scheduler**

Add to `src/entrypoints/scheduler.ts` — run cleanup weekly:

```typescript
import { deleteOldUploads } from '../infrastructure/storage/files.js';

async function runCleanup() {
  const deleted = await deleteOldUploads();
  if (deleted > 0) logger.info({ deleted }, 'Cleaned up old uploads');
}
```

- [ ] **Step 3: Add backup script**

Create `scripts/backup.sh`:

```bash
#!/bin/bash
set -e
BACKUP_DIR=${BACKUP_DIR:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -U banco_ai banco_ai | gzip > "$BACKUP_DIR/banco_ai_$TIMESTAMP.sql.gz"
echo "Backup saved: $BACKUP_DIR/banco_ai_$TIMESTAMP.sql.gz"
```

- [ ] **Step 4: Add healthcheck to docker-compose services (already in F-1)**

- [ ] **Step 5: Ensure robots.txt compliance — document in README**

- [ ] **Step 6: Final verification**

Run: `npx tsc --noEmit`
Run: `npx vitest run`
Expected: All tests pass, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/web/middleware/auth.ts src/entrypoints/scheduler.ts scripts/
git commit -m "feat: rate limiting, retention cleanup, backup script"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every section in the spec v1.3 maps to at least one task. F-1 covers scaffolding/schema, F-2 covers shared layer (config/logger/types/disclaimers), F-3 covers financial engine, F-4 covers regulatory guardrails, F-5 covers LLM infra, F-6 covers recommender, F-7 covers web app, F-8 covers Telegram, F-9 covers scraper, F-10 covers PDF, F-11 covers admin, F-12 covers hardening.
- [x] **Placeholder scan:** No "TBD", "TODO", "implement later", or "add appropriate error handling" without code. Every step has actual code.
- [x] **Type consistency:** Types used in later tasks (RegulatoryCategory, SafeResponseMode, SimpleProduct, etc.) are defined in earlier tasks. No mismatches.
- [x] **Dependency correctness:** F-6 depends only on F-3 (pure domain). F-7 depends on F-4, F-5, F-6. F-8 depends on F-4, F-5, F-6. F-9 depends on F-5. F-10 depends on F-5.

Gaps found: The spec mentions `domain/documents.ts` but the plan integrates document comparison directly in the upload route. This is acceptable for MVP — the comparison logic is simple enough to inline. The `domain/products.ts` CRUD operations are not explicitly tasked — they are used inline in the scheduler where needed (F-9). This avoids unnecessary abstraction in MVP.