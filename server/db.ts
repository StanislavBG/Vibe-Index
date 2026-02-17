import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { getDbPoolConfig } from "./dbConfig";

const { Pool } = pg;

export const pool = new Pool(getDbPoolConfig() as pg.PoolConfig);
export const db = drizzle(pool, { schema });
