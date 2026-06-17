export type HermesReviewLevel = "critical" | "high" | "medium" | "low";

export type HermesAction =
  | "verify_bank_presence"
  | "verify_new_product"
  | "verify_removed_product"
  | "verify_product_terms"
  | "investigate_source_health"
  | "investigate_source_visibility";

export type HermesReviewInputKind =
  | "new_bank"
  | "removed_bank"
  | "new_product"
  | "removed_product"
  | "updated_product"
  | "source_new"
  | "source_changed"
  | "source_removed"
  | "source_error";

export type HermesReviewSourceItem = {
  sourceUrl: string;
  bank: string;
  productKind: string;
  kind: HermesReviewInputKind;
  section: string;
  reason: string;
  priority: "high" | "medium" | "low";
  focusAreas: string[];
};

export type HermesReviewTask = {
  taskId: string;
  sourceUrl: string;
  bank: string;
  productKind: string;
  section: string;
  kind: HermesReviewInputKind;
  reason: string;
  hermesLevel: HermesReviewLevel;
  action: HermesAction;
  focusAreas: string[];
  checksToConfirm: string[];
  estimatedEffort: "low" | "medium" | "high";
};

export type HermesReviewPlan = {
  generatedAt: string;
  totalTasks: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  highlights: HermesReviewTask[];
  tasks: HermesReviewTask[];
};

const MAX_HIGHLIGHTS = 12;

function mapAction(input: HermesReviewInputKind): HermesAction {
  if (input === "new_bank" || input === "removed_bank") {
    return "verify_bank_presence";
  }
  if (input === "new_product") {
    return "verify_new_product";
  }
  if (input === "removed_product") {
    return "verify_removed_product";
  }
  if (input === "updated_product") {
    return "verify_product_terms";
  }
  if (input === "source_error") {
    return "investigate_source_visibility";
  }
  return "investigate_source_health";
}

function mapFocusChecks(focusAreas: string[]): string[] {
  return focusAreas
    .map((area) => area.trim())
    .filter(Boolean)
    .map((area) => `Confirmar fuente oficial para: ${area}.`);
}

function mapChecks(input: HermesReviewInputKind, reason: string, focusAreas: string[]): string[] {
  const normalized = reason.toLowerCase();
  if (input === "new_bank") {
    return [
      "Confirmar aparición del banco en la web oficial",
      "Verificar dominio oficial y nombre legal del producto",
      "Validar si hay cambios de marca o consolidación de entidad",
      ...mapFocusChecks(focusAreas),
    ];
  }

  if (input === "removed_bank") {
    return [
      "Comprobar si la baja es temporal o un cambio de URL",
      "Revisar si el banco sigue activo con otros dominios",
      ...mapFocusChecks(focusAreas),
    ];
  }

  if (input === "new_product") {
    return [
      "Comparar condiciones base con la versión anterior de snapshot",
      "Verificar límites de TAE, restricciones y periodos mínimos",
      "Comprobar vigencia y fecha de actualización",
      ...mapFocusChecks(focusAreas),
    ];
  }

  if (input === "removed_product") {
    return [
      "Confirmar si la retirada se mantiene en otras secciones",
      "Comprobar si hubo migración a otro producto equivalente",
      ...mapFocusChecks(focusAreas),
    ];
  }

  if (input === "updated_product") {
    const checks = [
      "Comparar condiciones antes y después en documento oficial",
      "Validar exactitud de tasas, importes y requisitos",
      "Verificar si hay fecha de validez o campaña limitada",
    ];
    if (normalized.includes("financial terms changed")) {
      checks.push("Registrar diferencia por cada familia de condición");
    }
    checks.push(...mapFocusChecks(focusAreas));
    return checks;
  }

  if (input === "source_error") {
    return [
      "Reintentar consulta y registrar trazabilidad de fallo",
      "Comprobar estado de robots.txt o bloqueo firewall",
      ...mapFocusChecks(focusAreas),
    ];
  }

  const checks = [
    "Comprobar visibilidad de contenido por navegador estándar",
    normalized.includes("blocked") || normalized.includes("robots")
      ? "Verificar restricciones de acceso y User-Agent"
      : "Verificar cambios de estructura HTML y texto principal",
  ];
  checks.push(...mapFocusChecks(focusAreas));
  return checks;
}

function mapLevel(
  levelSeed: "low" | "medium" | "high",
  kind: HermesReviewInputKind,
  reason: string,
  focusAreas: string[],
): HermesReviewLevel {
  const normalized = reason.toLowerCase();
  if (kind === "updated_product" && focusAreas.some((area) => area.toLowerCase().includes("tae"))) {
    return "critical";
  }
  if (kind === "updated_product" || kind === "source_error" || kind === "new_bank" || kind === "removed_bank") {
    return "high";
  }

  if (normalized.includes("blocked") || normalized.includes("error") || normalized.includes("new bank")) {
    return "critical";
  }

  if (levelSeed === "high") {
    return "high";
  }
  if (levelSeed === "medium") {
    return "medium";
  }
  return "low";
}

function mapEffort(level: HermesReviewLevel): "low" | "medium" | "high" {
  if (level === "critical") {
    return "high";
  }
  if (level === "high") {
    return "high";
  }
  if (level === "medium") {
    return "medium";
  }
  return "low";
}

export function buildHermesReviewPlan(
  runId: string,
  items: readonly HermesReviewSourceItem[],
  options?: { maxHighlights?: number },
): HermesReviewPlan {
  const limit = options?.maxHighlights ?? MAX_HIGHLIGHTS;
  const tasks: HermesReviewTask[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const hermesLevel = mapLevel(item.priority, item.kind, item.reason.toLowerCase(), item.focusAreas);
    const focusAreas = Array.from(new Set(item.focusAreas));
    tasks.push({
      taskId: `${runId}-${index + 1}`,
      sourceUrl: item.sourceUrl,
      bank: item.bank,
      productKind: item.productKind,
      section: item.section,
      kind: item.kind,
      reason: item.reason,
      focusAreas,
      hermesLevel,
      action: mapAction(item.kind),
      checksToConfirm: mapChecks(item.kind, item.reason, focusAreas),
      estimatedEffort: mapEffort(hermesLevel),
    });
  }

  const sorted = tasks.sort((a, b) => {
    const rank = (value: HermesReviewLevel): number => {
      if (value === "critical") return 3;
      if (value === "high") return 2;
      if (value === "medium") return 1;
      return 0;
    };
    if (rank(a.hermesLevel) !== rank(b.hermesLevel)) {
      return rank(b.hermesLevel) - rank(a.hermesLevel);
    }
    return a.reason.localeCompare(b.reason);
  });

  return {
    generatedAt: new Date().toISOString(),
    totalTasks: sorted.length,
    criticalCount: sorted.filter((task) => task.hermesLevel === "critical").length,
    highCount: sorted.filter((task) => task.hermesLevel === "high").length,
    mediumCount: sorted.filter((task) => task.hermesLevel === "medium").length,
    lowCount: sorted.filter((task) => task.hermesLevel === "low").length,
    highlights: sorted.slice(0, limit),
    tasks: sorted,
  };
}
