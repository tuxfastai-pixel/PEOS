import { Pool } from "pg";
import { readServerEnvironment } from "../config/env";

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  if (pool) return pool;
  const env = readServerEnvironment();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  return pool;
}
