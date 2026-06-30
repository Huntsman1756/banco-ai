import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readOpencodeNanConfig } from "../src/infrastructure/llm/client";

describe("opencode NAN config", () => {
  it("reads provider.nan options without requiring env vars", () => {
    const dir = mkdtempSync(join(tmpdir(), "banco-ai-opencode-"));
    const path = join(dir, "opencode.json");
    try {
      writeFileSync(
        path,
        JSON.stringify({
          provider: {
            nan: {
              options: {
                baseURL: "https://example.invalid/v1",
                apiKey: "test-key",
              },
            },
          },
        }),
        "utf8",
      );

      expect(readOpencodeNanConfig(path)).toEqual({
        baseUrl: "https://example.invalid/v1",
        apiKey: "test-key",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores configs without provider.nan credentials", () => {
    const dir = mkdtempSync(join(tmpdir(), "banco-ai-opencode-"));
    const path = join(dir, "opencode.json");
    try {
      writeFileSync(path, JSON.stringify({ provider: { other: {} } }), "utf8");
      expect(readOpencodeNanConfig(path)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
