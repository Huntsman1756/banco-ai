import { logger } from "../shared/logger";
import { createInfrastructureServices } from "../infrastructure";

const MILLISECONDS_IN_SECOND = 1000;
const DAYS_IN_WEEK = 7;
const SUNDAY = 0;
const DEFAULT_WEEKLY_HOUR = 3;
const DEFAULT_WEEKLY_MINUTE = 15;

type SchedulerDeps = ReturnType<typeof createInfrastructureServices>;

type ScanLabel = "startup" | "scheduled";

function normalizeWeekdayHourMinute(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseHour(value: string | undefined): number {
  return Math.min(23, Math.max(0, normalizeWeekdayHourMinute(value, DEFAULT_WEEKLY_HOUR)));
}

function parseMinute(value: string | undefined): number {
  return Math.min(59, Math.max(0, normalizeWeekdayHourMinute(value, DEFAULT_WEEKLY_MINUTE)));
}

function buildNextSundayDate(from: Date, hour: number, minute: number): Date {
  const candidate = new Date(from);
  candidate.setHours(hour, minute, 0, 0);
  const currentWeekday = candidate.getDay();
  let deltaDays = SUNDAY - currentWeekday;
  if (deltaDays <= 0) {
    deltaDays += DAYS_IN_WEEK;
  }
  candidate.setDate(candidate.getDate() + deltaDays);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

function getDelayToNextSundayMs(now: Date): number {
  const hour = parseHour(process.env.SCRAPER_WEEKLY_HOUR);
  const minute = parseMinute(process.env.SCRAPER_WEEKLY_MINUTE);
  const nextSunday = buildNextSundayDate(now, hour, minute);
  const delay = nextSunday.getTime() - now.getTime();
  return Math.max(MILLISECONDS_IN_SECOND, delay);
}

function getNextRunLabel(now: Date): string {
  return buildNextSundayDate(now, parseHour(process.env.SCRAPER_WEEKLY_HOUR), parseMinute(process.env.SCRAPER_WEEKLY_MINUTE)).toISOString();
}

async function runSingleScan(deps: SchedulerDeps, label: ScanLabel): Promise<void> {
  const startedAt = new Date();
  const result = await deps.scraper.runSchedulerScan();

  logger.info("scheduler scan completed", {
    entrypoint: "scheduler",
    label,
    runId: result.runId,
    sourcesScanned: result.sourcesScanned,
    sourceErrors: result.sourcesWithErrors,
    requiresManualReview: result.requiresManualReviewCount,
    highPriorityReview: result.manualReviewItems.filter((item) => item.priority === "high").length,
    criticalReviewItems: result.hermesReviewPlan.criticalCount,
    durationMs: Date.now() - startedAt.getTime(),
  });
}

function createSchedulerDeps(): SchedulerDeps {
  return createInfrastructureServices();
}

export function startSchedulerEntrypoint(deps: SchedulerDeps = createSchedulerDeps()): void {
  const runOnStart = process.env.SCRAPER_STARTUP_RUN === "true";

  const runLoop = async (): Promise<void> => {
    const now = new Date();
    logger.info("scheduler loop waiting", {
      entrypoint: "scheduler",
      nextRunAt: getNextRunLabel(now),
      delayMs: getDelayToNextSundayMs(now),
    });

    setTimeout(() => {
      void runSingleScan(deps, "scheduled")
        .catch((error) => {
          logger.error("scheduler scheduled scan failed", {
            entrypoint: "scheduler",
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          void runLoop();
        });
    }, getDelayToNextSundayMs(now));
  };

  if (runOnStart) {
    void runSingleScan(deps, "startup")
      .catch((error) => {
        logger.error("scheduler startup scan failed", {
          entrypoint: "scheduler",
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        void runLoop();
      });
    return;
  }

  const now = new Date();
  logger.info("scheduler start without immediate run", {
    entrypoint: "scheduler",
    nextRunAt: getNextRunLabel(now),
    hour: parseHour(process.env.SCRAPER_WEEKLY_HOUR),
    minute: parseMinute(process.env.SCRAPER_WEEKLY_MINUTE),
  });

  void runLoop();
}

startSchedulerEntrypoint();
