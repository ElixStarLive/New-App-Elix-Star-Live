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

async function columnUdtName(
  client: pg.PoolClient,
  table: string,
  column: string,
): Promise<string | null> {
  const { rows } = await client.query<{ udt_name: string }>(
    `SELECT udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1`,
    [table, column],
  );
  return rows[0]?.udt_name ?? null;
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
 * NEW baseline is greenfield-only (uuid id primary keys).
 * Pointing Coolify at OLD production Neon and "making baseline legacy-safe"
 * is not supported. Fail before any destructive/half-migration work.
 */
async function assertGreenfieldOrCanonicalDatabase(
  client: pg.PoolClient,
  alreadyApplied: Set<string>,
): Promise<void> {
  if (alreadyApplied.has(BASELINE_MIGRATION)) return;

  const problems: string[] = [];

  const uuidParents: Array<{ table: string; legacyKey?: string }> = [
    { table: "users", legacyKey: "user_id" },
    { table: "videos", legacyKey: "video_id" },
    { table: "live_streams", legacyKey: "stream_id" },
    { table: "battle_results", legacyKey: "battle_id" },
    { table: "chat_threads", legacyKey: "thread_id" },
    { table: "shop_items", legacyKey: "item_id" },
  ];

  for (const parent of uuidParents) {
    if (!(await baseTableExists(client, parent.table))) continue;
    const idUdt = await columnUdtName(client, parent.table, "id");
    if (!idUdt) {
      if (parent.legacyKey && (await columnUdtName(client, parent.table, parent.legacyKey))) {
        problems.push(
          `${parent.table} exists with ${parent.legacyKey} but without canonical uuid id (legacy Neon shape)`,
        );
      }
      continue;
    }
    if (idUdt !== "uuid") {
      problems.push(`${parent.table}.id is type ${idUdt}, NEW baseline requires uuid`);
    }
  }

  if (await baseTableExists(client, "gifts")) {
    const giftIdUdt = await columnUdtName(client, "gifts", "id");
    const hasGiftId = Boolean(await columnUdtName(client, "gifts", "gift_id"));
    if (!giftIdUdt && hasGiftId) {
      problems.push("gifts exists with gift_id but without canonical text id (legacy Neon shape)");
    } else if (giftIdUdt && giftIdUdt !== "text" && giftIdUdt !== "varchar" && giftIdUdt !== "bpchar") {
      problems.push(`gifts.id is type ${giftIdUdt}, NEW baseline requires text`);
    }
  }

  if (await baseTableExists(client, "elix_auth_users")) {
    const usersIdUdt = (await baseTableExists(client, "users"))
      ? await columnUdtName(client, "users", "id")
      : null;
    if (usersIdUdt !== "uuid") {
      problems.push("elix_auth_users is present without canonical public.users(id uuid) (legacy Neon shape)");
    }
  }

  if (problems.length === 0) return;

  throw new Error(
    [
      "NEW app refused to migrate: DATABASE_URL points at a legacy / incompatible Neon schema.",
      ...problems.map((p) => `- ${p}`),
      "",
      "Proper fix (not a bootstrap patch):",
      "1. Keep OLD Coolify + OLD Neon serving production.",
      "2. Create a NEW empty Neon database for the NEW app.",
      "3. Set the NEW Coolify service DATABASE_URL to that empty database.",
      "4. Deploy NEW so greenfield baseline can create the uuid schema cleanly.",
      "5. Cut over data / DNS only after NEW health + migrations pass.",
      "",
      "Do not point NEW start:prod at OLD production Neon.",
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

    await assertGreenfieldOrCanonicalDatabase(client, already);

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
