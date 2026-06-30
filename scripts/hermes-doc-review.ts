import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { generateStructuredJson } from "../src/infrastructure/llm/client.js";

const ReviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "CHANGES_REQUIRED"]),
    blockers: z.array(z.string()),
    should_fix: z.array(z.string()),
    article_drafts: z.array(
      z.object({
        slug: z.string().min(1).default("articulo-informativo"),
        title: z.string().min(1).default("Articulo informativo Banco AI"),
        summary: z.string().min(1).default("Borrador informativo generado por Hermes."),
        outline: z.array(z.string().min(1)).min(1).default(["Resumen del tema", "Criterios de comparativa", "Limitaciones"]),
        source_files: z.array(z.string().min(1)).default([]),
      }),
    ),
    final_recommendation: z.string().min(1).default("Revisar blockers y should_fix antes de aprobar."),
  })
  .strict();

type CatalogSummary = {
  generatedAt?: string;
  total: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byBank: Record<string, number>;
};

const HERMES_SKILLS = [
  "docs/hermes/skills/read-bank-source-corpus.md",
  "docs/hermes/skills/review-product-publication.md",
  "docs/hermes/skills/draft-banking-articles.md",
  "docs/hermes/skills/read-runtime-and-secrets.md",
];

const DOCS_TO_REVIEW = [
  "AGENTS.md",
  "README.md",
  "docs/specs/2026-06-16-banco-ai-design.md",
  "docs/runbooks/CONDITIONS_PIPELINE.md",
  "docs/runbooks/NAN_CLOUD_BASIC.md",
  "docs/architecture/REGULATORY_GUARDRAILS.md",
  "docs/architecture/SECURITY.md",
  "docs/loops/MODEL_LIMITS.md",
];

function increment(map: Record<string, number>, key: string | undefined): void {
  const normalized = key?.trim() || "missing";
  map[normalized] = (map[normalized] ?? 0) + 1;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function buildCatalogSummary(): Promise<CatalogSummary> {
  const raw = await readText("data/manual-product-conditions.json");
  if (!raw) {
    return {
      total: 0,
      byStatus: {},
      byKind: {},
      byBank: {},
    };
  }

  const parsed = JSON.parse(raw) as {
    generatedAt?: string;
    products?: Array<{ status?: string; productKind?: string; bank?: string }>;
  };
  const products = parsed.products ?? [];
  const summary: CatalogSummary = {
    generatedAt: parsed.generatedAt,
    total: products.length,
    byStatus: {},
    byKind: {},
    byBank: {},
  };
  for (const product of products) {
    increment(summary.byStatus, product.status);
    increment(summary.byKind, product.productKind);
    increment(summary.byBank, product.bank);
  }
  return summary;
}

async function buildReviewPrompt(): Promise<string> {
  const skills = await Promise.all(
    HERMES_SKILLS.map(async (path) => ({
      path,
      content: await readText(path),
    })),
  );
  const docs = await Promise.all(
    DOCS_TO_REVIEW.map(async (path) => ({
      path,
      content: (await readText(path)).slice(0, 12_000),
    })),
  );
  const catalogSummary = await buildCatalogSummary();
  return [
    "Revisa Banco AI antes de aprobar/publicar cambios de producto.",
    "Primero aplica las skills Hermes incluidas abajo. Si una skill contradice una salida tentativa, prevalece la skill.",
    "No apruebes productos automaticamente. Detecta riesgos y genera borradores de articulos informativos.",
    "Respeta: web-only, NaN Cloud Basic, no asesoramiento personalizado, ranking solo con approved/current.",
    "No imprimas secretos, URLs de proveedor, claves API, raw PDF text ni prompts completos.",
    "",
    "HERMES SKILLS:",
    ...skills.map((skill) => `SKILL: ${skill.path}\n${skill.content}`),
    "",
    `Catalog summary:\n${JSON.stringify(catalogSummary, null, 2)}`,
    "",
    ...docs.map((doc) => `FILE: ${doc.path}\n${doc.content}`),
  ].join("\n\n---\n\n");
}

function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "articulo";
}

async function writeArticleDrafts(articleDrafts: Array<z.infer<typeof ReviewSchema>["article_drafts"][number]>): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const dir = join("docs", "articles", "generated");
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (const draft of articleDrafts) {
    const slug = sanitizeSlug(draft.slug);
    const path = join(dir, `${today}-${slug}.md`);
    const body = [
      "---",
      `title: ${JSON.stringify(draft.title)}`,
      `generatedAt: ${JSON.stringify(new Date().toISOString())}`,
      "status: draft",
      "---",
      "",
      `# ${draft.title}`,
      "",
      draft.summary,
      "",
      "## Esquema",
      "",
      ...draft.outline.map((item) => `- ${item}`),
      "",
      "## Fuentes internas",
      "",
      ...draft.source_files.map((source) => `- \`${source}\``),
      "",
      "> Borrador informativo. No constituye asesoramiento personalizado.",
      "",
    ].join("\n");
    await writeFile(path, body, "utf8");
    paths.push(path);
  }
  return paths;
}

async function main(): Promise<void> {
  const result = await generateStructuredJson({
    schema: ReviewSchema,
    schemaName: "HermesDocReviewSchema",
    systemPrompt: "Eres Hermes, auditor documental de Banco AI. Devuelve SOLO JSON estricto.",
    userPrompt: await buildReviewPrompt(),
    model: process.env.NAN_REVIEW_MODEL || "gemma4",
    temperature: 0.2,
    maxTokens: 1600,
    maxRetries: 2,
  });

  const outputPath = join(".agent", "hermes-doc-review.json");
  await mkdir(dirname(outputPath), { recursive: true });
  const persistedResult = {
    ...result,
    hermesSkills: HERMES_SKILLS,
  };
  await writeFile(outputPath, `${JSON.stringify(persistedResult, null, 2)}\n`, "utf8");

  if (result.status === "validated") {
    const articlePaths = await writeArticleDrafts(result.value.article_drafts);
    console.log(
      JSON.stringify(
      {
        status: result.status,
        decision: result.value.decision,
        skills: HERMES_SKILLS,
        blockers: result.value.blockers.length,
          shouldFix: result.value.should_fix.length,
          articleDrafts: articlePaths,
          outputPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: result.status,
        attempts: result.attempts,
        reason: result.reason,
        outputPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
