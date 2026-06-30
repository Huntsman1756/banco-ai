import { Hono } from "hono";
import { logger } from "../shared/logger.js";
import { cors } from "hono/cors";
import { evaluatePdfUpload } from "../domain/pdf-guard.js";
import { loadLatestScrapeState } from "../infrastructure/scraper/state-store.js";
import type { HermesReviewPlan, HermesReviewTask } from "../domain/hermes-review.js";
import {
  addManualCatalogProduct,
  approveCatalogDraft,
  getApprovedCatalog,
  getPendingCatalogDrafts,
  rejectCatalogDraft,
} from "../infrastructure/products/catalog-store.js";
import { classifyUserIntent, blockedCategoryMessage } from "../domain/regulatory.js";
import { extractAssistantProfileFromQuestion } from "../infrastructure/products/assistant-parser.js";
import {
  extractManualConditions,
  extractPdfConditions,
  mapPdfExtractionToCatalogProduct,
  mapManualExtractionToCatalogProduct,
  type ParsedManualConditions,
  type ParsedPdfConditions,
} from "../infrastructure/products/condition-parser.js";
import { extractPdfTextFallback } from "../infrastructure/pdf/extract-text.js";
import { queuePdfForProcessing } from "../infrastructure/pdf/upload-queue.js";
import {
  rankCatalogForProfile,
  type AssistantProfile,
  type AssistantRecommendation,
  type ProductCatalogRecord,
} from "../domain/recommender.js";
import { LlmRateLimitError } from "../infrastructure/llm/rate-limiter.js";
import { z } from "zod";

const MAX_BASE64_LENGTH = 27_000_000;
const MAX_RAW_CONDITIONS_LENGTH = 50_000;
const MAX_SOURCE_URL_LENGTH = 2048;
const MAX_BANK_NAME_LENGTH = 128;
const MAX_PRODUCT_NAME_LENGTH = 256;

const _AssistantProfileSchema = z.object({
  objective: z.enum(["rentabilidad", "nomina", "liquidez", "deposito"]).optional(),
  vinculacion: z.enum(["sin_condiciones", "con_condiciones", "indiferente"]).optional(),
  horizonte: z.enum(["corto", "medio", "largo"]).optional(),
  capitalBand: z.enum(["hasta_1000", "1000_10000", "10000_plus"]).optional(),
  payrollNeed: z.enum(["no_importante", "si_tengo_nomina", "prioriza_nomina"]).optional(),
  message: z.string().max(MAX_RAW_CONDITIONS_LENGTH).optional(),
});

const ManualConditionsSchema = z.object({
  bank: z.string().max(MAX_BANK_NAME_LENGTH),
  rawConditions: z.string().max(MAX_RAW_CONDITIONS_LENGTH),
  productKind: z.enum(["cuenta_remunerada", "cuenta_nomina", "deposito"]).optional(),
  productName: z.string().max(MAX_PRODUCT_NAME_LENGTH).optional().default(""),
  sourceUrl: z.string().max(MAX_SOURCE_URL_LENGTH).optional().default(""),
});

const PdfUploadSchema = z.object({
  bank: z.string().max(MAX_BANK_NAME_LENGTH),
  productName: z.string().max(MAX_PRODUCT_NAME_LENGTH).optional().default(""),
  sourceUrl: z.string().max(MAX_SOURCE_URL_LENGTH).optional().default(""),
  fileName: z.string().max(256),
  fileSizeBytes: z.number().max(50 * 1024 * 1024).default(0),
  mimeType: z.string().max(64).default("application/pdf"),
  fileBase64: z.string().max(MAX_BASE64_LENGTH),
});

const PdfAnalyzeSchema = z.object({
  bank: z.string().max(MAX_BANK_NAME_LENGTH),
  fileName: z.string().max(256),
  fileSizeBytes: z.number().max(50 * 1024 * 1024).default(0),
  mimeType: z.string().max(64).default("application/pdf"),
  fileBase64: z.string().max(MAX_BASE64_LENGTH),
});

function isSafePdfMimeType(mime: string): boolean {
  return mime === "application/pdf" || mime === "application/x-pdf" || mime.endsWith("+pdf");
}

type WebSummary = {
  generatedAt?: string;
  totalTasks: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  sourceScanned: number;
  sourceErrors: number;
  highlights: HermesReviewTask[];
  nextWeeklyRun: string;
};

type WebDependencies = {
  loadLatestScrapeState: typeof loadLatestScrapeState;
};

type TabId = "comparativa" | "productos" | "condiciones" | "admin" | "asistente" | "pdf" | "simulador" | "como-funciona" | "privacidad" | "novedades" | "scraper";

const TAB_LABELS: Array<{ id: TabId; label: string }> = [
  { id: "comparativa", label: "Comparativa" },
  { id: "productos", label: "Productos" },
  { id: "condiciones", label: "Condiciones" },
  { id: "admin", label: "Admin" },
  { id: "asistente", label: "Asistente" },
  { id: "pdf", label: "Asistente PDF" },
  { id: "scraper", label: "Scraper" },
  { id: "simulador", label: "Simulador" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "privacidad", label: "Privacidad" },
  { id: "novedades", label: "Novedades" },
];


type AssistantApiResponse = {
  profile: AssistantProfile;
  recommendations: AssistantRecommendation[];
  assistant?: {
    source: "structured" | "llm" | "regulatory";
    needsMoreInfo?: boolean;
    nextQuestion?: string;
    answerSummary?: string;
    validation?: {
      status: "validated" | "retryable" | "blocked";
      attempts: number;
      reason?: string;
    };
  };
};

type ProductCondition = {
  id: string;
  bank: string;
  productName: string;
  productKind: ProductCatalogRecord["productKind"];
  tae: number;
  fees: number;
  minBalance: number;
  maxBalance: number | null;
  durationMonths: number | null;
  source: string;
  sourceUrl?: string;
  requiresPayroll: boolean;
  requiresReceipts: boolean;
  requiresBizum: boolean;
  requiresConditions: boolean;
};

type ProductConditionsApiResponse = {
  products: ProductCondition[];
};

type PendingCondition = {
  id: string;
  bank: string;
  productName: string;
  productKind: ProductCatalogRecord["productKind"];
  tae: number;
  fees: number;
  minBalance: number;
  maxBalance: number | null;
  durationMonths: number | null;
  sourceUrl?: string;
  reviewNotes: string | null;
  evidenceCount: number;
  createdAt: string;
};

type PendingReviewApiResponse = {
  items: PendingCondition[];
  total: number;
};

type ReviewDecisionBody = {
  reviewNotes?: string;
  actor?: string;
};

type ManualConditionResponse = {
  status: "ok" | "blocked" | "invalid";
  message: string;
  product?: ProductCondition;
  validation?: {
    status: ParsedManualConditions["status"];
    attempts: number;
    reason?: string;
  };
};

type PdfAssistantResponse = {
  status: "ok" | "queued" | "blocked";
  action: "allow_llm_processing" | "queue_review_only" | "reject_upload";
  reasons: string[];
  recommendationProfile?: AssistantProfile;
  extractedProduct?: ProductCondition | null;
  recommendations?: AssistantRecommendation[];
  validation?: {
    status: ParsedPdfConditions["status"];
    attempts: number;
    reason?: string;
  };
};

const ASSISTANT_QUESTIONS: Array<{ id: keyof AssistantProfile; text: string; hint: string; options: { value: string; label: string; hint?: string }[] }> = [
  {
    id: "objective",
    text: "Que tipo de comparativa quieres priorizar?",
    hint: "La app ordena opciones en funcion de tu objetivo.",
    options: [
      { value: "rentabilidad", label: "Rentabilidad mensual", hint: "Cuentas remuneradas y altas TAE" },
      { value: "nomina", label: "Cuentas vinculadas a nomina", hint: "Bonos, condiciones y estabilidad mensual" },
      { value: "liquidez", label: "Liquidez diaria", hint: "Mover dinero sin restricciones" },
      { value: "deposito", label: "Ahorro a plazo", hint: "Mejor encaje de plazo fijo" },
    ],
  },
  {
    id: "vinculacion",
    text: "Quieres evitar condiciones extras?",
    hint: "Esto pesa bastante en el ranking de encaje.",
    options: [
      { value: "sin_condiciones", label: "Sin condiciones", hint: "Mejor si priorizas sencillez" },
      { value: "con_condiciones", label: "Acepto condiciones si la compensan", hint: "Prioriza ofertas con bonos o mejor TAE" },
      { value: "indiferente", label: "Indiferente", hint: "No me importa si compensa en el tiempo" },
    ],
  },
  {
    id: "horizonte",
    text: "Con que horizonte te sientes mas comodo?",
    hint: "El tiempo orienta peso de liquidez y duracion.",
    options: [
      { value: "corto", label: "Corto (hasta 3 meses)", hint: "Menos lock-in" },
      { value: "medio", label: "Medio (3 a 12 meses)", hint: "Balance entre tasa y flexibilidad" },
      { value: "largo", label: "Largo (12 meses o +)", hint: "Mejor para estructura de plazo" },
    ],
  },
  {
    id: "capitalBand",
    text: "Tu rango de capital aproximado",
    hint: "Ayuda a evitar productos fuera de tu escala.",
    options: [
      { value: "hasta_1000", label: "Hasta 1.000â‚¬" },
      { value: "1000_10000", label: "1.000â‚¬ - 10.000â‚¬" },
      { value: "10000_plus", label: "10.000â‚¬ o mas" },
    ],
  },
  {
    id: "payrollNeed",
    text: "Relacion con nomina o ingreso recurrente",
    hint: "Solo orientativo para mejor encaje.",
    options: [
      { value: "no_importante", label: "No es relevante", hint: "Comparativa con o sin nomina" },
      { value: "si_tengo_nomina", label: "Tengo nomina pero no es condicion", hint: "Me interesa si encaja mejor" },
      { value: "prioriza_nomina", label: "La nomina es clave", hint: "Prefiero mejores condiciones con nomina" },
    ],
  },
];

const ASSISTANT_OBJECTIVE_FALLBACK: AssistantProfile = {
  objective: "rentabilidad",
  vinculacion: "indiferente",
  horizonte: "medio",
  capitalBand: "1000_10000",
  payrollNeed: "no_importante",
};

function normalizeValue<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof raw === "string" && allowed.includes(raw as T)) {
    return raw as T;
  }
  return fallback;
}

function normalizeAssistantProfile(raw: unknown): AssistantProfile {
  if (!raw || typeof raw !== "object") {
    return ASSISTANT_OBJECTIVE_FALLBACK;
  }
  const source = raw as Partial<Record<keyof AssistantProfile, unknown>>;
  return {
    objective: normalizeValue(source.objective, ["rentabilidad", "nomina", "liquidez", "deposito"], ASSISTANT_OBJECTIVE_FALLBACK.objective),
    vinculacion: normalizeValue(source.vinculacion, ["sin_condiciones", "con_condiciones", "indiferente"], ASSISTANT_OBJECTIVE_FALLBACK.vinculacion),
    horizonte: normalizeValue(source.horizonte, ["corto", "medio", "largo"], ASSISTANT_OBJECTIVE_FALLBACK.horizonte),
    capitalBand: normalizeValue(source.capitalBand, ["hasta_1000", "1000_10000", "10000_plus"], ASSISTANT_OBJECTIVE_FALLBACK.capitalBand),
    payrollNeed: normalizeValue(source.payrollNeed, ["no_importante", "si_tengo_nomina", "prioriza_nomina"], ASSISTANT_OBJECTIVE_FALLBACK.payrollNeed),
  };
}

function getAdminTokenFromRequest(context: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const authHeader = context.req.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return context.req.header("x-admin-token");
}

function requireAdminToken(context: {
  req: {
    header: (name: string) => string | undefined;
  };
}): { ok: true; actor: string } | { ok: false; status: 401 | 403; message: string } {
  const configured = process.env.ADMIN_REVIEW_TOKEN ?? process.env.ADMIN_TOKEN;
  const token = getAdminTokenFromRequest(context);
  if (!configured) {
    return { ok: false, status: 403, message: "No hay token de administración configurado." };
  }
  if (!token || token !== configured) {
    return { ok: false, status: 401, message: "No autorizado para revisar productos." };
  }
  return { ok: true, actor: "web-admin" };
}

