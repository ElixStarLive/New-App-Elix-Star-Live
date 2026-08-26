/**
 * PAGE-034 runtime proof — Video Call WS signalling + Neon calls + token auth.
 * Run: npx tsx scripts/_page034_video_call_runtime_proof.ts
 * Device / LiveKit media PASS not claimed (token mint may be 503 without LiveKit).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const wsBase = base.replace(/^http/, "ws");

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
  const username = `p34${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

function openWs(token: string): Promise<{
  ws: WebSocket;
  waitEvent: (type: string, timeoutMs?: number) => Promise<unknown>;
  close: () => void;
}> {
  return new Promise((resolveOpen, reject) => {
    const ws = new WebSocket(`${wsBase}/live/__feed__?token=${encodeURIComponent(token)}`);
    const waiters = new Map<string, Array<(payload: unknown) => void>>();
    const queue = new Map<string, unknown[]>();

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const type = String((parsed as { event?: unknown }).event || "");
      const data = (parsed as { data?: unknown }).data;
      const pending = waiters.get(type);
      if (pending && pending.length > 0) {
        pending.shift()!(data);
        return;
      }
      const list = queue.get(type) || [];
      list.push(data);
      queue.set(type, list);
    });

    ws.on("open", () => {
      resolveOpen({
        ws,
        waitEvent(type: string, timeoutMs = 8000) {
          const queued = queue.get(type);
          if (queued && queued.length > 0) return Promise.resolve(queued.shift());
          return new Promise((resolveEvent, rejectEvent) => {
            const timer = setTimeout(() => rejectEvent(new Error(`timeout waiting ${type}`)), timeoutMs);
            const list = waiters.get(type) || [];
            list.push((payload) => {
              clearTimeout(timer);
              resolveEvent(payload);
            });
            waiters.set(type, list);
          });
        },
        close() {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
      });
    });
    ws.on("error", reject);
  });
}

function sendEvent(ws: WebSocket, event: string, data: Record<string, unknown>) {
  ws.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
}

try {
  const page = readFileSync(resolve("src/pages/VideoCall.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/calls/videoCallSession.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const signaling = readFileSync(resolve("server/modules/calls/signaling.ts"), "utf8");
  assert(app.includes('path="/call"'), "route missing");
  assert(app.includes("bindVideoCallSignals"), "PAGE-006 signal bind missing");
  assert(app.includes("isolateVideoCallAccount"), "account-switch cleanup missing");
  assert(page.includes("apiFetchCallToken"), "LiveKit token owner missing");
  assert(page.includes("LiveKitSession"), "LiveKit session missing");
  assert(page.includes("app:back-button"), "hardware back must end call");
  assert(page.includes("absolute top-20 right-4 w-28 h-40"), "PiP placement missing");
  assert(page.includes("bg-[#EF4444]"), "red End missing");
  assert(page.includes('status === "incoming"'), "Accept must be incoming-only");
  assert(!page.includes("/api/calls/start"), "no REST start");
  assert(!page.includes("new WebSocket"), "no second WS");
  assert(session.includes('wsClient.send("call_invite"'), "WS invite owner missing");
  assert(signaling.includes('reason: "blocked"'), "blocked reject missing");
  assert(signaling.includes("`call_${callId}`") || signaling.includes("call_${callId}"), "call_* room missing");
  assert(nav.includes('path === "/call"'), "named exit for /call missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const noStart = await json("/api/calls/start", {
    method: "POST",
    body: JSON.stringify({ userId: crypto.randomUUID() }),
  });
  assert(noStart.status === 404, `REST start must not exist → ${noStart.status}`);

  const a = await register("a");
  const b = await register("b");
  const c = await register("c");

  const ensure = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ userId: b.id }),
  });
  assert(ensure.status === 200 || ensure.status === 201, `ensure thread → ${ensure.status}`);
  const threadId = String((ensure.body as { id?: string })?.id || "");
  assert(Boolean(threadId), "missing thread id");

  const aWs = await openWs(a.token);
  const bWs = await openWs(b.token);
  await aWs.waitEvent("connected").catch(() => undefined);
  await bWs.waitEvent("connected").catch(() => undefined);

  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const inviteA = (await aWs.waitEvent("call_invite")) as {
    callId?: string;
    roomName?: string;
    callerId?: string;
    threadId?: string;
  };
  const inviteB = (await bWs.waitEvent("call_invite")) as { callId?: string; roomName?: string };
  assert(inviteA.callId && inviteA.callId === inviteB.callId, "invite callId mismatch");
  assert(inviteA.callerId === a.id, "invite caller mismatch");
  assert(inviteA.threadId === threadId, "invite thread mismatch");
  assert(String(inviteA.roomName || "").startsWith("call_"), `room ${inviteA.roomName}`);
  const callId = inviteA.callId!;

  const neonCall = await getPool()!.query<{ room_name: string; status: string }>(
    `SELECT room_name, status FROM calls WHERE id = $1`,
    [callId],
  );
  assert(neonCall.rows[0]?.status === "ringing", "Neon call must be ringing");
  assert(neonCall.rows[0]?.room_name === inviteA.roomName, "Neon room mismatch");

  const strangerToken = await json(`/api/calls/${callId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}` },
  });
  assert(strangerToken.status === 403, `stranger token → ${strangerToken.status}`);

  sendEvent(bWs.ws, "call_accepted", { callId });
  const acceptedA = (await aWs.waitEvent("call_accepted")) as {
    callId?: string;
    roomName?: string;
  };
  assert(acceptedA.callId === callId, "accept callId");
  assert(acceptedA.roomName === inviteA.roomName, "accept room");

  const afterAccept = await getPool()!.query<{ status: string }>(`SELECT status FROM calls WHERE id = $1`, [callId]);
  assert(afterAccept.rows[0]?.status === "active", "Neon must be active after accept");

  const tokenA = await json(`/api/calls/${callId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const tokenB = await json(`/api/calls/${callId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
  });
  // LiveKit may be unavailable in some environments — treat 503 as environment block, not contract fail.
  if (tokenA.status === 200 && tokenB.status === 200) {
    const bodyA = tokenA.body as { roomName?: string; token?: string; url?: string };
    const bodyB = tokenB.body as { roomName?: string; token?: string; url?: string };
    assert(bodyA.roomName === inviteA.roomName && bodyB.roomName === inviteA.roomName, "token room mismatch");
    assert(Boolean(bodyA.token && bodyB.token && bodyA.url && bodyB.url), "token/url missing");
  } else {
    assert(
      (tokenA.status === 503 || tokenA.status === 200) && (tokenB.status === 503 || tokenB.status === 200),
      `token statuses A=${tokenA.status} B=${tokenB.status}`,
    );
  }

  sendEvent(bWs.ws, "call_ended", { callId });
  const endedA = (await aWs.waitEvent("call_ended")) as { callId?: string };
  assert(endedA.callId === callId, "ended callId");
  const afterEnd = await getPool()!.query<{ status: string }>(`SELECT status FROM calls WHERE id = $1`, [callId]);
  assert(afterEnd.rows[0]?.status === "ended", "Neon must be ended");

  // Decline path
  const ensure2 = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ userId: b.id }),
  });
  const thread2 = String((ensure2.body as { id?: string })?.id || threadId);
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId: thread2 });
  const invite2 = (await aWs.waitEvent("call_invite")) as { callId?: string };
  const invite2b = (await bWs.waitEvent("call_invite")) as { callId?: string };
  assert(invite2.callId === invite2b.callId, "second invite sync");
  sendEvent(bWs.ws, "call_rejected", { callId: invite2.callId });
  const rejected = (await aWs.waitEvent("call_rejected")) as { reason?: string; callId?: string };
  assert(rejected.reason === "declined", `reject reason ${rejected.reason}`);

  // Blocked
  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    b.id,
    a.id,
  ]);
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId: thread2 });
  const blocked = (await aWs.waitEvent("call_rejected")) as { reason?: string };
  assert(blocked.reason === "blocked", `blocked reason ${blocked.reason}`);

  const liveStreams = await getPool()!.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM live_streams WHERE room_id LIKE 'call_%'`,
  );
  assert(Number(liveStreams.rows[0]?.n) === 0, "call rooms must not use live_streams");

  aWs.close();
  bWs.close();

  console.log("PAGE-034 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        noRestStart: true,
        inviteFanout: true,
        acceptFanout: true,
        endFanout: true,
        decline: true,
        blocked: true,
        strangerTokenRejected: true,
        neonCallRows: true,
        livekitToken: tokenA.status === 200 && tokenB.status === 200 ? "PASS" : "ENVIRONMENT_503",
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-034 runtime proof FAIL", err);
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
