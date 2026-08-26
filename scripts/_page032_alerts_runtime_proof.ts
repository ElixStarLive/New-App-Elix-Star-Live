/**
 * PAGE-032 runtime proof — Alerts against NEW API + Neon.
 * Run: npx tsx scripts/_page032_alerts_runtime_proof.ts
 * Device PASS not claimed.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const {
  notifyFollowersLiveStarted,
  deleteLiveStartedNotificationsForRoom,
} = await import("../server/modules/notifications/liveStarted.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function accessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const session = (body as { session?: { access_token?: unknown } }).session;
  if (!session || typeof session !== "object") return "";
  return typeof session.access_token === "string" ? session.access_token : "";
}

async function register(stamp: string) {
  const username = `p32${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const password = "password12";
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
  assert(registered.status === 201, `register ${username} → ${registered.status}`);
  const id = String((registered.body as { user?: { id?: string } })?.user?.id ?? "");
  assert(Boolean(id), "register missing user id");
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username };
}

try {
  const page = readFileSync(resolve("src/pages/alerts/AlertsPage.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/alerts/alertsSession.ts"), "utf8");
  const start = readFileSync(resolve("server/modules/live/start.ts"), "utf8");
  assert(page.includes('path="/alerts"') === false, "page must not redefine route");
  assert(page.includes("apiLiveStatus"), "Alerts tap must gate live with apiLiveStatus");
  assert(page.includes("wsClient.on(\"stream_ended\""), "Alerts must use PAGE-006 stream_ended");
  assert(!page.includes("new WebSocket"), "Alerts must not open a second WS");
  assert(!page.includes("device-tokens"), "PAGE-043 owns push tokens");
  assert(session.includes("apiMarkAlertsRead"), "mark-read on load");
  assert(!session.includes("localStorage"), "no localStorage unread authority");
  assert(start.includes("notifyFollowersLiveStarted"), "go-live must write live_started");
  assert(start.includes("deleteLiveStartedNotificationsForRoom"), "endLive must prune live_started");

  const health = await fetch(`${base}/api/health`).catch(() => null);
  assert(health?.ok === true, `API not reachable at ${base}`);

  const unauth = await fetch(`${base}/api/notifications`);
  assert(unauth.status === 401, `unauth notifications → ${unauth.status}`);

  const host = await register("h");
  const follower = await register("f");
  const other = await register("o");

  await getPool()!.query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)`, [
    follower.id,
    host.id,
  ]);
  await getPool()!.query(
    `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'LIVE', 'live')`,
    [host.id, host.id],
  );

  const written = await notifyFollowersLiveStarted({
    hostId: host.id,
    roomId: host.id,
    hostLabel: host.username,
    hostAvatar: null,
  });
  assert(written === 1, `expected 1 live_started, got ${written}`);

  // Idempotent second fanout must replace, not duplicate for the follower.
  const writtenAgain = await notifyFollowersLiveStarted({
    hostId: host.id,
    roomId: host.id,
    hostLabel: host.username,
    hostAvatar: null,
  });
  assert(writtenAgain === 1, `second fanout expected 1, got ${writtenAgain}`);

  const listed = await json("/api/notifications", {
    headers: { Authorization: `Bearer ${follower.token}` },
  });
  assert(listed.status === 200, `list alerts → ${listed.status}`);
  const body = listed.body as {
    total?: number;
    unreadIds?: string[];
    items?: Array<{ id?: string; kind?: string; title?: string; actionUrl?: string | null }>;
  };
  assert(body.total === 1, `follower total ${body.total}`);
  assert(body.items?.length === 1, "exactly one alert row");
  assert(body.items?.[0]?.kind === "live_started", "kind live_started");
  assert(body.items?.[0]?.actionUrl === `/watch/${host.id}`, `actionUrl ${body.items?.[0]?.actionUrl}`);
  assert(String(body.items?.[0]?.title || "").includes("is live"), "title must name live");
  assert((body.unreadIds || []).length === 1, "one unread");

  const otherList = await json("/api/notifications", {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  const otherBody = otherList.body as { total?: number; items?: unknown[] };
  assert(otherBody.total === 0 && (otherBody.items || []).length === 0, "other account isolation");

  const hostList = await json("/api/notifications", {
    headers: { Authorization: `Bearer ${host.token}` },
  });
  const hostBody = hostList.body as { total?: number };
  assert(hostBody.total === 0, "host must not see own follower alerts");

  const unreadId = body.unreadIds![0]!;
  const read = await json("/api/notifications/read", {
    method: "POST",
    headers: { Authorization: `Bearer ${follower.token}` },
    body: JSON.stringify({ ids: [unreadId] }),
  });
  assert(read.status === 200, `mark read → ${read.status}`);
  const unreadCount = await getPool()!.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id = $1 AND id = $2 AND read_at IS NULL`,
    [follower.id, unreadId],
  );
  assert(Number(unreadCount.rows[0]?.n) === 0, "Neon read_at must persist");

  await deleteLiveStartedNotificationsForRoom(host.id, host.id);
  await getPool()!.query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE host_id = $1 AND status = 'live'`,
    [host.id],
  );
  const afterEnd = await json("/api/notifications", {
    headers: { Authorization: `Bearer ${follower.token}` },
  });
  const afterBody = afterEnd.body as { total?: number; items?: unknown[] };
  assert(afterBody.total === 0 && (afterBody.items || []).length === 0, "ended live must not remain in Alerts");

  await getPool()!.query(
    `INSERT INTO notifications (user_id, kind, payload) VALUES ($1, 'system', $2::jsonb)`,
    [follower.id, JSON.stringify({ title: "System notice", body: "Hello alerts" })],
  );
  const withSystem = await json("/api/notifications", {
    headers: { Authorization: `Bearer ${follower.token}` },
  });
  const sysBody = withSystem.body as { items?: Array<{ kind?: string; title?: string }> };
  assert(sysBody.items?.some((r) => r.kind === "system" && r.title === "System notice"), "system alert visible");

  console.log("PAGE-032 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        followerAlertOnce: true,
        markReadNeon: true,
        endedLivePruned: true,
        accountIsolation: true,
        systemAlert: true,
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-032 runtime proof FAIL", err);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool()?.end();
  } catch {
    /* ignore */
  }
}
