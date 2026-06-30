import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HERMES_SKILL_PATHS = [
  "docs/hermes/skills/read-bank-source-corpus.md",
  "docs/hermes/skills/review-product-publication.md",
  "docs/hermes/skills/draft-banking-articles.md",
  "docs/hermes/skills/read-runtime-and-secrets.md",
];

describe("Hermes skills", () => {
  it("keeps required reading skills present and wired into the review script", () => {
    const script = readFileSync("scripts/hermes-doc-review.ts", "utf8");

    for (const path of HERMES_SKILL_PATHS) {
      const content = readFileSync(path, "utf8");
      expect(content).toContain("# Hermes Skill:");
      expect(content.length).toBeGreaterThan(300);
      expect(script).toContain(path);
    }
  });
});
