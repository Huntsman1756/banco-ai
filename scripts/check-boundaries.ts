import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const FORBIDDEN_IMPORTS = [
  "src/infrastructure/",
  "src/web/",
  "src/entrypoints/",
  "drizzle-orm",
  "pg",
  "telegram",
  "grammy",
  "hono",
];

const IMPORT_FROM_RE = /\b(?:import|export)\b[^;]*\bfrom\s+['"]([^'"]+)['"]/g;
const PROJECT_ROOT = resolve(process.cwd());
const SRC_PREFIX = resolve(PROJECT_ROOT, "src").replace(/\\/g, "/") + "/";

function isForbiddenImport(specifier: string, filePath: string): string | null {
  const forbiddenModule = FORBIDDEN_IMPORTS.find((forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}`));
  if (forbiddenModule) {
    return forbiddenModule;
  }

  if (specifier.startsWith(".") || specifier.startsWith("..")) {
    const absoluteImport = resolve(dirname(filePath), specifier).replace(/\\/g, "/");
    if (absoluteImport.startsWith(SRC_PREFIX)) {
      const relativeFromSrc = absoluteImport.slice(SRC_PREFIX.length);
      const forbiddenRelative = FORBIDDEN_IMPORTS.find((forbidden) => {
        if (!forbidden.startsWith("src/")) {
          return false;
        }
        const base = forbidden.slice("src/".length);
        return relativeFromSrc === base || relativeFromSrc.startsWith(`${base}/`);
      });
      if (forbiddenRelative) {
        return forbiddenRelative;
      }
    }
  }

  return null;
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      out.push(...(await walk(join(dir, entry.name), files)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

async function scanDomainBoundary() {
  const files = await walk("src/domain");
  const violations: string[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(IMPORT_FROM_RE)) {
      const specifier = match[1];
      const violation = isForbiddenImport(specifier, file);
      if (violation) {
        violations.push(`${file} -> ${specifier} (${violation})`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Boundary violations:");
    for (const line of violations) {
      console.error(`- ${line}`);
    }
    process.exit(1);
  }

  console.log("Domain boundary check passed.");
}

scanDomainBoundary().catch((error) => {
  console.error(`boundary check failed: ${(error as Error).message}`);
  process.exit(1);
});
