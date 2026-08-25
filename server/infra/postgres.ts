import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const ADVISORY_KEY = 87236401;
const BASELINE_MIGRATION = "20260819100000_baseline.sql";

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

async function baseTableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
         AND table_type = 'BASE TABLE'
     ) AS exists`,
    [table],
  );
  return Boolean(rows[0]?.exists);
}

/**
 * NEW app must use a NEW Neon database created from scratch.
 * OLD production Neon is reference/rollback only — never migrate against it.
 *
 * Detect OLD production markers and refuse before any migration DDL runs.
 */
async function assertNewAppDatabaseTarget(
  client: pg.PoolClient,
  alreadyApplied: Set<string>,
): Promise<void> {
  // If NEW baseline already applied on this database, it is the NEW DB target.
  if (alreadyApplied.has(BASELINE_MIGRATION)) return;

  const oldMarkers: string[] = [];
  for (const table of [
    "elix_auth_users",
    "elix_wallet_balances",
    "elix_blocked_users",
    "profiles",
  ] as const) {
    if (await baseTableExists(client, table)) oldMarkers.push(table);
  }

  // Empty public schema (or only elix_schema_migrations) is the correct NEW target.
  if (oldMarkers.length === 0) return;

  throw new Error(
    [
      "NEW app refused to migrate: DATABASE_URL points at the OLD production Neon schema.",
      `OLD markers found: ${oldMarkers.join(", ")}`,
      "",
      "Required architecture:",
      "- OLD app → OLD Neon (untouched reference / rollback)",
      "- NEW staging/app → NEW empty Neon (clean NEW migrations only)",
      "",
      "Safe sequence:",
      "1. Create a NEW empty Neon/PostgreSQL database.",
      "2. Point a NEW/staging Coolify deployment DATABASE_URL at that NEW database (do not flip live production yet).",
      "3. Deploy NEW there; greenfield migrations create the NEW schema.",
      "4. Verify contracts, APIs, tests, and runtime on NEW Neon.",
      "5. Later: migrate data OLD → NEW (preserve IDs), verify, then switch production NEW app to NEW Neon.",
      "",
      "Keep OLD Neon connected only to OLD / rollback until NEW production is proven.",
      "Do not run NEW migrations against OLD. Do not ALTER OLD tables at boot.",
    ].join("\n"),
  );
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
    await client.query("SET search_path TO public");
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
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

    await assertNewAppDatabaseTarget(client, already);

    for (const name of listMigrationFilenames()) {
      if (already.has(name)) continue;
      logger.info({ migration: name }, "applying migration");
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL search_path TO public");
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
