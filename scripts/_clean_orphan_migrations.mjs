import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || url.includes("autumn-meadow")) {
  console.error("REFUSE_OLD_OR_MISSING");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const del = await c.query(
  `DELETE FROM schema_migrations WHERE filename LIKE '%converge%' RETURNING filename`,
);
console.log("DELETED=" + JSON.stringify(del.rows.map((r) => r.filename)));
const n = await c.query(`SELECT COUNT(*)::int AS n FROM schema_migrations`);
console.log("MIGRATIONS_COUNT=" + n.rows[0].n);
await c.end();
