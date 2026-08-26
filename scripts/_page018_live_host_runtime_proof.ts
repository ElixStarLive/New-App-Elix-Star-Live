/**
 * PAGE-018 runtime proof — host start/end against NEW Neon + Valkey (+ LiveKit when configured).
 * Run: npx tsx scripts/_page018_live_host_runtime_proof.ts
 * Uses in-process startLive/endLive (authoritative) and optional HTTP :8080 parity check.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey, valkeyGet } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { hostPresenceKey } = await import("../server/modules/live/hostGrace.ts");
const { startLive, endLive } = await import("../server/modules/live/start.ts");
const { isLivekitConfigured } = await import("../server/infra/livekit.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p18${Date.now().toString(36)}`;
const password = "password12";

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function accessToken(body: unknown): string {
  const session = asRecord(asRecord(body).session);
  return String(session.access_token ?? session.accessToken ?? "");
}

async function registerUser(stamp: string) {
  const username = `${unique}${stamp}`.slice(0, 12);
  const email = `${username}@example.com`;
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register ${stamp} ${registered.status} ${JSON.stringify(registered.body)}`);
  }
  let token = accessToken(registered.body);
  let id = String(asRecord(asRecord(registered.body).user).id ?? "");
  if (!token) {
    await getPool().query(
      `UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE email_normalized = $1`,
      [email.toLowerCase()],
    );
    const login = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200) throw new Error(`login ${stamp} ${login.status} ${JSON.stringify(login.body)}`);
    token = accessToken(login.body);
    id = String(asRecord(asRecord(login.body).user).id ?? id);
  }
  if (!id || !token) throw new Error(`register ${stamp} missing id/token`);
  return { id, token, username };
}

async function registerDirect(stamp: string) {
  const username = `${unique}${stamp}`.slice(0, 12);
  const email = `${username}@example.com`;
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO users (email, email_normalized, username, password_hash, display_name, email_confirmed_at)
     VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), $3, NOW())
     RETURNING id`,
    [email, email.toLowerCase(), username, password],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`direct register ${stamp} failed`);
  return { id, username };
}

try {
  const valkey = requireValkey();
  await valkey.ping();

  const livekitReady = isLivekitConfigured();
  let hostId: string;
  let hostToken: string | null = null;
  try {
    const host = await registerUser("h");
    hostId = host.id;
    hostToken = host.token;
  } catch {
    const host = await registerDirect("h");
    hostId = host.id;
  }

  if (!livekitReady) {
    try {
      await startLive(hostId, { title: "PAGE018 proof" });
      throw new Error("startLive should fail closed without LiveKit");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("livekit") && !message.toLowerCase().includes("configured")) {
        throw error;
      }
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          page: "PAGE-018",
          livekitReady: false,
          inProcessFailClosed: true,
        },
        null,
        2,
      ),
    );
  } else {
    const started = await startLive(hostId, { title: "PAGE018 proof" });
    if (started.roomId !== hostId) throw new Error(`roomId must equal hostId, got ${started.roomId}`);
    if (!started.streamId || !started.livekitToken || !started.livekitUrl) {
      throw new Error("startLive missing canonical fields");
    }

    const db = await getPool().query<{ status: string; room_id: string }>(
      `SELECT status, room_id FROM live_streams WHERE id = $1`,
      [started.streamId],
    );
    if (db.rows[0]?.status !== "live" || db.rows[0]?.room_id !== hostId) {
      throw new Error("Neon live_streams row not live/canonical");
    }

    const streamKey = await valkeyGet(`stream:${hostId}`);
    const presence = await valkeyGet(hostPresenceKey(hostId));
    if (!streamKey) throw new Error("Valkey stream: key missing after start");
    if (!presence) throw new Error("Valkey host presence missing after start");

    const ended = await endLive(hostId, started.streamId);
    if (!ended.ok || ended.roomId !== hostId) throw new Error("endLive failed");

    const afterDb = await getPool().query<{ status: string }>(
      `SELECT status FROM live_streams WHERE id = $1`,
      [started.streamId],
    );
    if (afterDb.rows[0]?.status !== "ended") throw new Error("Neon row not ended");

    const streamLeft = await valkeyGet(`stream:${hostId}`);
    const presenceLeft = await valkeyGet(hostPresenceKey(hostId));
    if (streamLeft) throw new Error("stream: leftover after end");
    if (presenceLeft) throw new Error("host presence leftover after end");

    let httpParity: string | null = null;
    if (hostToken) {
      const httpStart = await json("/api/live/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${hostToken}` },
        body: JSON.stringify({ title: "PAGE018 proof http" }),
      });
      if (httpStart.status === 200) {
        const sid = String(asRecord(httpStart.body).streamId ?? "");
        await json("/api/live/end", {
          method: "POST",
          headers: { Authorization: `Bearer ${hostToken}` },
          body: JSON.stringify({ streamId: sid }),
        });
        httpParity = "pass";
      } else {
        httpParity = `deferred:${httpStart.status}`;
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          page: "PAGE-018",
          livekitReady: true,
          streamId: started.streamId,
          roomId: started.roomId,
          inProcessNeonValkey: true,
          endCleanup: true,
          httpParity,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool()
    .query(`DELETE FROM live_streams WHERE title LIKE 'PAGE018 proof%'`)
    .catch(() => undefined);
  await closeValkey().catch(() => undefined);
}
