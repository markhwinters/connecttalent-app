import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema.js";

const { Pool } = pkg;

// Single pool instance — reused across the app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error", err);
});

export const db = drizzle(pool, { schema });
export { pool };
