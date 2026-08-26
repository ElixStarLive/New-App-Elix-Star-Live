/**
 * PAGE-017 runtime proof — Live Discover authoritative list against NEW Neon + Valkey.
 * Run: npx tsx scripts/_page017_live_discover_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so stream:{roomId} + live:host:{roomId} stay honest.
 *
 * In-process queryLiveStreams proves Valkey fail-closed eligibility (even if a long-running
 * API process has not yet restarted onto the latest query.ts).
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey, valkeyDel, valkeySet } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { markHostStarting, clearHostPresence, hostPresenceKey } = await import(
  "../server/modules/live/hostGrace.ts"
);
const { queryLiveStreams } = await import("../server/modules/live/query.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p17${Date.now().toString(36)}`;
const STREAM_TTL_MS = 8 * 60 * 60 * 1000;
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

async function register(stamp: string) {
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

async function seedRuntime(roomId: string, hostId: string, streamId: string) {
  await valkeySet(`stream:${roomId}`, JSON.stringify({ userId: hostId, streamId }), STREAM_TTL_MS);
  await markHostStarting(roomId);
}

async function clearRuntime(roomId: string) {
  await valkeyDel(`stream:${roomId}`);
  await clearHostPresence(roomId);
}

try {
  const valkey = requireValkey();
  await valkey.ping();

  const creator = await register("a");
  const spectator = await register("b");
  const staleUser = await register("s");

  const live = await getPool().query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title, status, started_at)
     VALUES ($1, $2, 'PAGE017 proof', 'live', NOW()) RETURNING id`,
    [creator.id, creator.id],
  );
  const streamId = live.rows[0]?.id;
  if (!streamId) throw new Error("insert live failed");

  const stale = await getPool().query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title, status, started_at)
     VALUES ($1, $2, 'PAGE017 stale-db', 'live', NOW()) RETURNING id`,
    [staleUser.id, staleUser.id],
  );
  const staleId = stale.rows[0]?.id;
  if (!staleId) throw new Error("insert stale failed");

  await seedRuntime(creator.id, creator.id, streamId);
  // staleUser intentionally has no stream: / host presence.

  const inProcess = await queryLiveStreams(spectator.id);
  const inMatch = inProcess.filter((row) => row.roomId === creator.id);
  if (inMatch.length !== 1) throw new Error(`in-process expected one creator card, got ${inMatch.length}`);
  if (inMatch[0]?.streamId !== streamId) throw new Error("in-process streamId mismatch");
  if (inProcess.some((row) => row.streamId === staleId)) {
    throw new Error("in-process listed stale DB row without Valkey runtime");
  }

  const listed = await json("/api/live/streams", {
    headers: { Authorization: `Bearer ${spectator.token}` },
  });
  if (listed.status !== 200) throw new Error(`list ${listed.status}`);
  const streams = Array.isArray(asRecord(listed.body).streams)
    ? (asRecord(listed.body).streams as Array<Record<string, unknown>>)
    : [];
  const match = streams.filter((row) => row.roomId === creator.id);
  if (match.length !== 1) throw new Error(`HTTP expected exactly one creator card, got ${match.length}`);
  if (match[0]?.streamId !== streamId) throw new Error("HTTP streamId mismatch");

  await getPool().query(
    `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [spectator.id, creator.id],
  );
  const blockedInProcess = await queryLiveStreams(spectator.id);
  if (blockedInProcess.some((row) => row.roomId === creator.id)) {
    throw new Error("blocked creator still listed in-process");
  }
  const blockedList = await json("/api/live/streams", {
    headers: { Authorization: `Bearer ${spectator.token}` },
  });
  const blockedStreams = Array.isArray(asRecord(blockedList.body).streams)
    ? (asRecord(blockedList.body).streams as Array<Record<string, unknown>>)
    : [];
  if (blockedStreams.some((row) => row.roomId === creator.id)) {
    throw new Error("blocked creator still listed over HTTP");
  }

  await getPool().query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    spectator.id,
    creator.id,
  ]);

  await getPool().query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE id = $1`,
    [streamId],
  );
  await clearRuntime(creator.id);

  const afterInProcess = await queryLiveStreams(spectator.id);
  if (afterInProcess.some((row) => row.streamId === streamId || row.roomId === creator.id)) {
    throw new Error("ended live still listed in-process");
  }

  const afterEnd = await json("/api/live/streams", {
    headers: { Authorization: `Bearer ${spectator.token}` },
  });
  const afterStreams = Array.isArray(asRecord(afterEnd.body).streams)
    ? (asRecord(afterEnd.body).streams as Array<Record<string, unknown>>)
    : [];
  if (afterStreams.some((row) => row.streamId === streamId || row.roomId === creator.id)) {
    throw new Error("ended live still listed over HTTP");
  }

  const presenceLeft = await valkey.get(hostPresenceKey(creator.id));
  const streamLeft = await valkey.get(`stream:${creator.id}`);
  if (presenceLeft) throw new Error("host presence leftover after end");
  if (streamLeft) throw new Error("stream: leftover after end");

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-017",
        streamId,
        roomId: creator.id,
        inProcessListedOnce: true,
        inProcessStaleExcluded: true,
        httpListedOnce: true,
        blockFiltered: true,
        endedCleared: true,
        valkeyClean: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool()
    .query(`DELETE FROM live_streams WHERE title LIKE 'PAGE017%'`)
    .catch(() => undefined);
  await closeValkey().catch(() => undefined);
}
