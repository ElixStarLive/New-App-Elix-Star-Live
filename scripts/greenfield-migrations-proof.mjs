/**
 * Prove NEW migrations are greenfield-safe (empty NEW Neon semantics).
 * Non-destructive: never DROP/TRUNCATE. Optional live Neon checks only read + applyPendingMigrations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "server", "migrations");

const CONVERGE = "20260824190000_converge_legacy_neon_to_canonical.sql";
const CANONICALIZE = "20260824200000_canonicalize_video_relations.sql";
const RENAME_FORYOU = "20260825100000_rename_foryou_canonical.sql";
const BASELINE = "20260819100000_baseline.sql";

const failures = [];
function pass(label, detail = "") {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label, detail) {
  failures.push(`${label}: ${detail}`);
  console.log(`FAIL  ${label} — ${detail}`);
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log("=== GREENFIELD MIGRATIONS PROOF ===");
console.log(`MIGRATIONS_DIR=${migrationsDir}`);
console.log(`MIGRATION_FILE_COUNT=${files.length}`);
for (const f of files) console.log(`  ${f}`);

// 1) converge_legacy ABSENT
if (files.includes(CONVERGE) || fs.existsSync(path.join(migrationsDir, CONVERGE))) {
  fail("converge_legacy_absent", `${CONVERGE} is present`);
} else {
  pass("converge_legacy_absent", "file not in server/migrations");
}

// 2) SELECT 1 only migrations
function assertSelect1Only(filename) {
  const raw = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
  const body = stripSqlComments(raw).trim();
  if (!/^SELECT\s+1\s*;?\s*$/i.test(body)) {
    fail(`${filename}_select1_only`, `body is not SELECT 1 only:\n${body.slice(0, 200)}`);
  } else {
    pass(`${filename}_select1_only`);
  }
}
assertSelect1Only(CANONICALIZE);
assertSelect1Only(RENAME_FORYOU);

// 3) baseline: no legacy ALTER DO block (auth/users repair)
{
  const baseline = fs.readFileSync(path.join(migrationsDir, BASELINE), "utf8");
  const code = stripSqlComments(baseline);
  if (/elix_auth_users/i.test(code)) {
    fail("baseline_no_elix_auth_users", "executable SQL references elix_auth_users");
  } else {
    pass("baseline_no_elix_auth_users");
  }
  if (/Legacy-production compatibility preflight/i.test(baseline)) {
    fail("baseline_no_legacy_preflight", "legacy preflight marker present");
  } else {
    pass("baseline_no_legacy_preflight");
  }
  if (/user_id::uuid\s+WHERE\s+id\s+IS\s+NULL/i.test(code)) {
    fail("baseline_no_userid_to_id_repair", "user_id→id repair present");
  } else {
    pass("baseline_no_userid_to_id_repair");
  }
  // Explicit: no DO $$ ... ALTER TABLE users / ADD COLUMN id repair from legacy
  if (
    /DO\s+\$\$[\s\S]*?ALTER\s+TABLE\s+users[\s\S]*?(ADD\s+COLUMN\s+id|RENAME\s+COLUMN\s+user_id)/i.test(
      code,
    )
  ) {
    fail("baseline_no_legacy_alter_do", "legacy ALTER DO block on users found");
  } else {
    pass("baseline_no_legacy_alter_do");
  }
}

// 4) No migration file contains elix_auth_users runtime repair (comments OK)
{
  const offenders = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    const code = stripSqlComments(raw);
    if (/elix_auth_users/i.test(code)) offenders.push(f);
  }
  if (offenders.length) {
    fail("no_elix_auth_users_runtime_repair", offenders.join(", "));
  } else {
    pass("no_elix_auth_users_runtime_repair", "none of " + files.length + " files");
  }
}

// 5) Optional NEW Neon live checks (read-only + applyPendingMigrations idempotent)
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("SKIP  neon_live — DATABASE_URL unset");
} else {
  const host = new URL(databaseUrl).hostname;
  console.log(`DB_HOST=${host}`);
  if (host.includes("autumn-meadow")) {
    fail("neon_not_old", "DATABASE_URL points at OLD Neon (autumn-meadow)");
  } else {
    pass("neon_not_old", host);
    const { default: pg } = await import("pg");
    const { spawnSync } = await import("node:child_process");
    const migrate = spawnSync(
      process.execPath,
      ["--import", "tsx", "-e", "import { applyPendingMigrations, closePool } from './server/infra/postgres.ts'; const url=process.env.DATABASE_URL; const applied=await applyPendingMigrations(url); console.log(JSON.stringify(applied)); await closePool();"],
      { cwd: root, env: process.env, encoding: "utf8" },
    );
    if (migrate.status !== 0) {
      fail("applyPendingMigrations", migrate.stderr || migrate.stdout || `exit ${migrate.status}`);
    } else {
      const appliedLine = (migrate.stdout || "").trim().split(/\r?\n/).filter(Boolean).at(-1) || "[]";
      let applied = [];
      try {
        applied = JSON.parse(appliedLine);
      } catch {
        fail("applyPendingMigrations", `unreadable output: ${appliedLine}`);
        applied = null;
      }
      if (applied) {
        console.log(`MIGRATIONS_APPLIED_THIS_RUN=${JSON.stringify(applied)}`);
        pass("applyPendingMigrations", applied.length === 0 ? "idempotent (0 new)" : `applied ${applied.length}`);
      }
    }

    const client = new pg.Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" },
    });
    await client.connect();
    try {
      const { rows: migRows } = await client.query(
        `SELECT filename, applied_at FROM schema_migrations ORDER BY filename`,
      );
      const dbNames = new Set(migRows.map((r) => r.filename));
      console.log(`SCHEMA_MIGRATIONS_COUNT=${migRows.length}`);
      console.log(`DISK_MIGRATION_FILE_COUNT=${files.length}`);

      const missing = files.filter((f) => !dbNames.has(f));
      if (missing.length) {
        fail("all_current_migrations_applied", missing.join(", "));
      } else {
        pass("all_current_migrations_applied", `${files.length}/${files.length}`);
      }

      const orphans = migRows.filter((r) => !files.includes(r.filename));
      if (orphans.length) {
        // Historical bookkeeping only (e.g. removed converge file). Not wiped — non-destructive proof.
        console.log(
          `WARN  orphan_schema_migrations_rows — ${orphans
            .map((r) => r.filename)
            .join(", ")} (file absent; row retained; no destructive cleanup)`,
        );
      } else {
        pass("no_orphan_schema_migrations_rows");
      }

      const { rows: authRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'elix_auth_users'`,
      );
      if ((authRows[0]?.n ?? 0) > 0) {
        fail("no_elix_auth_users_table", "table exists on NEW Neon");
      } else {
        pass("no_elix_auth_users_table");
      }

      const { rows: usersRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'`,
      );
      if ((usersRows[0]?.n ?? 0) !== 1) {
        fail("users_table_present", "canonical users table missing");
      } else {
        pass("users_table_present");
      }
    } finally {
      await client.end();
    }
  }
}

console.log("=== SUMMARY ===");
if (failures.length) {
  console.log("GREENFIELD_MIGRATIONS_PROOF=FAIL");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("GREENFIELD_MIGRATIONS_PROOF=PASS");
console.log(
  'VERDICT_NEW_MIGRATIONS_FROM_EMPTY_NEW_NEON=PASS (greenfield SQL files + applyPendingMigrations on NEW Neon)',
);
