import path from "path";
import fs from "fs";

const SOCKET_DIR = path.join(process.env.HOME || "/home/runner", ".pg_data", "sockets");

export function getDbPoolConfig(maxConnections?: number): Record<string, unknown> {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const base: Record<string, unknown> = {};
  if (maxConnections) base.max = maxConnections;

  try {
    const url = new URL(DATABASE_URL);
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      fs.existsSync(path.join(SOCKET_DIR, ".s.PGSQL.5432"))
    ) {
      return {
        ...base,
        host: SOCKET_DIR,
        port: 5432,
        user: url.username || "postgres",
        password: url.password || undefined,
        database: url.pathname.slice(1) || "vibeindex",
      };
    }
  } catch {}

  return { ...base, connectionString: DATABASE_URL };
}
