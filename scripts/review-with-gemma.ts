import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateStructuredJson } from "../src/infrastructure/llm/client";
import type { LlmValidationBlocked } from "../src/domain/financial-engine";

const DEFAULT_REVIEW_MODEL = "gemma4";

type ReviewOutput = {
  decision: "APPROVED" | "CHANGES_REQUIRED";
  blockers: string[];
  should_fix: string[];
  nits: string[];
  evidence: string[];
  final_recommendation: string;
};

const Gemma4ReviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "CHANGES_REQUIRED"]),
    blockers: z.array(z.string()),
    should_fix: z.array(z.string()),
    nits: z.array(z.string()),
    evidence: z.array(z.string()),
    final_recommendation: z.string(),
  })
  .strict();

function packetHasContext(packet: string): boolean {
  return packet.includes("Task id:") && packet.includes("Acceptance criteria") && packet.includes("Files changed");
}

function toMarkdown(review: ReviewOutput): string {
  const section = (title: string, items: string[]): string[] => {
    if (items.length === 0) {
      return [`## ${title}`, "- None"];
    }
    return [`## ${title}`, ...items.map((item) => `- ${item}`)];
  };

  return [
    "# Review Result",
    "",
    "## Decision",
    review.decision,
    "",
    ...section("Blockers", review.blockers),
    "",
    ...section("Should fix", review.should_fix),
    "",
    ...section("Nits", review.nits),
    "",
    ...section("Evidence", review.evidence),
    "",
    "## Final recommendation",
    review.final_recommendation,
    "",
  ].join("\n");
}

const systemPrompt = `
You are Gemma4, constrained reviewer for Banco AI.
Use only this scope: current task context, AGENTS instructions, and review packet.
Return strict JSON only, matching this schema:
{
  decision: "APPROVED" | "CHANGES_REQUIRED",
  blockers: string[],
  should_fix: string[],
  nits: string[],
  evidence: string[],
  final_recommendation: string
}
Decision is CHANGES_REQUIRED if any blocker exists.
Blockers must include mandatory failures, especially:
- missing task context (Task id / Acceptance criteria / Files changed)
- domain boundary issues (domain importing infra, db, web, entrypoints, llm)
- missing/incorrect LLM validation for internal business logic
`;

async function buildFallbackReview(): Promise<ReviewOutput> {
  return {
    decision: "CHANGES_REQUIRED",
    blockers: ["No fue posible invocar Gemma4 o validar salida en JSON."],
    should_fix: ["Verificar conectividad y configuración de NAN_BASE_URL/NAN_API_KEY (fallback OPENAI_*)"],
    nits: [],
    evidence: ["scripts/review-with-gemma.ts"],
    final_recommendation: "Falla temporal en la revisión automática. Corrige la configuración LLM e intenta nuevamente.",
  };
}

async function run() {
  const packetPath = process.argv[2] ?? join(process.cwd(), ".agent", "review-packet.md");
  const packet = await readFile(packetPath, "utf8");
  const reviewModel = process.env.NAN_REVIEW_MODEL ?? process.env.REVIEW_MODEL ?? DEFAULT_REVIEW_MODEL;

  const hasContext = packetHasContext(packet);
  const userPrompt = `\nReview packet:\n\n${packet}\n\n`;

  const result = await generateStructuredJson({
    systemPrompt,
    userPrompt,
    schema: Gemma4ReviewSchema,
    schemaName: "gemma4_review",
    model: reviewModel,
    maxRetries: 2,
    maxTokens: 1200,
  });

  const review: ReviewOutput = (() => {
    if (result.status === "validated") {
      return result.value;
    }

    const blocked = result as LlmValidationBlocked;
    const fallback = blocked.reason ? [blocked.reason] : [];
    return {
      decision: "CHANGES_REQUIRED",
      blockers: fallback,
      should_fix: hasContext ? [] : ["Revisar formato del packet antes de ejecutar la revisión automática."],
      nits: hasContext ? [] : ["El packet no incluye contexto suficiente: Task id / Acceptance criteria / Files changed."],
      evidence: [
        "scripts/review-with-gemma.ts",
        "src/infrastructure/llm/client.ts",
        packetPath,
      ],
      final_recommendation: "No se pudo obtener un review JSON válido tras los reintentos. Corrige la configuración o el packet y reintenta.",
    };
  })();

  if (!hasContext) {
    review.blockers = review.blockers.concat(["Revisar que el packet incluya Task id, Acceptance criteria y Files changed."]);
    review.decision = "CHANGES_REQUIRED";
    if (!review.should_fix.length) {
      review.should_fix = ["Re-ejecutar la generación de packet desde agent-loop."];
    }
  }

  const output = toMarkdown(review);
  console.log(output);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(join(process.cwd(), ".agent", "last-review.md"), output + "\n", "utf8"),
  );
}

run().catch(async (error) => {
  const fallback = await buildFallbackReview();
  const output = toMarkdown({
    ...fallback,
    blockers: [...fallback.blockers, `Error: ${(error as Error).message}`],
  });
  console.log(output);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(join(process.cwd(), ".agent", "last-review.md"), output + "\n", "utf8"),
  );
  process.exit(1);
});