function _requireCsrfToken(context: {
  req: {
    header: (name: string) => string | undefined;
  };
}): { ok: true } | { ok: false; status: 403; message: string } {
  const csrf = context.req.header("x-csrf-token");
  if (csrf && csrf.length >= 8) {
    return { ok: true };
  }
  return { ok: false, status: 403, message: "CSRF token required." };
}

async function buildAssistantRecommendation(profile: AssistantProfile): Promise<AssistantRecommendation[]> {
  const catalog = await getApprovedCatalog();
  return rankCatalogForProfile(catalog, profile, 4);
}

function buildProductCondition(product: ProductCatalogRecord): ProductCondition {
  return {
    id: product.id,
    bank: product.bank,
    productName: product.productName,
    productKind: product.productKind,
    tae: product.tae,
    fees: product.fees,
    minBalance: product.minBalance,
    maxBalance: product.maxBalance,
    durationMonths: product.durationMonths,
    source: product.source,
    sourceUrl: product.sourceUrl,
    requiresPayroll: Boolean(product.requiresPayroll),
    requiresReceipts: Boolean(product.requiresReceipts),
    requiresBizum: Boolean(product.requiresBizum),
    requiresConditions: Boolean(product.requiresConditions),
  };
}

function buildAssistantProfile(raw: unknown): AssistantProfile {
  return normalizeAssistantProfile(raw);
}

function _parseProductKind(raw: string | null | undefined): ProductCatalogRecord["productKind"] | undefined {
  if (raw === "cuenta_remunerada" || raw === "cuenta_nomina" || raw === "deposito" || raw === "cuenta") {
    return raw;
  }
  return undefined;
}

function isLlmSaturationError(error: unknown): error is LlmRateLimitError {
  return error instanceof LlmRateLimitError;
}
type ProductFeature = {
  category: string;
  title: string;
  detail: string;
  estimate: string;
};

type RankingFeature = {
  rank: number;
  name: string;
  category: string;
  benefit: string;
  why: string;
  badge: string;
};

const PRODUCT_FEATURES: ProductFeature[] = [
  {
    category: "Cuenta bancaria",
    title: "Cuenta nómina digital",
    detail: "Comparación de comisiones, transferencias, app móvil y experiencia de pagos.",
    estimate: "Ahorro estimado mensual: 1 a 5â‚¬",
  },
  {
    category: "Cuenta remunerada",
    title: "Liquidez diaria con interés",
    detail: "Rentabilidad bruta, requisitos de uso y restricciones de cancelación.",
    estimate: "Beneficio estimado: 1.2% - 4.0% TAE",
  },
  {
    category: "Payroll",
    title: "Cuenta sueldo / nómina",
    detail: "Frecuencia de pagos, transferencias recurrentes y coste de mantenimiento.",
    estimate: "Ahorro estimado anual: 15 a 40â‚¬",
  },
  {
    category: "Depósito",
    title: "Plazo fijo y ahorro programado",
    detail: "Comparamos plazos, penalización y vencimientos por vencimiento.",
    estimate: "Simulación base: 300€ por 10.000€ a 12 meses",
  },
];

const RANKING_FEATURES: RankingFeature[] = [
  {
    rank: 1,
    name: "Nómina Plus",
    category: "Cuenta bancaria",
    benefit: "Beneficio estimado: 3.8â‚¬/mes",
    why: "Comisiones estables y pagos de nómina sin coste.",
    badge: "Base sólida",
  },
  {
    rank: 2,
    name: "Remunerada Horizonte",
    category: "Cuenta remunerada",
    benefit: "Beneficio estimado: 5,1% TAE",
    why: "Rentabilidad bruta competitiva y acceso sin fricción.",
    badge: "Alta liquidez",
  },
  {
    rank: 3,
    name: "Depósito Clave 12M",
    category: "Depósito",
    benefit: "Beneficio estimado: 420â‚¬/10.000â‚¬",
    why: "Condiciones transparentes con vencimientos predecibles.",
    badge: "Seguro",
  },
];

const STEPS = [
  {
    n: "01",
    t: "Entrada de datos",
    d: "Se toman fuentes públicas y campos aprobados de producto.",
  },
  {
    n: "02",
    t: "Control regulatorio",
    d: "Se bloquean categorías fuera del alcance: fondos, acciones, cripto, etc.",
  },
  {
    n: "03",
    t: "Ranking",
    d: "Se aplica ordenación con reglas de trazabilidad y transparencia.",
  },
  {
    n: "04",
    t: "Resultado",
    d: "Se publica comparativa, ranking y simulación con aviso de límites.",
  },
];

const defaultDependencies: WebDependencies = {
  loadLatestScrapeState,
};

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  } catch {
    return value;
  }
}

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseTab(raw: string | undefined): TabId {
  if (
    raw === "comparativa" ||
    raw === "productos" ||
    raw === "condiciones" ||
    raw === "asistente" ||
    raw === "pdf" ||
    raw === "simulador" ||
    raw === "como-funciona" ||
    raw === "privacidad" ||
    raw === "novedades"
  ) {
    return raw;
  }
  return "comparativa";
}

function renderFocusAreas(task: HermesReviewTask): string {
  if (task.focusAreas.length === 0) {
    return "";
  }
  const rows = task.focusAreas.map((entry) => `<li>${safeText(entry)}</li>`).join("");
    return `<div class="focus"><p>Focos de revisión</p><ul>${rows}</ul></div>`;
}

function renderTaskList(tasks: HermesReviewTask[]): string {
  if (tasks.length === 0) {
    return "<p>No hay tareas de revisión activas en este ciclo.</p>";
  }

  const rows = tasks
    .map(
      (task) => `
        <article class="review-item">
          <p class="meta">[${safeText(task.section)}] ${safeText(task.hermesLevel.toUpperCase())} · ${safeText(task.action)}</p>
          <p class="bank"><strong>${safeText(task.bank || "Fuente sin banco asociado")}</strong> · ${safeText(task.productKind)}</p>
          <p class="reason">${safeText(task.reason)}</p>
          ${renderFocusAreas(task)}
          <p class="effort">Esfuerzo estimado: ${safeText(task.estimatedEffort)}</p>
          <ul class="checks">${task.checksToConfirm.map((entry) => `<li>${safeText(entry)}</li>`).join("")}</ul>
          <p class="source"><a href="${safeText(task.sourceUrl)}" target="_blank" rel="noreferrer">Ver fuente</a></p>
        </article>`,
    )
    .join("");

  return `<div class="review-list">${rows}</div>`;
}

function renderProductCards(): string {
  return `<div class="feature-grid">${PRODUCT_FEATURES.map(
    (feature) => `
      <article class="feature-card">
        <p class="chip">${safeText(feature.category)}</p>
        <h4>${safeText(feature.title)}</h4>
        <p class="muted">${safeText(feature.detail)}</p>
        <p class="estimate">${safeText(feature.estimate)}</p>
      </article>
    `,
  ).join("")}</div>`;
}

function renderRankingCards(): string {
  return `<div class="rank-list">${RANKING_FEATURES.map(
    (entry) => `
      <article class="rank-item">
        <span class="rank-pill">#${entry.rank}</span>
        <div class="rank-body">
          <p class="rank-title"><strong>${safeText(entry.name)}</strong> <span class="muted">${safeText(entry.category)}</span></p>
          <p class="rank-why">${safeText(entry.why)}</p>
          <p class="estimate">${safeText(entry.benefit)}</p>
        </div>
        <span class="rank-badge">${safeText(entry.badge)}</span>
      </article>
    `,
  ).join("")}</div>`;
}

function renderAssistantPanel(): string {
  return `
    <h2>Asistente de comparativa</h2>
    <div id="assistant-step-meta" class="small-note">Responderas en pocos pasos, sin guardar datos sensibles.</div>
    <p class="lead">Puedes escribir una pregunta en lenguaje natural o responder 5 pasos guiados para obtener un ranking orientativo.</p>
    <form id="assistant-free-form" class="conditions-form">
      <label for="assistant-free-message">Pregunta o caso</label>
      <textarea id="assistant-free-message" name="message" placeholder="Ej: Tengo 10.000 euros y quiero una cuenta remunerada sin nomina."></textarea>
      <button type="submit">Interpretar con NAN y comparar</button>
      <p id="assistant-free-status" class="status"></p>
    </form>
    <div id="assistant-widget" class="assistant-widget" aria-live="polite">
      <div id="assistant-progress" class="small-note">Paso 1 de ${ASSISTANT_QUESTIONS.length}</div>
      <div id="assistant-question" class="assistant-question"></div>
      <div id="assistant-results" class="assistant-results"></div>
      <button id="assistant-restart" type="button" class="assistant-restart is-hidden">Volver a empezar</button>
    </div>
    <p class="small-note">No se entrega asesoramiento personalizado; esto es una vista de comparativa informativa y ranking.</p>
  `;
}

function renderConditionsPanel(): string {
  return `
    <h2>Condiciones de producto</h2>
    <p class="lead">Introduce condiciones de bancos por texto o sube un PDF para completar la base informativa.</p>
    <p class="small-note">No se guarda texto sensible; se almacenan solo los campos estructurados.</p>
    <section class="conditions-grid" id="conditions-grid">
      <article class="condition-card"><p>Cargando condiciones...</p></article>
    </section>

    <div class="conditions-forms">
      <form id="manual-conditions-form" class="conditions-form">
        <h3>Carga manual de condiciones</h3>
        <label for="manual-bank">Banco</label>
        <input id="manual-bank" name="bank" required placeholder="Ej: Banco Iberia" />
        <label for="manual-product-name">Nombre del producto</label>
        <input id="manual-product-name" name="productName" placeholder="Cuenta nómina..." />
        <label for="manual-kind">Tipo de producto</label>
        <select id="manual-kind" name="productKind" required>
          <option value="cuenta_remunerada">Cuenta remunerada</option>
          <option value="cuenta_nomina">Cuenta nómina</option>
          <option value="deposito">Depósito</option>
        </select>
        <label for="manual-text">Condiciones (texto plano)</label>
        <textarea id="manual-text" name="rawConditions" required placeholder="Pega aquí texto del banco."></textarea>
        <label for="manual-source">URL de origen (opcional)</label>
        <input id="manual-source" name="sourceUrl" placeholder="https://..." />
        <button type="submit">Añadir y validar condiciones</button>
        <p id="manual-status" class="status"></p>
      </form>

      <form id="assist-form" class="conditions-form">
        <h3>Asistente PDF</h3>
        <label for="assistant-pdf-bank">Banco</label>
        <input id="assistant-pdf-bank" name="bank" placeholder="Banco..." required />
        <label for="assistant-pdf-name">Producto (opcional)</label>
        <input id="assistant-pdf-name" name="productName" placeholder="Producto identificado" />
        <label for="assistant-pdf-source">URL de origen (opcional)</label>
        <input id="assistant-pdf-source" name="sourceUrl" placeholder="https://..." />
        <label for="assistant-pdf-file">Documento PDF</label>
        <input id="assistant-pdf-file" name="pdfFile" type="file" accept="application/pdf" required />
        <div id="pdf-assistant-meta" class="small-note">Si el documento parece seguro, generamos comparativa automáticamente.</div>
        <button type="submit">Procesar PDF para ranking</button>
        <p id="pdf-status" class="status"></p>
      </form>
    </div>

    <section id="assist-result" class="assistant-results"></section>
  `;
}

function renderAdminPanel(): string {
  return `
    <h2>Admin de revisiÃ³n</h2>
    <p class="lead">Revisa productos en <code>pending_review</code> antes de que puedan alimentar el ranking pÃºblico.</p>
    <form id="admin-token-form" class="conditions-form admin-token-form">
      <label for="admin-token">Token de revisión</label>
      <input id="admin-token" name="adminToken" type="password" autocomplete="off" placeholder="ADMIN_REVIEW_TOKEN" />
      <input id="admin-csrf" type="hidden" value="banco-ai-csrf-2026" />
      <div class="admin-actions">
        <button type="submit">Cargar pendientes</button>
        <button id="admin-token-clear" type="button" class="secondary-button">Borrar token local</button>
      </div>
      <p id="admin-status" class="status"></p>
      <p class="small-note">El token se guarda solo en sessionStorage de este navegador. No se envÃ­a salvo en llamadas admin.</p>
    </form>
    <section class="admin-summary" id="admin-summary">
      <div class="metric"><span>Pendientes</span><strong id="admin-pending-count">-</strong></div>
      <div class="metric"><span>Estado</span><strong id="admin-review-state">Sin cargar</strong></div>
    </section>
    <section id="admin-pending-list" class="admin-pending-list">
      <article class="condition-card"><p>Introduce el token para cargar productos pendientes.</p></article>
    </section>
  `;
}

