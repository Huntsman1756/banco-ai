import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DbClient = NodePgDatabase<typeof schema>;

export function createDbClient(url?: string): DbClient {
  const connectionString = url ?? process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_LOCAL or DATABASE_URL must be defined");
  }

  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}
