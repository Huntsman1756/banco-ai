import { Hono } from "hono";
import { loadLatestScrapeState } from "../infrastructure/scraper/state-store";
import { logger } from "../shared/logger";
import type { HermesReviewPlan, HermesReviewTask } from "../domain/hermes-review";

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

type TabId = "comparativa" | "productos" | "simulador" | "como-funciona" | "privacidad" | "novedades";

const TAB_LABELS: Array<{ id: TabId; label: string }> = [
  { id: "comparativa", label: "Comparativa" },
  { id: "productos", label: "Productos" },
  { id: "simulador", label: "Simulador" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "privacidad", label: "Privacidad" },
  { id: "novedades", label: "Novedades" },
];

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
    estimate: "Ahorro estimado mensual: 1 a 5€",
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
    estimate: "Ahorro estimado anual: 15 a 40€",
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
    benefit: "Beneficio estimado: 3.8€/mes",
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
    benefit: "Beneficio estimado: 420€/10.000€",
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
      .tabs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.45rem;padding:.45rem;background:var(--surface);border:1px solid var(--line);border-radius:.9rem;margin-top:1rem}
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
            <span class="brand-sub">Comparativa · ranking · simulación</span>
          </span>
        </a>
        <a href="/api/novedades">/api/novedades</a>
      </header>

      <section class="hero">
        <p class="chip">Banco AI · Comparativa bancaria informativa</p>
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

      <p class="footer">Banco AI no realiza recomendaciones personalizadas. Solo ofrece información informativa y simulaciones orientativas.</p>
    </div>

    <script>
      (function () {
        const buttons = Array.from(document.querySelectorAll("[data-tab-button]"));
        const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
        const params = new URLSearchParams(window.location.search);
        const allowed = new Set(["comparativa","productos","simulador","como-funciona","privacidad","novedades"]);

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

        activate(readTab());

        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            activate(button.dataset.tabButton || "comparativa");
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });

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
