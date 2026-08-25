/**
 * REAL NEW integrations proof — NOT a mock harness.
 *
 * Requires real env from the process (typically loaded from .env / Coolify):
 *   DATABASE_URL, VALKEY_URL|REDIS_URL, LIVEKIT_*, BUNNY_*, JWT_SECRET
 *
 * FORBIDDEN in this file:
 *   - fake credentials ("integration-key", "cdn.test")
 *   - delete process.env.VALKEY_URL / REDIS_URL / LIVEKIT_* / SMTP_URL
 *   - claiming PASS when a required service is missing or unreachable
 *
 * TEST-ONLY mock harness remains: server/http.it.test.ts (isolated; not release proof).
 */
import pg from "pg";
import { Redis } from "ioredis";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { applyPendingMigrations, closePool } from "../server/infra/postgres.ts";
import { resetEnvCache } from "../server/infra/env.ts";
import { closeValkey } from "../server/infra/valkey.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function refuseFake(value: string, label: string): void {
  const lower = value.toLowerCase();
  const banned = ["integration-key", "cdn.test", "integration-zone", "example.com", "changeme", "placeholder"];
  for (const b of banned) {
    if (lower.includes(b)) throw new Error(`${label} looks fake/test: contains ${b}`);
  }
}

const databaseUrl = requireEnv("DATABASE_URL");
const dbHost = new URL(databaseUrl).hostname;
if (dbHost.includes("autumn-meadow")) throw new Error("refuse OLD Neon");
refuseFake(databaseUrl, "DATABASE_URL");

const valkeyUrl = (process.env.VALKEY_URL || process.env.REDIS_URL || "").trim();
if (!valkeyUrl) throw new Error("VALKEY_URL (or REDIS_URL) is required for real proof");
refuseFake(valkeyUrl, "VALKEY_URL");

const livekitUrl = requireEnv("LIVEKIT_URL");
const livekitKey = requireEnv("LIVEKIT_API_KEY");
const livekitSecret = requireEnv("LIVEKIT_API_SECRET");
refuseFake(livekitUrl, "LIVEKIT_URL");
refuseFake(livekitKey, "LIVEKIT_API_KEY");
refuseFake(livekitSecret, "LIVEKIT_API_SECRET");

const bunnyZone = requireEnv("BUNNY_STORAGE_ZONE");
const bunnyKey = requireEnv("BUNNY_STORAGE_API_KEY");
const bunnyCdn = requireEnv("BUNNY_CDN_HOSTNAME");
refuseFake(bunnyZone, "BUNNY_STORAGE_ZONE");
refuseFake(bunnyKey, "BUNNY_STORAGE_API_KEY");
refuseFake(bunnyCdn, "BUNNY_CDN_HOSTNAME");

process.env.PG_SSL_REJECT_UNAUTHORIZED = process.env.PG_SSL_REJECT_UNAUTHORIZED || "false";
resetEnvCache();

console.log("DB_HOST=" + dbHost);
console.log("LIVEKIT_HOST=" + new URL(livekitUrl).hostname);
console.log("BUNNY_CDN=" + bunnyCdn);
console.log("BUNNY_ZONE=" + bunnyZone);
{
  const m = valkeyUrl.match(/@([^:/]+)/);
  console.log("VALKEY_HOST=" + (m?.[1] || "unparsed"));
}

// --- Neon ---
const applied = await applyPendingMigrations(databaseUrl);
console.log("MIGRATIONS_APPLIED=" + JSON.stringify(applied));
const c = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: ping } = await c.query<{ ok: number }>("SELECT 1::int AS ok");
if (ping[0]?.ok !== 1) throw new Error("Neon ping failed");
console.log("NEON_PING=PASS");
await c.end();

// --- Valkey (real) ---
let valkeyPass = false;
try {
  const redis = new Redis(valkeyUrl, { maxRetriesPerRequest: 2, connectTimeout: 8000, lazyConnect: true });
  await redis.connect();
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error("unexpected ping: " + pong);
  const probeKey = `new:proof:${Date.now()}`;
  await redis.set(probeKey, "1", "EX", 30);
  const got = await redis.get(probeKey);
  await redis.del(probeKey);
  if (got !== "1") throw new Error("valkey set/get failed");
  await redis.quit();
  valkeyPass = true;
  console.log("VALKEY_PING=PASS");
} catch (error) {
  console.log("VALKEY_PING=FAIL");
  console.log("VALKEY_ERROR=" + (error instanceof Error ? error.message : String(error)));
}

// --- LiveKit (real) ---
let livekitPass = false;
try {
  const at = new AccessToken(livekitKey, livekitSecret, {
    identity: `proof_${Date.now()}`,
    ttl: "2m",
  });
  at.addGrant({ roomJoin: true, room: "elix-proof-room", canPublish: false, canSubscribe: true });
  const jwt = await at.toJwt();
  if (!jwt || jwt.split(".").length !== 3) throw new Error("token mint failed");
  const rooms = new RoomServiceClient(livekitUrl.replace(/^ws/, "http"), livekitKey, livekitSecret);
  const listed = await rooms.listRooms();
  if (!Array.isArray(listed)) throw new Error("listRooms failed");
  livekitPass = true;
  console.log("LIVEKIT_TOKEN_AND_LIST=PASS rooms=" + listed.length);
} catch (error) {
  console.log("LIVEKIT_PROOF=FAIL");
  console.log("LIVEKIT_ERROR=" + (error instanceof Error ? error.message : String(error)));
}

// --- Bunny (real) ---
let bunnyPass = false;
try {
  const probePath = `_elix_proof/${Date.now()}.txt`;
  const put = await fetch(`https://storage.bunnycdn.com/${bunnyZone}/${probePath}`, {
    method: "PUT",
    headers: { AccessKey: bunnyKey, "Content-Type": "text/plain" },
    body: "elix-proof",
  });
  if (!put.ok) throw new Error(`bunny PUT ${put.status}`);
  const del = await fetch(`https://storage.bunnycdn.com/${bunnyZone}/${probePath}`, {
    method: "DELETE",
    headers: { AccessKey: bunnyKey },
  });
  if (!del.ok && del.status !== 404) throw new Error(`bunny DELETE ${del.status}`);
  bunnyPass = true;
  console.log("BUNNY_PUT_DELETE=PASS");
} catch (error) {
  console.log("BUNNY_PROOF=FAIL");
  console.log("BUNNY_ERROR=" + (error instanceof Error ? error.message : String(error)));
}

// --- SMTP (real if configured; required only when set for proof) ---
const smtp = process.env.SMTP_URL?.trim() || "";
let smtpStatus = "NOT_CONFIGURED";
if (smtp) {
  refuseFake(smtp, "SMTP_URL");
  try {
    const host = new URL(smtp).hostname;
    smtpStatus = host ? `CONFIGURED_HOST=${host}` : "CONFIGURED";
    console.log("SMTP=" + smtpStatus);
  } catch {
    smtpStatus = "INVALID_URL";
    console.log("SMTP=FAIL invalid URL");
  }
} else {
  console.log("SMTP=NOT_CONFIGURED");
}

await closePool().catch(() => undefined);
await closeValkey().catch(() => undefined);

console.log("FAKE_FALLBACKS_USED=0");
console.log("ENV_DELETION_HACKS=0");
console.log("MOCKS_AS_PRODUCTION_PROOF=NO");

if (!valkeyPass || !livekitPass || !bunnyPass) {
  console.log("REAL_NEW_INTEGRATIONS_PROOF=FAIL");
  process.exit(1);
}
console.log("REAL_NEW_INTEGRATIONS_PROOF=PASS");
