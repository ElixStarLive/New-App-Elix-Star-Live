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

type TableWithUuidId = "users" | "videos" | "live_streams" | "battle_results" | "chat_threads" | "shop_items";

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
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

async function hasColumn(client: pg.PoolClient, table: string, column: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return Boolean(rows[0]?.exists);
}

async function ensureUuidIdColumn(
  client: pg.PoolClient,
  table: TableWithUuidId,
  sourceColumns: string[] = [],
): Promise<void> {
  if (!(await tableExists(client, table))) return;
  if (!(await hasColumn(client, table, "id"))) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS id UUID`);

    for (const source of sourceColumns) {
      if (!(await hasColumn(client, table, source))) continue;
      await client.query(`
        UPDATE ${table}
           SET id = ${source}::uuid
         WHERE id IS NULL
           AND ${source}::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      `);
    }

    await client.query(`UPDATE ${table} SET id = gen_random_uuid() WHERE id IS NULL`);
  }

  await client.query(`
    WITH ranked AS (
      SELECT ctid,
             ROW_NUMBER() OVER (PARTITION BY id ORDER BY ctid) AS rn
      FROM ${table}
      WHERE id IS NOT NULL
    )
    UPDATE ${table} t
       SET id = gen_random_uuid()
      FROM ranked r
     WHERE t.ctid = r.ctid
       AND r.rn > 1
  `);

  await client.query(`UPDATE ${table} SET id = gen_random_uuid() WHERE id IS NULL`);
  await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET NOT NULL`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_id_unique_idx ON ${table}(id)`);
}

async function ensureGiftsIdColumn(client: pg.PoolClient): Promise<void> {
  if (!(await tableExists(client, "gifts"))) return;

  await client.query(`ALTER TABLE gifts ADD COLUMN IF NOT EXISTS id TEXT`);

  if (await hasColumn(client, "gifts", "gift_id")) {
    await client.query(`UPDATE gifts SET id = gift_id::text WHERE id IS NULL AND gift_id IS NOT NULL`);
  }
  if (await hasColumn(client, "gifts", "name")) {
    await client.query(`UPDATE gifts SET id = name::text WHERE id IS NULL AND name IS NOT NULL`);
  }

  await client.query(`
    WITH ranked AS (
      SELECT ctid,
             ROW_NUMBER() OVER (PARTITION BY id ORDER BY ctid) AS rn
      FROM gifts
      WHERE id IS NOT NULL
    )
    UPDATE gifts g
       SET id = id || '_dup_' || replace(g.ctid::text, ':', '_')
      FROM ranked r
     WHERE g.ctid = r.ctid
       AND r.rn > 1
  `);

  const nullIds = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM gifts WHERE id IS NULL`);
  if (Number(nullIds.rows[0]?.n ?? "0") > 0) {
    throw new Error("canonical prerequisite failed: gifts.id is missing and cannot be derived safely");
  }

  await client.query(`ALTER TABLE gifts ALTER COLUMN id SET NOT NULL`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS gifts_id_unique_idx ON gifts(id)`);
}

async function validateFkTargets(client: pg.PoolClient): Promise<void> {
  const checks: Array<{ table: string; column: string }> = [
    { table: "users", column: "id" },
    { table: "videos", column: "id" },
    { table: "live_streams", column: "id" },
    { table: "battle_results", column: "id" },
    { table: "gifts", column: "id" },
    { table: "chat_threads", column: "id" },
    { table: "shop_items", column: "id" },
  ];

  for (const check of checks) {
    const exists = await tableExists(client, check.table);
    if (!exists) continue;
    const col = await hasColumn(client, check.table, check.column);
    if (!col) {
      throw new Error(
        `canonical prerequisite failed: ${check.table}.${check.column} is missing before baseline FK execution`,
      );
    }
  }
}

async function ensureCanonicalUsersPrereq(client: pg.PoolClient): Promise<void> {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  const state = await usersRelationState(client);

  if (state.kind === "none") {
    await createCanonicalUsersTable(client);
    await seedCanonicalUsersFromLegacy(client);
  } else if (state.kind === "table" || state.kind === "partitioned") {
    await ensureUuidIdColumn(client, "users", state.hasUserId ? ["user_id"] : []);
  } else if (state.kind === "view" || state.kind === "matview") {
    logger.warn({ kind: state.kind }, "legacy users relation is a view; converting to canonical table");
    if (state.kind === "view") {
      await client.query(`ALTER VIEW users RENAME TO users_legacy_view`);
    } else {
      await client.query(`ALTER MATERIALIZED VIEW users RENAME TO users_legacy_matview`);
    }
    await createCanonicalUsersTable(client);
    await seedCanonicalUsersFromLegacy(client);
  } else {
    throw new Error("Unsupported public.users relation type for canonical migration");
  }

  // Baseline CREATE ... REFERENCES parent(id) fails on legacy Neon tables that
  // only have user_id / video_id / stream_id / gift_id / etc. Make every FK
  // parent uniquely addressable by id before any migration SQL runs.
  await ensureUuidIdColumn(client, "videos", ["video_id"]);
  await ensureUuidIdColumn(client, "live_streams", ["stream_id"]);
  await ensureUuidIdColumn(client, "battle_results", ["battle_id"]);
  await ensureUuidIdColumn(client, "chat_threads", ["thread_id"]);
  await ensureUuidIdColumn(client, "shop_items", ["item_id"]);
  await ensureGiftsIdColumn(client);
  await validateFkTargets(client);
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
