import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const ADVISORY_KEY = 87236401;

function migrationsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
}

export function listMigrationFilenames(): string[] {
  return fs
    .readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function readMigrationSql(name: string): string {
  return fs.readFileSync(path.join(migrationsDir(), name), "utf8");
}

export function directDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("pooler") && parsed.hostname.includes("neon.tech")) {
      parsed.hostname = parsed.hostname.replace("-pooler", "");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = env().DATABASE_URL;
    const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
    pool = new pg.Pool({
      connectionString: url,
      max: env().isProduction ? 20 : 5,
      ssl: needsSsl ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function applyPendingMigrations(databaseUrl = env().DATABASE_URL): Promise<string[]> {
  const url = directDatabaseUrl(databaseUrl);
  const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
  const migratePool = new pg.Pool({
    connectionString: url,
    max: 1,
    ssl: needsSsl ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
  const applied: string[] = [];
  const client = await migratePool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS elix_schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM elix_schema_migrations ORDER BY id",
    );
    const already = new Set(rows.map((r) => r.filename));
    for (const name of listMigrationFilenames()) {
      if (already.has(name)) continue;
      logger.info({ migration: name }, "applying migration");
      await client.query("BEGIN");
      try {
        await client.query(readMigrationSql(name));
        await client.query("INSERT INTO elix_schema_migrations (filename) VALUES ($1)", [name]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_KEY]).catch(() => undefined);
    client.release();
    await migratePool.end();
  }
  return applied;
}

export async function assertMigrationsApplied(): Promise<void> {
  const { rows } = await getPool().query<{ filename: string }>(
    "SELECT filename FROM elix_schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.filename));
  const missing = listMigrationFilenames().filter((name) => !applied.has(name));
  if (missing.length > 0) {
    throw new Error(`Migrations not applied: ${missing.join(", ")}`);
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
