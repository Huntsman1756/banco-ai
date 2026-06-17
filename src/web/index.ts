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

function renderFocusAreas(task: HermesReviewTask): string {
  if (!task.focusAreas.length) {
    return "";
  }
  const rows = task.focusAreas.map((entry) => `<li>${safeText(entry)}</li>`).join("");
  return `
    <div class="focus">
      <div class="focus-title">Focos de revisión</div>
      <ul class="focus-list">${rows}</ul>
    </div>
  `;
}

function renderTaskList(tasks: HermesReviewTask[]): string {
  if (tasks.length === 0) {
    return "<p>No hay tareas de revision activas en este ciclo.</p>";
  }

  const rows = tasks
    .map(
      (task) => `
        <li class="review-item">
          <div class="meta">[${safeText(task.section)}] ${safeText(task.hermesLevel.toUpperCase())} · ${safeText(task.action)}</div>
          <div class="bank"><strong>${safeText(task.bank || "Fuente sin banco asociado")}</strong> · ${safeText(task.productKind)}</div>
          <div class="reason">${safeText(task.reason)}</div>
          ${renderFocusAreas(task)}
          <div class="effort">Esfuerzo estimado: ${safeText(task.estimatedEffort)}</div>
          <ul class="checks">${task.checksToConfirm.map((entry) => `<li>${safeText(entry)}</li>`).join("")}</ul>
          <div class="source"><a href="${safeText(task.sourceUrl)}" target="_blank" rel="noreferrer">Ver fuente</a></div>
        </li>`,
    )
    .join("");

  return `<ul>${rows}</ul>`;
}

function renderNovedadesPage(plan: HermesReviewPlan | undefined): string {
  const generatedAt = plan?.generatedAt;
  const taskCount = plan?.totalTasks ?? 0;
  const highlights = plan?.highlights ?? [];
  const sundayHour = Number(process.env.SCRAPER_WEEKLY_HOUR ?? "3");
  const sundayMinute = Number(process.env.SCRAPER_WEEKLY_MINUTE ?? "15");
  const sundayText = `Proximo barrido semanal: Domingo ${sundayHour.toString().padStart(2, "0")}:${sundayMinute
    .toString()
    .padStart(2, "0")} (Europe/Madrid)`;

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Banco AI · Novedades</title>
        <style>
          :root {
            --bg: #0b1220;
            --card: #111a2f;
            --ink: #edf2ff;
            --muted: #a5b4c6;
            --accent: #4f46e5;
            --success: #34d399;
          }
          body {
            margin: 0;
            font-family: "Inter", "Segoe UI", Arial, sans-serif;
            background: radial-gradient(circle at 10% 10%, #111b30, #090f1c 40%, #060a14);
            color: var(--ink);
          }
          .shell {
            max-width: 960px;
            margin: 0 auto;
            padding: 2rem 1rem 3rem;
          }
          .banner {
            border-left: 4px solid var(--accent);
            background: rgba(255,255,255,0.04);
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 1.25rem;
          }
          .panel {
            background: var(--card);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 12px;
            padding: 1rem 1.2rem;
            margin-bottom: 1rem;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit,minmax(220px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
          }
          .metric {
            background: #0d1628;
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 10px;
            padding: .75rem;
          }
          h1,h2 { margin: .2rem 0 .8rem; }
          .muted {
            color: var(--muted);
            font-size: .94rem;
          }
          .review-item {
            border: 1px dashed rgba(255,255,255,.18);
            border-radius: 10px;
            padding: .85rem;
            margin: .65rem 0;
          }
          .meta { color: #9fbcff; font-size: .82rem; text-transform: uppercase; letter-spacing: .02em; }
          .bank { font-size: 1.05rem; margin: .25rem 0; }
          .reason { margin: .25rem 0; color: #f6f8ff; }
          .checks { margin: .4rem 0 .4rem 1.1rem; color: #d8e1ff; }
          .focus {
            margin-top: .45rem;
            border: 1px dashed rgba(52, 211, 153, 0.55);
            border-radius: 8px;
            padding: .5rem .75rem;
            background: rgba(16, 185, 129, 0.12);
          }
          .focus-title {
            color: #d1fae5;
            font-size: .84rem;
            margin-bottom: .3rem;
            letter-spacing: .01em;
          }
          .focus-list {
            margin: 0;
            padding-left: 1.1rem;
            color: #ecfeff;
          }
          .source a { color: #93c5fd; }
          .effort {
            color: var(--success);
            font-size: .9rem;
            margin-top: .4rem;
          }
        </style>
      </head>
      <body>
        <main class="shell">
          <div class="banner">
            <h1>Novedades operativas</h1>
            <p class="muted">Resumen semanal para identificar cambios nuevos sin consultar toda la tabla de productos.</p>
            <p class="muted">Ultima revision: <strong>${generatedAt ? formatDateTime(generatedAt) : "Sin datos previos"}</strong></p>
            <p class="muted">${safeText(sundayText)}</p>
          </div>
          <section class="panel">
            <h2>Resumen</h2>
            <div class="grid">
              <div class="metric">
                <div class="muted">Tareas por revisar</div>
                <div><strong>${taskCount}</strong></div>
              </div>
              <div class="metric">
                <div class="muted">Criticas</div>
                <div><strong>${plan?.criticalCount ?? 0}</strong></div>
              </div>
              <div class="metric">
                <div class="muted">Alta prioridad</div>
                <div><strong>${plan?.highCount ?? 0}</strong></div>
              </div>
            </div>
            <p class="muted">Se muestran los ${Math.min(highlights.length, 12)} cambios priorizados para revision manual.</p>
          </section>
          <section class="panel">
            <h2>Novedades principales</h2>
            ${renderTaskList(highlights)}
          </section>
          <section class="panel">
            <h2>API</h2>
            <p class="muted">Tambien disponible <a href="/api/novedades">/api/novedades</a> para consumo automático.</p>
          </section>
        </main>
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
    const body = renderNovedadesPage(plan);
    context.header("Content-Type", "text/html; charset=utf-8");
    return context.html(body);
  });

  app.get("/", async (context) => {
    const state = await deps.loadLatestScrapeState();
    const plan = state?.hermesReviewPlan;
    const body = renderNovedadesPage(plan);
    context.header("Content-Type", "text/html; charset=utf-8");
    return context.html(body);
  });

  app.onError((error, context) => {
    logger.error("web request failed", { path: context.req.path, error: error instanceof Error ? error.message : String(error) });
    return context.json({ error: "internal error" }, 500);
  });

  return app;
}
