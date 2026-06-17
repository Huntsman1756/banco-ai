import { createInfrastructureServices, type InfrastructureServices } from "../infrastructure";
import { classifyUserIntent, type RegulatoryDecision } from "../domain/regulatory";
import { rankApprovedProducts, type ProductVersion } from "../domain/recommender";
import { logger } from "../shared/logger";

const BOT_RESPONSE_BLOCKED =
  "No puedo prestar asesoramiento personalizado sobre instrumentos financieros. Puedo ayudarte con comparativas informativas de cuentas y depositos.";

type TelegramEntrypointDeps = {
  classifyUserIntent: typeof classifyUserIntent;
  rankApprovedProducts: typeof rankApprovedProducts;
  listScrapeTargets: InfrastructureServices["offers"]["getScraperSourcesAsOf"];
};

type TelegramEntrypointState = {
  botTokenConfigured: boolean;
  sampleRankingSize: number;
};

function createTelegramEntrypointDeps(infra: InfrastructureServices): TelegramEntrypointDeps {
  return {
    classifyUserIntent,
    rankApprovedProducts,
    listScrapeTargets: infra.offers.getScraperSourcesAsOf,
  };
}

export function previewTelegramReply(
  text: string,
  deps: TelegramEntrypointDeps,
): { status: "blocked" | "ok"; reason: string } {
  const decision: RegulatoryDecision = deps.classifyUserIntent(text);
  if (decision.blocked) {
    return {
      status: "blocked",
      reason: decision.reason,
    };
  }

  const emptyVersions: ProductVersion[] = [];
  const ranked = deps.rankApprovedProducts(emptyVersions, 1);
  const hasCandidates = ranked.length > 0;

  return {
    status: "ok",
    reason: hasCandidates ? "comparison path reachable" : "no approved products available yet for simulation",
  };
}

export function startTelegramEntrypoint(): void {
  const infra = createInfrastructureServices();
  const deps = createTelegramEntrypointDeps(infra);

  const state: TelegramEntrypointState = {
    botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    sampleRankingSize: previewTelegramReply("cuenta remunerada", deps).status === "ok" ? 0 : 0,
  };

  logger.info("telegram entrypoint started", {
    entrypoint: "telegram",
    botTokenConfigured: state.botTokenConfigured,
    sampleRankingSize: state.sampleRankingSize,
  });
}

export function startTelegramEntrypointForMessage(
  userMessage: string,
  deps: TelegramEntrypointDeps = createTelegramEntrypointDeps(createInfrastructureServices()),
): string {
  const result = previewTelegramReply(userMessage, deps);
  if (result.status === "blocked") {
    return BOT_RESPONSE_BLOCKED;
  }

  if (result.reason === "no approved products available yet for simulation") {
    return "Aun no hay productos aprovados en catalogo para comparar en este entorno de desarrollo.";
  }

  return "Comparativa informativa preparada para mostrar ranking simulado.";
}
