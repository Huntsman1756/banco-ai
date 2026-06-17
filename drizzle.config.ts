import { existsSync, readFileSync } from "node:fs";
import { defineConfig, type Config } from "drizzle-kit";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [name, ...rest] = trimmed.split("=");
    if (!name || rest.length === 0) continue;
    process.env[name] ??= rest.join("=").replace(/^"|"$/g, "");
  }
}

loadEnvFile(".env");

const DATABASE_URL = process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
} satisfies Config);
