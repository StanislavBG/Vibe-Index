export function getDbPoolConfig(maxConnections?: number): Record<string, unknown> {
  const { DATABASE_URL } = process.env;

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const base: Record<string, unknown> = {
    connectionString: DATABASE_URL,
  };
  if (maxConnections) base.max = maxConnections;

  return base;
}
