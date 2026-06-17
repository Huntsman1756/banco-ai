import { runSchedulerScan } from "../src/infrastructure/scraper/cycle";
import { loadLatestScrapeState } from "../src/infrastructure/scraper/state-store";
import { logger } from "../src/shared/logger";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

async function main(): Promise<void> {
  const maxSources = parsePositiveInt(process.env.REVIEW_SMOKE_MAX_SOURCES);

  logger.info("local review loop smoke started", {
    action: "review-loop-smoke",
    maxSources: maxSources ?? "all",
  });

  const before = await loadLatestScrapeState();
  const result = await runSchedulerScan(
    undefined,
    maxSources ? { maxSources, ignoreRemovedSources: true } : undefined,
  );
  const after = await loadLatestScrapeState();

  const beforeGenerated = before?.generatedAt ?? "sin ejecucion previa";
  const afterGenerated = after?.generatedAt ?? "sin ejecucion";

  logger.info("local review loop smoke completed", {
    action: "review-loop-smoke",
    runId: result.runId,
    newGeneratedAt: afterGenerated,
    previousGeneratedAt: beforeGenerated,
    sourceScanned: result.sourcesScanned,
    sourceErrors: result.sourcesWithErrors,
    manualReviewCount: result.requiresManualReviewCount,
    hermesCritical: result.hermesReviewPlan.criticalCount,
    hermesHigh: result.hermesReviewPlan.highCount,
    hermesMedium: result.hermesReviewPlan.mediumCount,
    hermesLow: result.hermesReviewPlan.lowCount,
  });

  console.log("\nNovedades principales");
  for (const task of result.hermesReviewPlan.highlights) {
    const focus = task.focusAreas.length ? `\n  focos: ${task.focusAreas.join("; ")}` : "";
    console.log(`- [${task.hermesLevel}] ${task.bank || "Sin banco"} | ${task.section} | ${task.action}`);
    console.log(`  razon: ${task.reason}`);
    if (focus.length > 0) {
      console.log(focus);
    }
    console.log(`  checks: ${task.checksToConfirm.join("; ")}`);
  }

  if (result.hermesReviewPlan.totalTasks === 0) {
    console.log("No hay tareas de revision detectadas.");
    return;
  }

  console.log(`\nTotal tareas: ${result.hermesReviewPlan.totalTasks}`);
  console.log(`Criticas: ${result.hermesReviewPlan.criticalCount}`);
  console.log(`Alta: ${result.hermesReviewPlan.highCount}`);
  console.log(`Media: ${result.hermesReviewPlan.mediumCount}`);
  console.log(`Baja: ${result.hermesReviewPlan.lowCount}`);
}

main().catch((error) => {
  logger.error("local review loop smoke failed", {
    action: "review-loop-smoke",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