function renderPdfAssistantPanel(): string {
  return `
    <h2>Analizador de PDF</h2>
    <p class="lead">Sube un PDF con condiciones bancarias y obtén un analisis estructurado de lo que hay que tener en cuenta: TAE, requisitos, comisiones, vinculaciones, plazos y condiciones especiales.</p>
    <p class="small-note">No se envía texto sin estructura ni datos personales. El analisis es informativo, no asesoramiento.</p>
    <form id="pdf-analyze-form" class="conditions-form">
      <label for="pdf-analyze-bank">Banco</label>
      <input id="pdf-analyze-bank" name="bank" placeholder="Banco..." required />
      <label for="pdf-analyze-file">Documento PDF</label>
      <input id="pdf-analyze-file" name="pdfFile" type="file" accept="application/pdf" required />
      <button type="submit">Analizar PDF</button>
      <p id="pdf-analyze-status" class="status"></p>
    </form>
    <div id="pdf-analyze-result" class="assistant-results"></div>
  `;
}

function renderHowWorks(): string {
  return `<div class="steps">${STEPS.map(
    (step) => `
      <div class="step-item">
        <p class="step-number">${safeText(step.n)}</p>
        <h4>${safeText(step.t)}</h4>
        <p class="muted">${safeText(step.d)}</p>
      </div>
    `,
  ).join("")}</div>`;
}

function renderScraperPanel(): string {
  return `
    <h2>Scraper de productos</h2>
    <p class="lead">Última corrida de scraping: estado de fuentes, cambios detectados y productos pendientes de revisión.</p>
    <p class="small-note">El scraper corre automáticamente cada domingo. Los cambios financieros van a revisión manual, nunca se aprueban solos.</p>
    <div id="scraper-summary" class="hero-metrics">
      <div class="metric"><span>Última corrida</span><strong id="scraper-last-run">-</strong></div>
      <div class="metric"><span>Fuentes escaneadas</span><strong id="scraper-sources">-</strong></div>
      <div class="metric"><span>Con errores</span><strong id="scraper-errors">-</strong></div>
    </div>
    <section id="scraper-pending-list" class="admin-pending-list">
      <article class="condition-card"><p>Cargando estado del scraper...</p></article>
    </section>
  `;
}

