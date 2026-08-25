import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const host = new URL(url).hostname;
console.log("DB_HOST=" + host);
if (host.includes("autumn-meadow")) {
  console.error("REFUSE: OLD Neon");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" },
});

const tables = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'schema_migrations',
      'elix_schema_migrations',
      'elix_auth_users',
      'users',
      'wallet_balances',
      'gifts',
      'foryou_config',
      'elix_foryou_config'
    )
  ORDER BY 1
`);
const names = tables.rows.map((r) => r.table_name);
console.log("TABLES=" + JSON.stringify(names));

if (names.includes("elix_schema_migrations") && !names.includes("schema_migrations")) {
  console.error("LEGACY_MIGRATIONS_TABLE_ONLY: rename/boot to schema_migrations required");
  process.exit(1);
}
if (!names.includes("schema_migrations")) {
  console.error("NO_MIGRATIONS_TABLE");
  process.exit(1);
}

const count = await pool.query(`SELECT COUNT(*)::int AS n FROM schema_migrations`);
console.log("MIGRATIONS_TABLE=schema_migrations COUNT=" + count.rows[0].n);

const auth = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
console.log("USERS_COUNT=" + auth.rows[0].n);

await pool.end();
console.log("NEON_SCHEMA_PROOF=PASS");
