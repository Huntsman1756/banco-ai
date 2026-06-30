import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { logger } from "../shared/logger.js";

export type DbClient = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | null = null;

export function createDbClient(url?: string): DbClient {
  const connectionString = url ?? process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_LOCAL or DATABASE_URL must be defined");
  }

  if (!_pool) {
    _pool = new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _pool.on("error", (err) => {
      logger.error("pg pool unexpected error", {
        entrypoint: "db",
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return drizzle(_pool, { schema });
}

export async function closeDbPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    logger.info("db pool closed", { entrypoint: "db" });
  }
}