function renderPage(plan: HermesReviewPlan | undefined, tab: TabId): string {
  const generatedAt = plan?.generatedAt;
  const taskCount = plan?.totalTasks ?? 0;
  const highlights = plan?.highlights ?? [];
  const sundayHour = Number(process.env.SCRAPER_WEEKLY_HOUR ?? "3");
  const sundayMinute = Number(process.env.SCRAPER_WEEKLY_MINUTE ?? "15");
  const sundayText = `Domingo ${String(sundayHour).padStart(2, "0")}:${String(sundayMinute).padStart(2, "0")} (Europe/Madrid)`;
  const activePanels = (id: TabId): string => (id === tab ? "" : " is-hidden");

  const metricCards = `
      <div class="metric"><span>Última corrida</span><strong>${generatedAt ? formatDateTime(generatedAt) : "Sin datos previos"}</strong></div>
    <div class="metric"><span>Tareas activas</span><strong>${taskCount}</strong></div>
    <div class="metric"><span>Escaneo semanal</span><strong>${safeText(sundayText)}</strong></div>
  `;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Banco AI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <style>
      :root{--bg:#050f22;--surface:rgba(13,28,53,.85);--surface2:rgba(16,33,62,.95);--text:#eef4ff;--muted:#acc0dd;--line:rgba(255,255,255,.14);--accent:#66a9ff;--accent2:#72f6d0;--shadow:0 24px 64px -35px rgba(0,0,0,.8)}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,Arial,sans-serif;color:var(--text);background:radial-gradient(circle at 18% 14%,rgba(102,169,255,.24),transparent 32%),radial-gradient(circle at 84% 8%,rgba(114,246,208,.22),transparent 28%),linear-gradient(160deg,#040c18,#081a33 40%,#0f2750)}
      .grain{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(transparent 96%,rgba(255,255,255,.03) 97%,transparent 98%),linear-gradient(90deg,transparent 96%,rgba(255,255,255,.03) 97%,transparent 98%);background-size:120px 120px;opacity:.3;z-index:0}
      .page{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:1rem}
      .topbar{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem;margin:-1rem -1rem 1rem;border-bottom:1px solid var(--line);background:rgba(5,14,31,.75);backdrop-filter:blur(12px)}
      .brand{display:inline-flex;align-items:center;gap:.7rem;color:var(--text);text-decoration:none}.brand-mark{width:2.1rem;height:2.1rem;border-radius:.7rem;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(145deg,var(--accent),#86b8ff);color:#06152d;font-weight:800;font-family:"Space Grotesk",Inter,sans-serif}.brand-name{font-family:"Space Grotesk",Inter,sans-serif;font-size:.95rem}.brand-sub{display:block;font-size:.72rem;color:var(--muted);margin-top:2px}
      .topbar a{border:1px solid var(--line);border-radius:999px;padding:.42rem .7rem;text-decoration:none;font-size:.82rem;color:var(--text)}
      .hero{border:1px solid var(--line);border-radius:1rem;padding:1.3rem;background:var(--surface);box-shadow:var(--shadow);position:relative;overflow:hidden}
      .hero::after{content:"";position:absolute;right:-100px;top:-60px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(114,246,208,.28),transparent 64%)}
      .hero h1{margin:.3rem 0 .65rem 0;font-size:clamp(1.8rem,3.5vw,3rem);line-height:1.05;font-family:"Space Grotesk",Inter,sans-serif;max-width:28ch}
      .hero p{max-width:68ch;color:var(--muted);line-height:1.45}
      .chips{display:flex;gap:.5rem;flex-wrap:wrap;margin:.7rem 0}.chip{border:1px solid var(--line);border-radius:999px;padding:.2rem .58rem;font-size:.74rem;letter-spacing:.07em;text-transform:uppercase;color:#d2e3ff}
      .hero-metrics{margin-top:.9rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.58rem}
      .metric{border:1px solid var(--line);border-radius:.7rem;padding:.65rem;background:rgba(255,255,255,.03)}.metric span{font-size:.82rem;color:var(--muted)}.metric strong{display:block;margin-top:.25rem}
      .tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:.45rem;padding:.45rem;background:var(--surface);border:1px solid var(--line);border-radius:.9rem;margin-top:1rem}
      .tab-btn{padding:.72rem .45rem;border:none;border-radius:.7rem;cursor:pointer;background:transparent;color:var(--text);font-family:"Space Grotesk",Inter,sans-serif;font-weight:600}
      .tab-btn[aria-selected="true"]{background:linear-gradient(145deg,#fff,#d8ebff);color:#041327}
      .panel{margin-top:1rem;background:var(--surface);border:1px solid var(--line);border-radius:1rem;padding:1rem}
      .panel.is-hidden{display:none}
      h2{margin:0;font-family:"Space Grotesk",Inter,sans-serif}
      .lead{color:var(--muted);margin:.4rem 0 .95rem;line-height:1.45}
      .muted{color:var(--muted)}
      .feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.65rem}
      .feature-card{border:1px dashed rgba(255,255,255,.2);border-radius:.8rem;padding:.8rem;background:linear-gradient(150deg,rgba(10,24,49,.85),rgba(10,24,49,.55))}
      .feature-card h4,.step-item h4,.rank-title{font-family:"Space Grotesk",Inter,sans-serif}.feature-card p{margin:.45rem 0 0}
      .estimate{margin-top:.5rem !important;color:var(--accent2);font-weight:600}
      .rank-list{display:grid;gap:.6rem}.rank-item{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:.75rem;padding:.75rem;display:grid;grid-template-columns:auto 1fr auto;gap:.55rem;align-items:start}
      .rank-pill{width:2.1rem;height:2.1rem;border-radius:.45rem;background:linear-gradient(130deg,var(--accent),#85b8ff);display:inline-flex;align-items:center;justify-content:center;color:#07192f;font-weight:800}
      .rank-title{margin:.1rem 0 0;color:#f2f8ff}.rank-title .muted{margin-left:.3rem}
      .rank-why{margin:.4rem 0 .4rem;color:#d5e4ff}
      .rank-badge{font-size:.76rem;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:.2rem .58rem;white-space:nowrap}
      .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.65rem}
      .step-item{border:1px solid var(--line);border-radius:.75rem;padding:.75rem;background:rgba(8,22,45,.6)}
      .step-item h4{margin:.4rem 0 0}.step-item .muted{margin-top:.38rem}
      .step-number{margin:0;color:var(--accent);letter-spacing:.16em;text-transform:uppercase;font-size:.73rem}
      .sim-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
      label{display:block;color:#d6e4ff;margin-bottom:.2rem;font-size:.86rem}
      input{width:100%;padding:.63rem;border:1px solid var(--line);border-radius:.55rem;margin-bottom:.6rem}
      button{border:0;border-radius:999px;padding:.63rem 1rem;background:var(--accent);color:#051e3e;font-weight:700;font-family:"Space Grotesk",Inter,sans-serif;cursor:pointer}
      .sim-result{margin-top:.45rem;border:1px dashed rgba(114,246,208,.8);background:rgba(11,33,64,.8);border-radius:.65rem;padding:.7rem;color:#d8fff3}
      .small-note{margin-top:.85rem;color:var(--muted);font-size:.92rem}
      .assistant-widget{border:1px solid var(--line);border-radius:.75rem;padding:.75rem;background:rgba(12,32,62,.72)}
      .assistant-question h3{margin:.3rem 0 .1rem}
      .assistant-options{display:grid;gap:.45rem;margin-top:.45rem}
      .assistant-option{width:100%;text-align:left;padding:.72rem .8rem;border:1px solid var(--line);border-radius:.62rem;background:rgba(255,255,255,.03);color:var(--text);font-family:\"Space Grotesk\",Inter,sans-serif;cursor:pointer}
      .assistant-option:hover{border-color:#9fd2ff}
      .assistant-option[data-selected=\"true\"]{border-color:#85b8ff;background:rgba(102,169,255,.16)}
      .assistant-question{display:grid;gap:.4rem}
      .assistant-progress{font-weight:700}
      .assistant-results{margin-top:.6rem;display:grid;gap:.45rem}
      .assistant-result-item{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:.75rem;padding:.72rem;background:rgba(255,255,255,.03)}
      .assistant-result-title{margin:.15rem 0;font-family:\"Space Grotesk\",Inter,sans-serif}
      .assistant-result-meta{color:#c9dcff;font-size:.88rem;margin:.2rem 0}
      .assistant-result-why{color:#dde9ff}
      .assistant-result-cta{margin-top:.3rem;color:#9bd8c6;font-weight:700}
      .assistant-result-benefit{color:#b7ffd3;font-weight:700}
      .conditions-grid{display:grid;gap:.6rem}
      .condition-card{padding:.65rem;border:1px solid var(--line);border-radius:.7rem;background:rgba(255,255,255,.04)}
      .condition-card .muted{margin:.25rem 0}
      .conditions-forms{display:grid;gap:.7rem;margin-top:.8rem}
      .conditions-form{border:1px solid var(--line);border-radius:.8rem;padding:.7rem;background:rgba(255,255,255,.03);display:grid;gap:.45rem}
      .conditions-form label{font-size:.88rem;color:#c7d6f1}
      .conditions-form input,.conditions-form select,.conditions-form textarea{width:100%;padding:.6rem;border:1px solid var(--line);border-radius:.5rem;background:rgba(255,255,255,.06);color:#e9f2ff}
      .conditions-form textarea{min-height:140px;resize:vertical}
      .admin-token-form input{margin-bottom:0}
      .admin-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;margin:.8rem 0}
      .admin-pending-list{display:grid;gap:.65rem}
      .admin-card{border:1px solid var(--line);border-radius:.8rem;padding:.75rem;background:rgba(255,255,255,.04)}
      .admin-card-header{display:flex;justify-content:space-between;gap:.7rem;align-items:flex-start;flex-wrap:wrap}
      .admin-card-title{margin:.2rem 0;font-family:"Space Grotesk",Inter,sans-serif}
      .admin-card-meta{margin:.15rem 0;color:#c9dcff;font-size:.88rem}
      .admin-evidence{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.45rem;margin:.6rem 0}
      .admin-evidence div{border:1px dashed rgba(255,255,255,.18);border-radius:.55rem;padding:.45rem;background:rgba(4,15,34,.45)}
      .admin-evidence span{display:block;color:var(--muted);font-size:.76rem}
      .admin-review-notes{min-height:74px !important;margin-top:.35rem}
      .admin-actions{display:flex;gap:.45rem;flex-wrap:wrap;align-items:center}
      .secondary-button{background:rgba(255,255,255,.08);color:var(--text);border:1px solid var(--line)}
      .danger-button{background:#ff9aa8;color:#2b0710}
      .status{font-weight:700}
      .status.ok{color:#a6ffd0}
      .status.warn{color:#ffdd7a}
      .status.bad{color:#ff93a1}
      .assistant-restart{margin-top:.6rem;padding:.48rem 1rem;border-radius:999px;background:rgba(255,255,255,.08);color:var(--text);display:inline-block}
      .assistant-restart.is-hidden{display:none}
      .focus{margin-top:.5rem;border:1px dashed rgba(255,255,255,.2);border-radius:.55rem;padding:.5rem}.focus p{margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.09em;color:#cfe4ff}.focus ul{margin:.4rem 0 0;padding-left:1.1rem;color:#e5f1ff}
      .review-list .review-item{border:1px dashed rgba(255,255,255,.25);border-radius:.75rem;padding:.7rem;margin-bottom:.6rem;background:rgba(11,24,48,.95)}
      .review-list .meta{margin:0;color:#9fc0ff;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase}
      .review-list .bank{margin:.25rem 0}.review-list .reason{margin:0;color:#f2f6ff}.review-list .checks{margin:.4rem 0 0;padding-left:1.2rem;color:#dce8ff}.review-list .source a{color:#8fd1ff}.review-list .effort{margin:.38rem 0 0;color:#bbffd7;font-size:.83rem}
      .footer{text-align:center;color:var(--muted);font-size:.78rem;margin-top:.7rem}
      @media (max-width: 980px){.tabs{grid-template-columns:repeat(3,minmax(0,1fr))}.hero-metrics,.sim-grid{grid-template-columns:1fr}.rank-item{grid-template-columns:auto 1fr}}
      @media (max-width: 640px){.topbar{flex-wrap:wrap}}
    </style>
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>
    <div class="page">
      <header class="topbar">
        <a class="brand" href="/">
          <span class="brand-mark">BA</span>
          <span>
            <span class="brand-name">Banco AI</span>
            <span class="brand-sub">Comparativa • ranking • simulación</span>
          </span>
        </a>
        <a href="/api/novedades">/api/novedades</a>
      </header>

      <section class="hero">
        <p class="chip">Banco AI • Comparativa bancaria informativa</p>
        <h1>Como entrar a un banco, pero en formato comparativa.</h1>
        <p>Un sitio de productos para mostrar <strong>comparación</strong>, <strong>ranking</strong> y <strong>simulación</strong> de forma clara, sin generar recomendaciones personalizadas.</p>
        <div class="chips">
          <span class="chip">Comparación</span>
          <span class="chip">Ranking</span>
          <span class="chip">Simulación</span>
          <span class="chip">Beneficio estimado</span>
        </div>
        <div class="hero-metrics">${metricCards}</div>
      </section>

      <nav class="tabs" aria-label="Navegación principal">
        ${TAB_LABELS.map(
          (item) => `<button class="tab-btn" data-tab-button="${safeText(item.id)}" type="button" aria-controls="panel-${safeText(item.id)}" aria-selected="${item.id === tab ? "true" : "false"}">${safeText(item.label)}</button>`,
        ).join("")}
      </nav>

      <section id="panel-comparativa" class="panel${activePanels("comparativa")}" data-tab-panel="comparativa">
        <h2>Comparativa</h2>
        <p class="lead">Resumen de cuentas, payroll, cuentas remuneradas y depósitos para tomar decisiones informadas.</p>
        ${renderProductCards()}
      </section>

      <section id="panel-productos" class="panel${activePanels("productos")}" data-tab-panel="productos">
        <h2>Productos y ranking</h2>
        <p class="lead">Ranking de referencia con ordenación por criterios de coste y rendimiento.</p>
        ${renderRankingCards()}
        <p class="small-note">Estos valores son orientativos. No se da asesoría personalizada ni recomendación de inversión.</p>
      </section>

      <section id="panel-asistente" class="panel${activePanels("asistente")}" data-tab-panel="asistente">
        ${renderAssistantPanel()}
      </section>

      <section id="panel-condiciones" class="panel${activePanels("condiciones")}" data-tab-panel="condiciones">
        ${renderConditionsPanel()}
      </section>

      <section id="panel-admin" class="panel${activePanels("admin")}" data-tab-panel="admin">
        ${renderAdminPanel()}
      </section>

      <section id="panel-pdf" class="panel${activePanels("pdf")}" data-tab-panel="pdf">
        ${renderPdfAssistantPanel()}
      </section>

      <section id="panel-simulador" class="panel${activePanels("simulador")}" data-tab-panel="simulador">
        <h2>Simulador de beneficio estimado</h2>
        <p class="lead">Introduce un capital y ve un resultado base para ayudarte a comparar escenarios.</p>
        <div class="sim-grid">
          <form id="sim-form">
            <label for="sim-capital">Capital (EUR)</label>
            <input id="sim-capital" type="number" min="0" step="50" value="5000" />
            <label for="sim-tasa">TAE anual (%)</label>
            <input id="sim-tasa" type="number" min="0" step="0.1" value="3.2" />
            <label for="sim-plazo">Plazo (meses)</label>
            <input id="sim-plazo" type="number" min="1" step="1" value="12" />
            <button type="submit">Calcular</button>
          </form>
          <div>
            <div id="sim-result" class="sim-result">Introduce los valores para ver el beneficio estimado.</div>
            <p class="small-note">No sustituye consejo financiero y no incluye impuestos/comisiones reales.</p>
          </div>
        </div>
      </section>

      <section id="panel-como-funciona" class="panel${activePanels("como-funciona")}" data-tab-panel="como-funciona">
        <h2>Cómo funciona</h2>
        <p class="lead">La lógica de Banco AI se centra en comparar, auditar y publicar datos de productos.</p>
        ${renderHowWorks()}
      </section>

      <section id="panel-privacidad" class="panel${activePanels("privacidad")}" data-tab-panel="privacidad">
        <h2>Privacidad</h2>
        <div class="steps">
          <div class="step-item"><h4>No recopilamos</h4><p class="muted">IBAN, DNI/NIE, email ni teléfono para la comparativa pública.</p></div>
          <div class="step-item"><h4>Logs controlados</h4><p class="muted">La información sensible no se guarda en texto plano.</p></div>
          <div class="step-item"><h4>Sin consejo</h4><p class="muted">No ofrecemos asesoría personalizada, solo información de apoyo.</p></div>
        </div>
      </section>

      <section id="panel-novedades" class="panel${activePanels("novedades")}" data-tab-panel="novedades">
        <h2>Novedades</h2>
        <p class="lead">Cambios detectados para revisión manual por la capa de calidad.</p>
        <div class="hero-metrics">
          <div class="metric"><span>Total cambios</span><strong>${plan?.totalTasks ?? 0}</strong></div>
          <div class="metric"><span>Altas</span><strong>${plan?.highCount ?? 0}</strong></div>
          <div class="metric"><span>Críticas</span><strong>${plan?.criticalCount ?? 0}</strong></div>
        </div>
        ${renderTaskList(highlights)}
        <p class="small-note">También disponible vía JSON en <a href="/api/novedades">/api/novedades</a>.</p>
      </section>

      <section id="panel-scraper" class="panel${activePanels("scraper")}" data-tab-panel="scraper">
        ${renderScraperPanel()}
      </section>

      <p class="footer">Banco AI no realiza recomendaciones personalizadas. Solo ofrece información informativa y simulaciones orientativas.</p>
    </div>

    <script>
      (function () {
        const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
        const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
        const params = new URLSearchParams(window.location.search);
        const allowed = new Set(["comparativa","productos","asistente","condiciones","admin","pdf","scraper","simulador","como-funciona","privacidad","novedades"]);
        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }
        const assistantQuestions = ${JSON.stringify(
          ASSISTANT_QUESTIONS.map((question) => ({
            id: question.id,
            text: question.text,
            hint: question.hint,
            options: question.options,
          })),
        )};
        const assistantForm = {
          step: 0,
          answers: {},
        };
        let lastRecommendations = [];

        const assistantProgress = document.getElementById("assistant-progress");
        const assistantQuestion = document.getElementById("assistant-question");
        const assistantResults = document.getElementById("assistant-results");
        const assistantRestart = document.getElementById("assistant-restart");
        const assistantFreeForm = document.getElementById("assistant-free-form");
        const assistantFreeMessage = document.getElementById("assistant-free-message");
        const assistantFreeStatus = document.getElementById("assistant-free-status");

        function renderAssistantQuestion(stepIndex) {
          if (!assistantQuestion || !assistantProgress) {
            return;
          }
          if (!assistantQuestions[stepIndex]) {
            return;
          }
          const question = assistantQuestions[stepIndex];
          assistantProgress.textContent = "Paso " + (stepIndex + 1) + " de " + assistantQuestions.length;
          const options = question.options
            .map(
              (option) =>
                '<button type="button" class="assistant-option" data-question="' +
                question.id +
                '" data-value="' +
                option.value +
                '">' +
                escapeHtml(option.label) +
                (option.hint ? " · " + escapeHtml(option.hint) : "") +
                "</button>"
            )
            .join("");
          assistantQuestion.innerHTML =
            "<div class='assistant-step'>" +
            "<h3 class='step-title'>" +
            escapeHtml(question.text) +
            "</h3>" +
            "<p class='small-note'>" +
            escapeHtml(question.hint) +
            "</p>" +
            "<div class='assistant-options'>" +
            options +
            "</div>" +
            "</div>";
          Array.from(assistantQuestion.querySelectorAll(".assistant-option")).forEach((button) => {
            button.addEventListener("click", () => {
              const qid = button.getAttribute("data-question");
              const value = button.getAttribute("data-value");
              if (qid && value) {
                assistantForm.answers[qid] = value;
              }
              assistantForm.step += 1;
              if (assistantForm.step >= assistantQuestions.length) {
                void computeAssistantRanking();
              } else {
                renderAssistantQuestion(assistantForm.step);
              }
            });
          });
        }

        async function computeAssistantRanking() {
          if (!assistantResults) {
            return;
          }
          const payload = {
            objective: assistantForm.answers.objective || "rentabilidad",
            vinculacion: assistantForm.answers.vinculacion || "indiferente",
            horizonte: assistantForm.answers.horizonte || "medio",
            capitalBand: assistantForm.answers.capitalBand || "1000_10000",
            payrollNeed: assistantForm.answers.payrollNeed || "no_importante",
          };
          try {
            const response = await fetch("/api/assistant/recommend", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await response.json();
            lastRecommendations = data?.recommendations ?? [];
            assistantQuestion.innerHTML = "<h3>Resultado orientativo</h3>";
            if (lastRecommendations.length === 0) {
              assistantResults.innerHTML = "<p>No hay resultados para este perfil con la base de muestra.</p>";
              return;
            }
            assistantResults.innerHTML = lastRecommendations
              .map(
                (entry) =>
                  "<article class=\"assistant-result-item\">" +
                  "<p class=\"assistant-result-title\">#" +
                  entry.rank +
                  " " +
                  escapeHtml(entry.product.name) +
                  " <span class=\"assistant-result-meta\">- " +
                  escapeHtml(entry.product.bank) +
                  " · " +
                  escapeHtml(entry.product.category) +
                  "</span></p>" +
                  "<p class=\"assistant-result-why\">" +
                  escapeHtml(entry.why || "Sin razonamiento adicional.") +
                  "</p>" +
                  "<p class=\"assistant-result-benefit\">" +
                  escapeHtml(entry.benefit || "") +
                  "</p>" +
                  "<p class=\"assistant-result-meta\">" +
                  escapeHtml(entry.fit || "") +
                  "</p>" +
              "<p class=\"assistant-result-cta\">Comparativa orientativa: no es recomendación personalizada.</p>" +
                  "</article>"
              )
              .join("");
            if (assistantRestart) {
              assistantRestart.classList.remove("is-hidden");
            }
          } catch (error) {
            assistantResults.innerHTML = "<p>No fue posible calcular la comparativa ahora mismo. Intenta de nuevo.</p>";
          }
        }

        function resetAssistant() {
          assistantForm.step = 0;
          assistantForm.answers = {};
          if (assistantResults) {
            assistantResults.innerHTML = "";
          }
          if (assistantRestart) {
            assistantRestart.classList.add("is-hidden");
          }
          renderAssistantQuestion(0);
        }

        function activate(tab) {
          buttons.forEach((btn) => btn.setAttribute("aria-selected", btn.dataset.tabButton === tab ? "true" : "false"));
          panels.forEach((p) => {
            const visible = p.dataset.tabPanel === tab;
            p.classList.toggle("is-hidden", !visible);
            p.hidden = !visible;
          });
          params.set("tab", tab);
          const next = window.location.pathname + "?" + params.toString();
          window.history.replaceState({}, "", next);
        }

        function readTab() {
          const fromQuery = params.get("tab") || "";
          if (allowed.has(fromQuery)) return fromQuery;
          const fromHash = window.location.hash ? window.location.hash.slice(1) : "";
          return allowed.has(fromHash) ? fromHash : "comparativa";
        }

        async function computeAssistantFromMessage(message) {
          if (!assistantResults || !assistantQuestion) {
            return;
          }
          if (!message || !message.trim()) {
            if (assistantFreeStatus) {
              setStatus(assistantFreeStatus, "Escribe una pregunta para interpretarla.", "bad");
            }
            return;
          }
          if (assistantFreeStatus) {
            setStatus(assistantFreeStatus, "Interpretando con NAN...", "warn");
          }
          try {
            const response = await fetch("/api/assistant/recommend", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message }),
            });
            const data = await response.json();
            if (!response.ok) {
              if (assistantFreeStatus) {
                setStatus(assistantFreeStatus, "La cola de NAN esta saturada. Intenta de nuevo en unos minutos.", "bad");
              }
              return;
            }
            lastRecommendations = data?.recommendations ?? [];
            const assistant = data?.assistant || {};
            assistantQuestion.innerHTML =
              "<h3>Lectura de tu pregunta</h3>" +
              "<p class='small-note'>" +
              escapeHtml(assistant.answerSummary || "Perfil interpretado para comparativa informativa.") +
              "</p>" +
              (assistant.needsMoreInfo && assistant.nextQuestion
                ? "<p class='small-note'>Siguiente dato util: " + escapeHtml(assistant.nextQuestion) + "</p>"
                : "");
            if (lastRecommendations.length === 0) {
              assistantResults.innerHTML = "<p>No hay resultados aprobados para este perfil.</p>";
            } else {
              assistantResults.innerHTML = lastRecommendations
                .map(
                  (entry) =>
                    "<article class=\"assistant-result-item\">" +
                    "<p class=\"assistant-result-title\">#" +
                    entry.rank +
                    " " +
                    escapeHtml(entry.product.name) +
                    " <span class=\"assistant-result-meta\">- " +
                    escapeHtml(entry.product.bank) +
                    " Â· " +
                    escapeHtml(entry.product.category) +
                    "</span></p>" +
                    "<p class=\"assistant-result-why\">" +
                    escapeHtml(entry.why || "Sin razonamiento adicional.") +
                    "</p>" +
                    "<p class=\"assistant-result-benefit\">" +
                    escapeHtml(entry.benefit || "") +
                    "</p>" +
                    "<p class=\"assistant-result-meta\">" +
                    escapeHtml(entry.fit || "") +
                    "</p>" +
                    "<p class=\"assistant-result-cta\">Comparativa orientativa: no es recomendaciÃ³n personalizada.</p>" +
                    "</article>"
                )
                .join("");
            }
            if (assistantFreeStatus) {
              setStatus(assistantFreeStatus, "Pregunta interpretada y ranking calculado.", "ok");
            }
            if (assistantRestart) {
              assistantRestart.classList.remove("is-hidden");
            }
          } catch (error) {
            if (assistantFreeStatus) {
              setStatus(assistantFreeStatus, "No fue posible interpretar la pregunta ahora mismo.", "bad");
            }
          }
        }

        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            const tab = button.dataset.tabButton || "comparativa";
            activate(tab);
            if (tab === "condiciones" || tab === "productos") {
              loadConditions().catch(function () {});
            }
            if (tab === "admin") {
              loadPendingReviews().catch(function () {});
            }
            if (tab === "scraper") {
              loadScraperStatus().catch(function () {});
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });

        if (assistantQuestion && assistantProgress && assistantResults && assistantRestart) {
          assistantRestart.addEventListener("click", () => resetAssistant());
          if (assistantFreeForm) {
            assistantFreeForm.addEventListener("submit", (event) => {
              event.preventDefault();
              const message = assistantFreeMessage && "value" in assistantFreeMessage ? assistantFreeMessage.value : "";
              void computeAssistantFromMessage(message);
            });
          }
          renderAssistantQuestion(0);
        }

        const conditionsGrid = document.getElementById("conditions-grid");
        const manualConditionsForm = document.getElementById("manual-conditions-form");
        const manualStatus = document.getElementById("manual-status");
        const assistantPdfForm = document.getElementById("assist-form");
        const pdfStatus = document.getElementById("pdf-status");
        const assistResult = document.getElementById("assist-result");
        const pdfAnalyzeForm = document.getElementById("pdf-analyze-form");
        const pdfAnalyzeStatus = document.getElementById("pdf-analyze-status");
        const pdfAnalyzeResult = document.getElementById("pdf-analyze-result");
        const pdfOnlyResult = document.getElementById("pdf-only-result");
        const adminTokenForm = document.getElementById("admin-token-form");
        const adminTokenInput = document.getElementById("admin-token");
        const adminTokenClear = document.getElementById("admin-token-clear");
        const adminStatus = document.getElementById("admin-status");
        const adminPendingList = document.getElementById("admin-pending-list");
        const adminPendingCount = document.getElementById("admin-pending-count");
        const adminReviewState = document.getElementById("admin-review-state");
        const scraperSummary = document.getElementById("scraper-summary");
        const scraperLastRun = document.getElementById("scraper-last-run");
        const scraperSources = document.getElementById("scraper-sources");
        const scraperErrors = document.getElementById("scraper-errors");
        const scraperPendingList = document.getElementById("scraper-pending-list");

        function formatCurrency(amount) {
          try {
            return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(amount);
          } catch {
            return String(amount);
          }
        }

        function renderConditionRows(items) {
          if (!conditionsGrid) {
            return;
          }
          if (!Array.isArray(items) || items.length === 0) {
            conditionsGrid.innerHTML = "<article class=\"condition-card\"><p>No hay condiciones cargadas.</p></article>";
            return;
          }
          const rows = items
            .map(function (item) {
              const kindLabel = item.productKind === "cuenta_remunerada" ? "Remunerada" : item.productKind === "cuenta_nomina" ? "Nómina" : item.productKind === "deposito" ? "Depósito" : "Cuenta";
              return (
                "<article class=\"condition-card\">" +
                "<p class=\"small-note\"><strong>" +
                escapeHtml(item.bank || "") +
                "</strong> · " +
                kindLabel +
                "</p>" +
                "<p><strong>" +
                escapeHtml(item.productName || "") +
                "</strong></p>" +
                "<p class=\"muted\">TAE " +
                formatCurrency(item.tae || 0) +
                " · comisiones " +
                formatCurrency(item.fees || 0) +
                "</p>" +
                "</article>"
              );
            })
            .join("");
          conditionsGrid.innerHTML = rows;
        }

        async function loadConditions() {
          try {
            const response = await fetch("/api/product-conditions");
            const data = await response.json();
            renderConditionRows(data?.products || []);
          } catch (error) {
            if (conditionsGrid) {
              conditionsGrid.innerHTML = "<article class=\"condition-card\"><p>No fue posible cargar condiciones.</p></article>";
            }
          }
        }

        function setStatus(element, message, level) {
          if (!element) {
            return;
          }
          element.textContent = message;
          element.className = "status " + (level || "");
        }

        function getAdminToken() {
          const fromInput = adminTokenInput && "value" in adminTokenInput ? String(adminTokenInput.value || "").trim() : "";
          if (fromInput) {
            try {
              sessionStorage.setItem("banco-ai-admin-token", fromInput);
            } catch {}
            return fromInput;
          }
          try {
            return sessionStorage.getItem("banco-ai-admin-token") || "";
          } catch {
            return "";
          }
        }

        function renderPendingReviews(items) {
          if (!adminPendingList) {
            return;
          }
          if (adminPendingCount) {
            adminPendingCount.textContent = String(Array.isArray(items) ? items.length : 0);
          }
          if (adminReviewState) {
            adminReviewState.textContent = Array.isArray(items) && items.length > 0 ? "Requiere revisión" : "Sin pendientes";
          }
          if (!Array.isArray(items) || items.length === 0) {
            adminPendingList.innerHTML = "<article class=\"condition-card\"><p>No hay productos pendientes de revisión.</p></article>";
            return;
          }
          adminPendingList.innerHTML = items
            .map(function (item) {
              const source = item.sourceUrl ? "<p class=\"admin-card-meta\">Fuente: " + escapeHtml(item.sourceUrl) + "</p>" : "";
              return (
                "<article class=\"admin-card\" data-pending-id=\"" + escapeHtml(item.id) + "\">" +
                "<div class=\"admin-card-header\">" +
                "<div>" +
                "<p class=\"admin-card-meta\">" + escapeHtml(item.bank || "") + " · " + escapeHtml(item.productKind || "") + "</p>" +
                "<h3 class=\"admin-card-title\">" + escapeHtml(item.productName || "Producto sin nombre") + "</h3>" +
                "</div>" +
                "<span class=\"rank-badge\">pending_review</span>" +
                "</div>" +
                "<div class=\"admin-evidence\">" +
                "<div><span>TAE</span><strong>" + escapeHtml(String(item.tae ?? 0)) + "%</strong></div>" +
                "<div><span>Comisiones</span><strong>" + formatCurrency(item.fees || 0) + "</strong></div>" +
                "<div><span>Saldo min.</span><strong>" + formatCurrency(item.minBalance || 0) + "</strong></div>" +
                "<div><span>Saldo max.</span><strong>" + (item.maxBalance === null ? "Sin límite" : formatCurrency(item.maxBalance || 0)) + "</strong></div>" +
                "<div><span>Plazo</span><strong>" + (item.durationMonths || "-") + "</strong></div>" +
                "<div><span>Evidencias</span><strong>" + escapeHtml(String(item.evidenceCount ?? 0)) + "</strong></div>" +
                "</div>" +
                source +
                "<label for=\"review-notes-" + escapeHtml(item.id) + "\">Notas de revisión</label>" +
                "<textarea id=\"review-notes-" + escapeHtml(item.id) + "\" class=\"admin-review-notes\" placeholder=\"Ej: TAE y requisitos comprobados contra fuente.\">" + escapeHtml(item.reviewNotes || "") + "</textarea>" +
                "<div class=\"admin-actions\">" +
                "<button type=\"button\" data-admin-action=\"approve\" data-id=\"" + escapeHtml(item.id) + "\">Aprobar para ranking</button>" +
                "<button type=\"button\" class=\"danger-button\" data-admin-action=\"reject\" data-id=\"" + escapeHtml(item.id) + "\">Rechazar</button>" +
                "</div>" +
                "</article>"
              );
            })
            .join("");
        }

        async function loadPendingReviews() {
          if (!adminPendingList) {
            return;
          }
          const token = getAdminToken();
          if (!token) {
            if (adminPendingCount) {
              adminPendingCount.textContent = "-";
            }
            if (adminReviewState) {
              adminReviewState.textContent = "Token requerido";
            }
            adminPendingList.innerHTML = "<article class=\"condition-card\"><p>Introduce el token admin para cargar pendientes.</p></article>";
            return;
          }
          setStatus(adminStatus, "Cargando pendientes...", "warn");
          try {
            const response = await fetch("/api/admin/conditions/pending", {
              headers: { authorization: "Bearer " + token, "x-csrf-token": "banco-ai-csrf-2026" },
            });
            const data = await response.json();
            if (!response.ok) {
              setStatus(adminStatus, data?.message || "No autorizado para cargar pendientes.", "bad");
              renderPendingReviews([]);
              return;
            }
            renderPendingReviews(data?.items || []);
            setStatus(adminStatus, "Pendientes cargados.", "ok");
          } catch (error) {
            setStatus(adminStatus, "No se pudieron cargar pendientes.", "bad");
          }
        }

        async function submitPendingDecision(id, action) {
          const token = getAdminToken();
          if (!token || !id || (action !== "approve" && action !== "reject")) {
            setStatus(adminStatus, "Token, producto y acción son obligatorios.", "bad");
            return;
          }
          const notesInput = document.getElementById("review-notes-" + id);
          const reviewNotes = notesInput && "value" in notesInput ? String(notesInput.value || "").trim() : "";
          setStatus(adminStatus, action === "approve" ? "Aprobando versión..." : "Rechazando versión...", "warn");
          try {
            const response = await fetch("/api/admin/conditions/pending/" + encodeURIComponent(id) + "/" + action, {
              method: "POST",
              headers: {
                authorization: "Bearer " + token,
                "content-type": "application/json",
                "x-csrf-token": "banco-ai-csrf-2026",
              },
              body: JSON.stringify({ reviewNotes }),
            });
            const data = await response.json();
            if (!response.ok || data?.ok === false) {
              setStatus(adminStatus, data?.message || "No se pudo completar la revisión.", "bad");
              return;
            }
            setStatus(adminStatus, data?.message || "Revisión actualizada.", "ok");
            await loadPendingReviews();
            await loadConditions();
          } catch (error) {
            setStatus(adminStatus, "No se pudo completar la revisión.", "bad");
          }
        }

        async function loadScraperStatus() {
          if (!scraperLastRun || !scraperSources || !scraperErrors || !scraperPendingList) {
            return;
          }
          try {
            const response = await fetch("/api/scraper/status");
            const data = await response.json();
            if (!data?.hasState) {
              scraperPendingList.innerHTML = "<article class='condition-card'><p>No hay datos de scraping aún.</p></article>";
              return;
            }
            const generatedAt = data.generatedAt ? formatDateTime(data.generatedAt) : "Sin datos";
            if (scraperLastRun) scraperLastRun.textContent = generatedAt;
            if (scraperSources) scraperSources.textContent = data.sourceCount + " fuentes";
            if (scraperErrors) {
              scraperErrors.textContent = data.errorCount + " errores";
              scraperErrors.style.color = data.errorCount > 0 ? "#ff9aa8" : "#a6ffd0";
            }
            if (data.reviewItemCount > 0) {
              scraperPendingList.innerHTML = data.reviewItems.map((item) =>
                "<article class='admin-card'>" +
                "<div class='admin-card-header'>" +
                "<div>" +
                "<p class='admin-card-meta'>" + escapeHtml(item.bank || "") + " · " + escapeHtml(item.kind || "") + "</p>" +
                "<h3 class='admin-card-title'>" + escapeHtml(item.reason || "") + "</h3>" +
                "</div>" +
                "<span class='rank-badge' style='background:" + (item.priority === "high" ? "#ff9aa8" : item.priority === "medium" ? "#ffdd7a" : "#a6ffd0") + ";color:#2b0710'>" + escapeHtml(item.priority || "low") + "</span>" +
                "</div>" +
                (item.sourceUrl ? "<p class='admin-card-meta'><a href='" + escapeHtml(item.sourceUrl) + "' target='_blank' rel='noreferrer'>Ver fuente</a></p>" : "") +
                "</article>"
              ).join("");
            } else {
              scraperPendingList.innerHTML = "<article class='condition-card'><p>No hay cambios pendientes de revisión.</p></article>";
            }
          } catch (error) {
            if (scraperPendingList) {
              scraperPendingList.innerHTML = "<article class='condition-card'><p>No se pudo cargar el estado del scraper.</p></article>";
            }
          }
        }

        if (manualConditionsForm && manualConditionsForm instanceof HTMLFormElement) {
          manualConditionsForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (!manualStatus) {
              return;
            }
            const bankInput = document.getElementById("manual-bank");
            const nameInput = document.getElementById("manual-product-name");
            const kindInput = document.getElementById("manual-kind");
            const textInput = document.getElementById("manual-text");
            const sourceInput = document.getElementById("manual-source");
            const bank = bankInput instanceof HTMLInputElement ? bankInput.value : "";
            const productName = nameInput instanceof HTMLInputElement ? nameInput.value : "";
            const productKind = kindInput instanceof HTMLSelectElement ? kindInput.value : "cuenta_remunerada";
            const rawConditions = textInput instanceof HTMLTextAreaElement ? textInput.value : "";
            const sourceUrl = sourceInput instanceof HTMLInputElement ? sourceInput.value : "";

            if (!bank || !rawConditions) {
              setStatus(manualStatus, "Banco y texto de condiciones son obligatorios.", "bad");
              return;
            }

            setStatus(manualStatus, "Validando condiciones con LLM...", "warn");
            try {
              const response = await fetch("/api/manual/conditions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ bank, rawConditions, productKind, productName: productName || undefined, sourceUrl: sourceUrl || undefined }),
              });
              const data = await response.json();
              if (data?.status === "ok") {
                setStatus(manualStatus, "Condiciones guardadas como base de comparativa.", "ok");
                if (data?.product) {
                  await loadConditions();
                }
                bankInput.value = "";
                nameInput.value = "";
                textInput.value = "";
                sourceInput.value = "";
              } else if (data?.status === "invalid") {
                setStatus(manualStatus, "No se pudo validar la extracción: " + (data?.validation?.reason || "reintenta con texto más claro."), "bad");
              } else {
                setStatus(manualStatus, data?.message || "Error al guardar condiciones.", "bad");
              }
            } catch (error) {
              setStatus(manualStatus, "No fue posible guardar condiciones. Intenta de nuevo.", "bad");
            }
          });
        }

        function fileToBase64(file) {
          return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () {
              const value = String(reader.result || "");
              const marker = ",";
              const idx = value.indexOf(marker);
              const payload = idx >= 0 ? value.slice(idx + 1) : value;
              resolve(payload);
            };
            reader.onerror = function () {
              reject(new Error("No se pudo leer el PDF."));
            };
            reader.readAsDataURL(file);
          });
        }

        function buildRecommendationBlock(profile) {
          if (!Array.isArray(profile)) {
            return "";
          }
          if (profile.length === 0) {
            return "<p>No hay recomendaciones con la base actual.</p>";
          }
          return profile
            .map(function (entry) {
              return (
                "<article class=\"assistant-result-item\">" +
                "<p class=\"assistant-result-title\">#" +
                (entry.rank || 0) +
                " " +
                escapeHtml(entry.product ? entry.product.name : "") +
                " <span class=\"assistant-result-meta\">- " +
                escapeHtml(entry.product ? entry.product.bank : "") +
                " Â· " +
                escapeHtml(entry.product ? entry.product.category : "") +
                "</span></p>" +
                "<p class=\"assistant-result-why\">" +
                escapeHtml(entry.why || "Sin detalle adicional.") +
                "</p>" +
                "<p class=\"assistant-result-benefit\">"+
                escapeHtml(entry.benefit || "") +
                "</p>" +
                "</article>"
              );
            })
            .join("");
        }

        if (assistantPdfForm && assistantPdfForm instanceof HTMLFormElement) {
          assistantPdfForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (!pdfStatus || !assistResult) {
              return;
            }
            const bankInput = document.getElementById("assistant-pdf-bank");
            const productInput = document.getElementById("assistant-pdf-name");
            const sourceInput = document.getElementById("assistant-pdf-source");
            const fileInput = document.getElementById("assistant-pdf-file");
            const bank = bankInput instanceof HTMLInputElement ? bankInput.value : "";
            const productName = productInput instanceof HTMLInputElement ? productInput.value : "";
            const sourceUrl = sourceInput instanceof HTMLInputElement ? sourceInput.value : "";
            const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
            if (!bank || !file) {
              setStatus(pdfStatus, "Banco y PDF son obligatorios.", "bad");
              return;
            }

            setStatus(pdfStatus, "Leyendo PDF y validando...", "warn");
            try {
              const fileBase64 = await fileToBase64(file);
              const response = await fetch("/api/pdf/assistant", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  bank,
                  productName: productName || undefined,
                  sourceUrl: sourceUrl || undefined,
                  fileName: file.name || "upload.pdf",
                  fileSizeBytes: file.size || 0,
                  mimeType: file.type || "application/pdf",
                  fileBase64: String(fileBase64 || ""),
                  profile: {
                    objective: "rentabilidad",
                    vinculacion: "indiferente",
                    horizonte: "medio",
                    capitalBand: "1000_10000",
                    payrollNeed: "no_importante"
                  }
                }),
              });
              const payload = await response.json();
              const validationReason = payload?.reasons ? payload.reasons.join(" | ") : "";
              if (payload?.status === "blocked") {
                setStatus(pdfStatus, validationReason || "No se pudo procesar el PDF.", "bad");
                if (assistResult) {
                  assistResult.innerHTML = "<p>Revisamos tu documento en cola o se requiere envío manual.</p>";
                }
                return;
              }
              setStatus(pdfStatus, "PDF procesado y ranking calculado.", "ok");
              if (assistResult) {
                assistResult.innerHTML = buildRecommendationBlock(payload?.recommendations || []);
              }
              if (pdfOnlyResult) {
                if (payload?.extractedProduct) {
                  pdfOnlyResult.innerHTML = "<p>Producto detectado: <strong>" + escapeHtml(payload.extractedProduct.productName || "Sin nombre") + "</strong> · TAE " + formatCurrency(payload.extractedProduct.tae || 0) + "</p>";
                } else {
                  pdfOnlyResult.innerHTML = "";
                }
              }
              await loadConditions();
            } catch (error) {
              setStatus(pdfStatus, "No fue posible procesar el PDF.", "bad");
            }
          });
        }

        if (pdfAnalyzeForm && pdfAnalyzeForm instanceof HTMLFormElement) {
          pdfAnalyzeForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            if (!pdfAnalyzeStatus || !pdfAnalyzeResult) {
              return;
            }
            const bankInput = document.getElementById("pdf-analyze-bank");
            const fileInput = document.getElementById("pdf-analyze-file");
            const bank = bankInput instanceof HTMLInputElement ? bankInput.value : "";
            const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
            if (!bank || !file) {
              setStatus(pdfAnalyzeStatus, "Banco y PDF son obligatorios.", "bad");
              return;
            }

            setStatus(pdfAnalyzeStatus, "Analizando PDF...", "warn");
            try {
              const fileBase64 = await fileToBase64(file);
              const response = await fetch("/api/pdf/analyze", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  bank,
                  fileName: file.name || "upload.pdf",
                  fileSizeBytes: file.size || 0,
                  mimeType: file.type || "application/pdf",
                  fileBase64: String(fileBase64 || ""),
                }),
              });
              const result = await response.json();
              if (result?.status === "blocked") {
                setStatus(pdfAnalyzeStatus, "No se pudo analizar el PDF.", "bad");
                pdfAnalyzeResult.innerHTML = "";
                return;
              }
              setStatus(pdfAnalyzeStatus, "PDF analizado correctamente.", "ok");
              const tae = result?.tae != null ? result.tae + "%" : "No especificado";
              const fees = result?.fees != null ? formatCurrency(result.fees) : "0€";
              const minBal = result?.minBalance != null ? formatCurrency(result.minBalance) : "0€";
              const maxBal = result?.maxBalance != null ? formatCurrency(result.maxBalance) : "Sin límite";
              const dur = result?.durationMonths ? result.durationMonths + " meses" : "Sin plazo";
              const liq = result?.liquidity != null ? result.liquidity + "/100" : "No especificado";
              const conditionsHtml = Array.isArray(result?.conditions) && result.conditions.length > 0
                ? "<div class='admin-evidence'>" + result.conditions.map(c =>
                    "<div><strong>" + escapeHtml(c.title) + "</strong><p class='muted'>" + escapeHtml(c.detail) + "</p></div>"
                  ).join("") + "</div>"
                : "<p class='muted'>No se detectaron condiciones especiales.</p>";
              pdfAnalyzeResult.innerHTML =
                "<article class='assistant-result-item'>" +
                "<p class='assistant-result-title'><strong>" + escapeHtml(result?.productName || "Producto sin nombre") + "</strong> · " + escapeHtml(result?.bank || "") + "</p>" +
                "<div class='admin-evidence'>" +
                "<div><span>TAE</span><strong>" + escapeHtml(String(tae)) + "</strong></div>" +
                "<div><span>Comisiones</span><strong>" + escapeHtml(String(fees)) + "</strong></div>" +
                "<div><span>Saldo mínimo</span><strong>" + escapeHtml(String(minBal)) + "</strong></div>" +
                "<div><span>Saldo máximo</span><strong>" + escapeHtml(String(maxBal)) + "</strong></div>" +
                "<div><span>Plazo</span><strong>" + escapeHtml(String(dur)) + "</strong></div>" +
                "<div><span>Liquidez</span><strong>" + escapeHtml(String(liq)) + "</strong></div>" +
                "</div>" +
                "<h4>Condiciones a tener en cuenta</h4>" +
                conditionsHtml +
                "<p class='small-note'>Este analisis es informativo. No constituye asesoramiento personalizado.</p>" +
                "</article>";
            } catch (error) {
              setStatus(pdfAnalyzeStatus, "No fue posible analizar el PDF.", "bad");
            }
          });
        }

        if (adminTokenInput && "value" in adminTokenInput) {
          try {
            adminTokenInput.value = sessionStorage.getItem("banco-ai-admin-token") || "";
          } catch {}
        }

        if (adminTokenForm && adminTokenForm instanceof HTMLFormElement) {
          adminTokenForm.addEventListener("submit", function (event) {
            event.preventDefault();
            void loadPendingReviews();
          });
        }

        if (adminTokenClear) {
          adminTokenClear.addEventListener("click", function () {
            try {
              sessionStorage.removeItem("banco-ai-admin-token");
            } catch {}
            if (adminTokenInput && "value" in adminTokenInput) {
              adminTokenInput.value = "";
            }
            renderPendingReviews([]);
            if (adminPendingCount) {
              adminPendingCount.textContent = "-";
            }
            if (adminReviewState) {
              adminReviewState.textContent = "Token borrado";
            }
            setStatus(adminStatus, "Token borrado de esta sesion.", "ok");
          });
        }

        if (adminPendingList) {
          adminPendingList.addEventListener("click", function (event) {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
              return;
            }
            const action = target.getAttribute("data-admin-action");
            const id = target.getAttribute("data-id");
            if (action && id) {
              void submitPendingDecision(id, action);
            }
          });
        }

        const simForm = document.getElementById("sim-form");
        const simResult = document.getElementById("sim-result");
            if (simForm && simResult) {
          simForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const capitalEl = document.getElementById("sim-capital");
            const tasaEl = document.getElementById("sim-tasa");
            const plazoEl = document.getElementById("sim-plazo");
            const capital = Number(capitalEl instanceof HTMLInputElement ? capitalEl.value : "0");
            const rate = Number(tasaEl instanceof HTMLInputElement ? tasaEl.value : "0");
            const months = Number(plazoEl instanceof HTMLInputElement ? plazoEl.value : "0");

            if (!Number.isFinite(capital) || !Number.isFinite(rate) || !Number.isFinite(months) || capital <= 0 || months <= 0) {
              simResult.textContent = "Introduce valores válidos.";
              return;
            }

            const estimated = (capital * (rate / 100) * (months / 12));
            const f = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
            simResult.innerHTML = "Beneficio estimado: <strong>" + f.format(estimated) + "</strong> para el periodo indicado.";
          });
        }

        const selectedTab = readTab();
        activate(selectedTab);
        if (selectedTab === "condiciones" || selectedTab === "productos") {
          loadConditions().catch(function () {});
        }
        if (selectedTab === "admin") {
          loadPendingReviews().catch(function () {});
        }
        if (selectedTab === "scraper") {
          loadScraperStatus().catch(function () {});
        }
      })();
    </script>
  </body>
</html>
`;
}

export function createWebApp(dependencies: Partial<WebDependencies> = {}): Hono {
  const deps: WebDependencies = {
    loadLatestScrapeState: dependencies.loadLatestScrapeState ?? defaultDependencies.loadLatestScrapeState,
  };

  const app = new Hono();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.length > 0) {
    app.use(
      "*",
      cors({
        origin: (origin) => {
          if (!origin) return allowedOrigins[0];
          if (allowedOrigins.includes(origin)) return origin;
          if (origin.endsWith("." + allowedOrigins[0].replace(/https?:\/\//, "").split(":")[0])) return origin;
          return allowedOrigins[0];
        },
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: 3600,
        credentials: true,
      }),
    );
  }

  const securityHeaders = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["x-xss-protection", "0"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
    ["content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:;"],
  ];

  app.use("*", async (context, next) => {
    await next();
    for (const [header, value] of securityHeaders) {
      context.header(header, value);
    }
  });

  const rateLimitStore = new Map<string, number[]>();
  const RATE_LIMIT_WINDOW_MS = 60_000;
  const RATE_LIMIT_MAX = 120;

  app.use("*", async (context, next) => {
    if (context.req.path === "/health") {
      return next();
    }
    const ip = context.req.header("x-forwarded-for") ?? context.req.header("x-real-ip") ?? "unknown";
    const now = Date.now();
    const key = `${ip}:${context.req.path}`;
    const timestamps = rateLimitStore.get(key) ?? [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      rateLimitStore.set(key, recent);
      return context.json({ error: "rate_limit_exceeded" }, 429);
    }
    recent.push(now);
    rateLimitStore.set(key, recent);
    return next();
  });

  app.get("/health", (context) => {
    return context.json({
      status: "ok",
      service: "banco-ai-web",
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/novedades", async (context) => {
    const state = await deps.loadLatestScrapeState();
    const plan = state?.hermesReviewPlan;
    const summary: WebSummary = {
      generatedAt: plan?.generatedAt,
      totalTasks: plan?.totalTasks ?? 0,
      criticalCount: plan?.criticalCount ?? 0,
      highCount: plan?.highCount ?? 0,
      mediumCount: plan?.mediumCount ?? 0,
      lowCount: plan?.lowCount ?? 0,
      sourceScanned: state?.sourceCount ?? 0,
      sourceErrors: state?.scansBySource?.filter((scan) => scan.fetchStatus !== "ok").length ?? 0,
      highlights: plan?.highlights ?? [],
      nextWeeklyRun: "domingo",
    };
    return context.json(summary);
  });

  app.get("/api/scraper/status", async (context) => {
    const state = await deps.loadLatestScrapeState();
    if (!state) {
      return context.json({
        hasState: false,
        message: "No hay datos de scraping aún.",
      });
    }
    const scanSummaries = state.scansBySource ?? [];
    const errorCount = scanSummaries.filter((s) => s.fetchStatus !== "ok").length;
    const okCount = scanSummaries.filter((s) => s.fetchStatus === "ok").length;
    const reviewItems = state.hermesReviewPlan?.highlights ?? [];
    return context.json({
      hasState: true,
      runId: state.runId,
      generatedAt: state.generatedAt,
      sourceAsOfDate: state.sourceAsOfDate,
      sourceCount: state.sourceCount,
      okCount,
      errorCount,
      errorItems: scanSummaries.filter((s) => s.fetchStatus !== "ok").slice(0, 10),
      reviewItemCount: reviewItems.length,
      reviewItems: reviewItems.map((item) => ({
        bank: item.bank,
        kind: item.kind,
        reason: item.reason,
        priority: item.hermesLevel,
        sourceUrl: item.sourceUrl,
      })).slice(0, 20),
    });
  });

  app.post("/api/assistant/recommend", async (context) => {
    const payload = await context.req.json().catch(() => ({}));
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    let assistant: AssistantApiResponse["assistant"] = { source: "structured" };
    let profile = normalizeAssistantProfile(payload);

    if (message) {
      const regulatory = classifyUserIntent(message);
      if (regulatory.blocked) {
        return context.json({
          profile: ASSISTANT_OBJECTIVE_FALLBACK,
          recommendations: [],
          assistant: {
            source: "regulatory",
            validation: {
              status: "blocked",
              attempts: 0,
              reason: regulatory.reason,
            },
            answerSummary: blockedCategoryMessage(),
            needsMoreInfo: false,
          },
        } satisfies AssistantApiResponse, 403);
      }
      profile = { ...profile, objective: "rentabilidad" };
    }

    if (message) {
      try {
        const parsed = await extractAssistantProfileFromQuestion(message);
        assistant = {
          source: "llm",
          validation: {
            status: parsed.status,
            attempts: parsed.attempts,
            reason: parsed.status === "validated" ? undefined : parsed.reason,
          },
        };
        if (parsed.status === "validated") {
          profile = parsed.profile;
          assistant.needsMoreInfo = parsed.needsMoreInfo;
          assistant.nextQuestion = parsed.nextQuestion;
          assistant.answerSummary = parsed.answerSummary;
        }
      } catch (error) {
        if (isLlmSaturationError(error)) {
          return context.json({
            profile,
            recommendations: [],
            assistant: {
              source: "llm",
              validation: {
                status: "blocked",
                attempts: 0,
                reason: error.message,
              },
            },
          } satisfies AssistantApiResponse, 429);
        }
        logger.error("assistant question extraction failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const recommendations = await buildAssistantRecommendation(profile);
    const response: AssistantApiResponse = { profile, recommendations, assistant };
    return context.json(response);
  });

  app.get("/api/product-conditions", async (context) => {
    const products = (await getApprovedCatalog()).map(buildProductCondition);
    const response: ProductConditionsApiResponse = { products };
    return context.json(response);
  });

  app.post("/api/manual/conditions", async (context) => {
    const parsed = ManualConditionsSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({
        status: "invalid",
        message: "Campos de entrada inválidos o fuera de límite.",
      } satisfies ManualConditionResponse, 400);
    }
    const { bank, rawConditions, productKind, productName, sourceUrl } = parsed.data;
    const trimmedBank = bank.trim();
    const trimmedRawConditions = rawConditions.trim();
    const trimmedProductName = productName?.trim() || undefined;
    const trimmedSourceUrl = sourceUrl?.trim() || undefined;

    if (!trimmedBank || !trimmedRawConditions) {
      return context.json({
        status: "invalid",
        message: "Faltan campos obligatorios: bank o rawConditions.",
      } satisfies ManualConditionResponse, 400);
    }

    let extraction: ParsedManualConditions;
    try {
      extraction = await extractManualConditions({
        bank: trimmedBank,
        rawConditions: trimmedRawConditions,
        productKind: productKind,
        productName: trimmedProductName,
        sourceUrl: trimmedSourceUrl,
      });
    } catch (error) {
      if (isLlmSaturationError(error)) {
        logger.warn("manual conditions extraction delayed by NAN limiter", {
          bank: trimmedBank,
          code: error.code,
        });
        return context.json({
          status: "blocked",
          message: "La cola de analisis esta llena. Intentalo de nuevo en unos minutos.",
          validation: {
            status: "blocked",
            attempts: 0,
            reason: error.message,
          },
        } satisfies ManualConditionResponse, 429);
      }

      logger.error("manual conditions extraction failed", {
        bank: trimmedBank,
        file: "web manual route",
        error: error instanceof Error ? error.message : String(error),
      });
      return context.json({
        status: "invalid",
        message: "No se pudo validar contra NAN en este momento. Revisa configuración de LLM.",
        validation: {
          status: "blocked",
          attempts: 1,
          reason: error instanceof Error ? error.message : "error inesperado",
        },
      } satisfies ManualConditionResponse, 502);
    }
    if (extraction.status !== "validated") {
      return context.json({
        status: "invalid",
        message: "No fue posible validar la salida estructurada.",
        validation: {
          status: extraction.status,
          attempts: extraction.attempts,
          reason: extraction.status === "retryable" ? "reintentando" : extraction.reason,
        },
      } satisfies ManualConditionResponse, 400);
    }

    const mappedProduct = mapManualExtractionToCatalogProduct(trimmedBank, extraction, { productName: trimmedProductName, sourceUrl: trimmedSourceUrl });
    const saved = await addManualCatalogProduct(mappedProduct);
    const response: ManualConditionResponse = {
      status: "ok",
      message: "Condiciones validadas y guardadas en cola de revisión previa a publicación.",
      product: buildProductCondition(saved),
      validation: {
        status: extraction.status,
        attempts: extraction.attempts,
      },
    };
    return context.json(response);
  });

  app.post("/api/pdf/assistant", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const parsed = PdfUploadSchema.safeParse(payload);
    if (!parsed.success) {
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: ["Campos de entrada inválidos o fuera de límite."],
      } satisfies PdfAssistantResponse, 400);
    }
    const { bank, productName, sourceUrl, fileName, fileSizeBytes, mimeType, fileBase64 } = parsed.data;
    const trimmedBank = bank.trim();
    const trimmedFileName = fileName.trim();

    if (!trimmedBank || !trimmedFileName || !fileBase64) {
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: ["Faltan campos obligatorios para procesar el PDF."],
      } satisfies PdfAssistantResponse, 400);
    }

    if (!isSafePdfMimeType(mimeType)) {
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: ["Tipo de archivo no permitido. Solo PDF."],
      } satisfies PdfAssistantResponse, 400);
    }

    const normalizedBase64 = fileBase64.replace(/\s+/g, "");
    if (normalizedBase64.length > MAX_BASE64_LENGTH) {
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: [`Tamaño excedido: ${normalizedBase64.length} caracteres (máx ${MAX_BASE64_LENGTH}).`],
      } satisfies PdfAssistantResponse, 413);
    }

    let rawText: string;
    try {
      const buffer = Buffer.from(normalizedBase64, "base64");
      rawText = extractPdfTextFallback(buffer);
    } catch {
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: ["No fue posible decodificar el PDF enviado."],
      } satisfies PdfAssistantResponse, 400);
    }

    const guard = evaluatePdfUpload({
      fileName,
      fileSizeBytes,
      mimeType,
      textSnippet: rawText.slice(0, 120_000),
    });
    if (guard.action === "reject_upload") {
      return context.json({
        status: "blocked",
        action: guard.action,
        reasons: guard.reasons,
      } satisfies PdfAssistantResponse);
    }
    if (guard.action === "queue_review_only") {
      return context.json({
        status: "queued",
        action: guard.action,
        reasons: guard.reasons,
      } satisfies PdfAssistantResponse);
    }

    if (!rawText) {
      return context.json({
        status: "blocked",
        action: "queue_review_only",
        reasons: ["No se pudo extraer texto útil del PDF; enviar preview textual manualmente."],
      } satisfies PdfAssistantResponse);
    }

    let extraction: ParsedPdfConditions;
    try {
      extraction = await extractPdfConditions(rawText);
    } catch (error) {
      if (isLlmSaturationError(error)) {
        const queueDecision = queuePdfForProcessing({
          fileName,
          fileSizeBytes,
          mimeType,
          textSnippet: rawText.slice(0, 120_000),
        });
        logger.warn("pdf extraction delayed by NAN limiter", {
          bank,
          fileName,
          code: error.code,
          queued: queueDecision.accepted,
          requestId: queueDecision.requestId,
        });
        return context.json({
          status: queueDecision.accepted ? "queued" : "blocked",
          action: "queue_review_only",
          reasons: [
            queueDecision.accepted
              ? `La cola de analisis esta llena. Documento en cola ${queueDecision.requestId ?? ""}.`
              : `La cola de analisis esta llena y no acepta mas documentos: ${queueDecision.reason}`,
          ],
          validation: {
            status: "blocked",
            attempts: 0,
            reason: error.message,
          },
        } satisfies PdfAssistantResponse, 429);
      }

      logger.error("pdf extraction failed", {
        bank,
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
      return context.json({
        status: "blocked",
        action: "reject_upload",
        reasons: ["No se pudo validar la salida del extractor del PDF con NAN."],
        validation: {
          status: "blocked",
          attempts: 1,
          reason: error instanceof Error ? error.message : "error inesperado",
        },
      } satisfies PdfAssistantResponse, 502);
    }
    if (extraction.status !== "validated") {
      return context.json({
        status: "blocked",
        action: "queue_review_only",
        reasons: ["La salida del extractor del PDF no fue validada."],
        validation: {
          status: extraction.status,
          attempts: extraction.attempts,
          reason: extraction.status === "retryable" ? "reintento pendiente de validación" : extraction.reason,
        },
      } satisfies PdfAssistantResponse, 400);
    }

    const profile = buildAssistantProfile(payload.profile);
    const extractedProduct = mapPdfExtractionToCatalogProduct(bank, extraction, { productName, sourceUrl });
    const approvedCatalog = await getApprovedCatalog();
    const recommendations = rankCatalogForProfile([extractedProduct, ...approvedCatalog], profile, 4);
    const response: PdfAssistantResponse = {
      status: "ok",
      action: guard.action,
      reasons: guard.reasons,
      recommendationProfile: profile,
      extractedProduct: buildProductCondition(extractedProduct),
      recommendations,
      validation: {
        status: extraction.status,
        attempts: extraction.attempts,
      },
    };
    return context.json(response);
  });

  type PdfAnalysisResult = {
    status: "ok" | "blocked";
    bank?: string;
    productName?: string;
    tae?: number;
    fees?: number;
    minBalance?: number;
    maxBalance?: number | null;
    durationMonths?: number | null;
    requiresPayroll?: boolean;
    requiresReceipts?: boolean;
    requiresBizum?: boolean;
    requiresConditions?: boolean;
    liquidity?: number;
    conditions?: Array<{
      title: string;
      detail: string;
    }>;
  };

  app.post("/api/pdf/analyze", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const parsed = PdfAnalyzeSchema.safeParse(payload);
    if (!parsed.success) {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 400);
    }
    const { bank, fileName, fileSizeBytes, mimeType, fileBase64 } = parsed.data;
    const trimmedBank = bank.trim();
    const trimmedFileName = fileName.trim();

    if (!trimmedBank || !trimmedFileName || !fileBase64) {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 400);
    }

    if (!isSafePdfMimeType(mimeType)) {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 400);
    }

    const normalizedBase64 = fileBase64.replace(/\s+/g, "");
    if (normalizedBase64.length > MAX_BASE64_LENGTH) {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 413);
    }

    let rawText: string;
    try {
      const buffer = Buffer.from(normalizedBase64, "base64");
      rawText = extractPdfTextFallback(buffer);
    } catch {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 400);
    }

    const guard = evaluatePdfUpload({
      fileName: trimmedFileName,
      fileSizeBytes,
      mimeType,
      textSnippet: rawText.slice(0, 120_000),
    });
    if (guard.action === "reject_upload") {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult);
    }

    if (!rawText) {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult);
    }

    let extraction: ParsedPdfConditions;
    try {
      extraction = await extractPdfConditions(rawText);
    } catch (error) {
      if (isLlmSaturationError(error)) {
        return context.json({
          status: "blocked",
        } satisfies PdfAnalysisResult, 429);
      }
      logger.error("pdf analysis extraction failed", {
        bank,
        fileName,
        error: error instanceof Error ? error.message : String(error),
      });
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 502);
    }
    if (extraction.status !== "validated") {
      return context.json({
        status: "blocked",
      } satisfies PdfAnalysisResult, 400);
    }

    const product = mapPdfExtractionToCatalogProduct(bank, extraction, {});
    const conditions: Array<{ title: string; detail: string }> = [];

    if (product.requiresPayroll) {
      conditions.push({
        title: "Vinculación a nómina",
        detail: "Este producto requiere ingresar tu nómina para aplicar las condiciones actuales.",
      });
    }
    if (product.requiresReceipts) {
      conditions.push({
        title: "Comprobantes requeridos",
        detail: "Puede ser necesario aportar justificantes o documentos para mantener la oferta.",
      });
    }
    if (product.requiresBizum) {
      conditions.push({
        title: "Uso de Bizum",
        detail: "Se solicita el uso de Bizum como condicionante para la oferta.",
      });
    }
    if (product.requiresConditions) {
      conditions.push({
        title: "Condiciones especiales",
        detail: "Este producto tiene condiciones adicionales que debes revisar antes de contratar.",
      });
    }
    if (product.durationMonths && product.durationMonths > 0) {
      conditions.push({
        title: "Plazo de permanencia",
        detail: `Este producto tiene un plazo de ${product.durationMonths} meses. La retirada anticipada puede tener penalización.`,
      });
    }
    if (product.maxBalance) {
      conditions.push({
        title: "Saldo máximo",
        detail: `La TAE se aplica hasta un saldo máximo de ${product.maxBalance.toLocaleString("es-ES")}€.`,
      });
    }
    if (product.fees > 0) {
      conditions.push({
        title: "Comisiones",
        detail: `Este producto tiene comisiones de ${product.fees}€.`,
      });
    }

    const result: PdfAnalysisResult = {
      status: "ok",
      bank: product.bank,
      productName: product.productName,
      tae: product.tae,
      fees: product.fees,
      minBalance: product.minBalance,
      maxBalance: product.maxBalance,
      durationMonths: product.durationMonths,
      requiresPayroll: product.requiresPayroll,
      requiresReceipts: product.requiresReceipts,
      requiresBizum: product.requiresBizum,
      requiresConditions: product.requiresConditions,
      liquidity: product.liquidity,
      conditions,
    };

    return context.json(result);
  });

  app.get("/api/admin/conditions/pending", async (context) => {
    const auth = requireAdminToken(context);
    if (!auth.ok) {
      return context.json({ items: [], total: 0, message: auth.message }, auth.status);
    }

    const items = await getPendingCatalogDrafts();
    const response: PendingReviewApiResponse = { items, total: items.length };
    return context.json(response);
  });

  app.post("/api/admin/conditions/pending/:id/approve", async (context) => {
    const auth = requireAdminToken(context);
    if (!auth.ok) {
      return context.json({ ok: false, message: auth.message }, auth.status);
    }

    const versionId = context.req.param("id");
    const payload = (await context.req.json().catch(() => ({}))) as ReviewDecisionBody;
    const reviewNotes = typeof payload.reviewNotes === "string" ? payload.reviewNotes.trim() : undefined;
    const requestedActor = typeof payload.actor === "string" ? payload.actor.trim() : "";
    const actor = requestedActor.length > 0
      ? requestedActor
      : auth.actor;
    const decision = await approveCatalogDraft(versionId, reviewNotes, actor);
    return context.json(decision, decision.ok ? (200 as const) : (409 as const));
  });

  app.post("/api/admin/conditions/pending/:id/reject", async (context) => {
    const auth = requireAdminToken(context);
    if (!auth.ok) {
      return context.json({ ok: false, message: auth.message }, auth.status);
    }

    const versionId = context.req.param("id");
    const payload = (await context.req.json().catch(() => ({}))) as ReviewDecisionBody;
    const reviewNotes = typeof payload.reviewNotes === "string" ? payload.reviewNotes.trim() : undefined;
    const requestedActor = typeof payload.actor === "string" ? payload.actor.trim() : "";
    const actor = requestedActor.length > 0
      ? requestedActor
      : auth.actor;
    const decision = await rejectCatalogDraft(versionId, reviewNotes, actor);
    return context.json(decision, decision.ok ? (200 as const) : (409 as const));
  });

  app.get("/novedades", async (context) => {
    const state = await deps.loadLatestScrapeState();
    const plan = state?.hermesReviewPlan;
    context.header("Content-Type", "text/html; charset=utf-8");
    return context.html(renderPage(plan, "novedades"));
  });

  app.get("/", async (context) => {
    const state = await deps.loadLatestScrapeState();
    const plan = state?.hermesReviewPlan;
    const tab = parseTab(context.req.query("tab"));
    context.header("Content-Type", "text/html; charset=utf-8");
    return context.html(renderPage(plan, tab));
  });

  app.onError((error, context) => {
    logger.error("web request failed", { path: context.req.path, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: "internal error" }, 500);
  });

  return app;
}
