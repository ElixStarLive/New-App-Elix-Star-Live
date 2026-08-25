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

async function usersTableState(
  client: pg.PoolClient,
): Promise<{ hasUsers: boolean; hasId: boolean; hasUserId: boolean }> {
  const { rows } = await client.query<{ has_users: boolean; has_id: boolean; has_user_id: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS has_users,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
       ) AS has_id,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id'
       ) AS has_user_id`,
  );
  const row = rows[0];
  return {
    hasUsers: Boolean(row?.has_users),
    hasId: Boolean(row?.has_id),
    hasUserId: Boolean(row?.has_user_id),
  };
}

async function ensureUsersIdColumn(client: pg.PoolClient): Promise<void> {
  const state = await usersTableState(client);
  if (!state.hasUsers || state.hasId) return;

  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID`);

  if (state.hasUserId) {
    await client.query(`
      UPDATE users
         SET id = user_id::uuid
       WHERE id IS NULL
         AND user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    `);
  }

  await client.query(`UPDATE users SET id = gen_random_uuid() WHERE id IS NULL`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_id_unique_idx ON users(id)`);
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
    const filenames = listMigrationFilenames();
    const baseline = "20260819100000_baseline.sql";

    const usersState = await usersTableState(client);
    if (already.has(baseline) && (!usersState.hasUsers || !usersState.hasId)) {
      logger.warn(
        { migration: baseline },
        "baseline was marked applied but users schema is incomplete; unmarking baseline for safe replay",
      );
      await client.query("DELETE FROM elix_schema_migrations WHERE filename = $1", [baseline]);
      already.delete(baseline);
    }

    await ensureUsersIdColumn(client);

    for (const name of filenames) {
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
