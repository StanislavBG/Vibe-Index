import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getConnectionConfig(): pg.PoolConfig {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  return { connectionString: DATABASE_URL };
}

export const pool = new Pool(getConnectionConfig());
export const db = drizzle(pool, { schema });
