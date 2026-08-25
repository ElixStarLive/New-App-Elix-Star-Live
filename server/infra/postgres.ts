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

type UsersRelationState = {
  kind: "none" | "table" | "partitioned" | "view" | "matview" | "foreign" | "other";
  hasId: boolean;
  hasUserId: boolean;
};

async function usersRelationState(client: pg.PoolClient): Promise<UsersRelationState> {
  const rel = await client.query<{ relkind: string }>(
    `SELECT c.relkind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'users'
      LIMIT 1`,
  );
  const relkind = rel.rows[0]?.relkind;

  const cols = await client.query<{ has_id: boolean; has_user_id: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
       ) AS has_id,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id'
       ) AS has_user_id`,
  );

  const mapKind = (kind: string | undefined): UsersRelationState["kind"] => {
    if (!kind) return "none";
    if (kind === "r") return "table";
    if (kind === "p") return "partitioned";
    if (kind === "v") return "view";
    if (kind === "m") return "matview";
    if (kind === "f") return "foreign";
    return "other";
  };

  return {
    kind: mapKind(relkind),
    hasId: Boolean(cols.rows[0]?.has_id),
    hasUserId: Boolean(cols.rows[0]?.has_user_id),
  };
}

async function createCanonicalUsersTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL,
      password_hash TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      apple_sub TEXT,
      email_confirmed_at TIMESTAMPTZ,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      banned_until TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized),
      CONSTRAINT users_username_normalized_unique UNIQUE (username_normalized),
      CONSTRAINT users_apple_sub_unique UNIQUE (apple_sub)
    )
  `);
}

async function seedCanonicalUsersFromLegacy(client: pg.PoolClient): Promise<void> {
  const hasLegacy = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'elix_auth_users'
     ) AS exists`,
  );
  if (!hasLegacy.rows[0]?.exists) return;

  await client.query(`
    INSERT INTO users (
      id,
      email,
      email_normalized,
      username,
      username_normalized,
      password_hash,
      display_name,
      bio,
      avatar_url,
      apple_sub,
      email_confirmed_at,
      is_admin,
      is_verified,
      banned_until,
      created_at,
      updated_at
    )
    SELECT
      u.id::uuid,
      COALESCE(NULLIF(u.email, ''), CONCAT('user-', u.id::text, '@invalid.local')),
      COALESCE(NULLIF(LOWER(u.email), ''), CONCAT('user-', u.id::text, '@invalid.local')),
      COALESCE(NULLIF(u.username, ''), CONCAT('user_', REPLACE(u.id::text, '-', ''))),
      COALESCE(NULLIF(LOWER(u.username), ''), CONCAT('user_', REPLACE(u.id::text, '-', ''))),
      u.password_hash,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(u.display_name, ''), COALESCE(NULLIF(u.username, ''), 'user')),
      COALESCE(p.bio, ''),
      COALESCE(NULLIF(p.avatar_url, ''), NULLIF(u.avatar_url, '')),
      u.apple_sub,
      u.email_confirmed_at,
      COALESCE(p.is_admin, FALSE),
      COALESCE(p.is_verified, FALSE),
      p.banned_until,
      COALESCE(u.created_at, NOW()),
      NOW()
    FROM elix_auth_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      email_normalized = EXCLUDED.email_normalized,
      username = EXCLUDED.username,
      username_normalized = EXCLUDED.username_normalized,
      password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      apple_sub = COALESCE(EXCLUDED.apple_sub, users.apple_sub),
      email_confirmed_at = COALESCE(users.email_confirmed_at, EXCLUDED.email_confirmed_at),
      is_admin = EXCLUDED.is_admin,
      is_verified = EXCLUDED.is_verified,
      banned_until = EXCLUDED.banned_until,
      updated_at = NOW()
  `);
}

async function ensureCanonicalUsersPrereq(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  const state = await usersRelationState(client);

  if (state.kind === "none") {
    await createCanonicalUsersTable(client);
    await seedCanonicalUsersFromLegacy(client);
    return;
  }

  if (state.kind === "table" || state.kind === "partitioned") {
    if (!state.hasId) {
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
    return;
  }

  if (state.kind === "view" || state.kind === "matview") {
    logger.warn({ kind: state.kind }, "legacy users relation is a view; converting to canonical table");
    if (state.kind === "view") {
      await client.query(`ALTER VIEW users RENAME TO users_legacy_view`);
    } else {
      await client.query(`ALTER MATERIALIZED VIEW users RENAME TO users_legacy_matview`);
    }
    await createCanonicalUsersTable(client);
    await seedCanonicalUsersFromLegacy(client);
    return;
  }

  throw new Error("Unsupported public.users relation type for canonical migration");
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

    await ensureCanonicalUsersPrereq(client);

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
