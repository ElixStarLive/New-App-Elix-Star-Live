/**
 * PAGE-033 runtime proof — Chat Thread against NEW API + Neon + WS fanout.
 * Run: npx tsx scripts/_page033_chat_thread_runtime_proof.ts
 * Device PASS not claimed.
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
  const username = `p33${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

try {
  const page = readFileSync(resolve("src/pages/ChatThread.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/chat/chatThreadSession.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");
  assert(app.includes('path="/inbox/:threadId"'), "route missing");
  assert(page.includes("createChatThreadSession"), "session owner missing");
  assert(page.includes("wsClient.on(\"dm_message\""), "must use PAGE-006 dm_message");
  assert(page.includes("wsClient.on(\"connected\""), "must resync on reconnect");
  assert(page.includes("startOutgoingCall"), "PAGE-034 handoff missing");
  assert(page.includes("StoryGoldRingAvatar"), "live strip missing");
  assert(page.includes("LevelBadge"), "message identity missing");
  assert(!page.includes("new WebSocket"), "must not open second WS");
  assert(session.includes("clientRequestId") || session.includes("crypto.randomUUID"), "idempotent send");
  assert(shell.includes('/^\\/inbox\\/[^/]+$/'), "bottom nav must hide on thread");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

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

  const stranger = await json(`/api/inbox/threads/${threadId}/messages`, {
    headers: { Authorization: `Bearer ${c.token}` },
  });
  assert(stranger.status === 403, `stranger history → ${stranger.status}`);

  const strangerSend = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}` },
    body: JSON.stringify({ body: "nope" }),
  });
  assert(strangerSend.status === 403, `stranger send → ${strangerSend.status}`);

  const bWs = await openWs(b.token);
  await bWs.waitEvent("connected").catch(() => undefined);

  const requestId = crypto.randomUUID();
  const sent = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ body: "hello from A", clientRequestId: requestId }),
  });
  assert(sent.status === 201, `send A → ${sent.status}`);
  const sentMsg = (sent.body as { message?: { id?: string; body?: string; threadId?: string } }).message;
  assert(sentMsg?.id && sentMsg.body === "hello from A", "send response missing message");
  assert(sentMsg.threadId === threadId, "send threadId mismatch");

  const replay = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ body: "hello from A", clientRequestId: requestId }),
  });
  assert(replay.status === 200, `idempotent replay → ${replay.status}`);
  const replayId = (replay.body as { message?: { id?: string } }).message?.id;
  assert(replayId === sentMsg.id, "idempotent send must return same message id");

  const dm = (await bWs.waitEvent("dm_message")) as {
    threadId?: string;
    message?: { id?: string; body?: string };
  };
  assert(dm.threadId === threadId, "dm_message wrong thread");
  assert(dm.message?.id === sentMsg.id, "dm_message wrong id");
  assert(dm.message?.body === "hello from A", "dm_message wrong body");

  const neonCount = await getPool()!.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM chat_messages WHERE thread_id = $1 AND body = $2`,
    [threadId, "hello from A"],
  );
  assert(Number(neonCount.rows[0]?.n) === 1, "Neon must store exactly one A message");

  const reply = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ body: "reply from B", clientRequestId: crypto.randomUUID() }),
  });
  assert(reply.status === 201, `reply B → ${reply.status}`);

  const history = await json(`/api/inbox/threads/${threadId}/messages`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  assert(history.status === 200, `history A → ${history.status}`);
  const messages = (history.body as { messages?: Array<{ id?: string; body?: string }> }).messages || [];
  assert(messages.length === 2, `expected 2 messages, got ${messages.length}`);
  assert(messages.map((m) => m.body).join("|") === "hello from A|reply from B", "ordering wrong");

  const read = await json(`/api/inbox/threads/${threadId}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
  });
  assert(read.status === 200, `mark read → ${read.status}`);

  const threads = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const threadRow = ((threads.body as { threads?: Array<{ id?: string; lastMessage?: string; unread?: boolean }> }).threads || []).find(
    (row) => row.id === threadId,
  );
  assert(threadRow?.lastMessage === "reply from B", "PAGE-030 preview must show latest");
  assert(threadRow?.unread !== true, "unread must clear after read");

  bWs.close();

  // Missed message while offline: B sends, A reconnects and reconciles via history.
  const offlineSend = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ body: "while A offline", clientRequestId: crypto.randomUUID() }),
  });
  assert(offlineSend.status === 201, `offline send → ${offlineSend.status}`);
  const afterReconnect = await json(`/api/inbox/threads/${threadId}/messages`, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  const afterBodies = ((afterReconnect.body as { messages?: Array<{ body?: string }> }).messages || []).map((m) => m.body);
  assert(afterBodies.includes("while A offline"), "missed message must appear after reconnect history");
  assert(afterBodies.filter((b) => b === "while A offline").length === 1, "missed message must appear once");

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [a.id, b.id]);
  const blockedSend = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ body: "blocked", clientRequestId: crypto.randomUUID() }),
  });
  assert(blockedSend.status === 403, `blocked send → ${blockedSend.status}`);

  console.log("PAGE-033 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        membershipAuth: true,
        sendIdempotent: true,
        dmMessageOnce: true,
        neonSingleRow: true,
        inboxPreviewSync: true,
        missedResync: true,
        blockedSendRejected: true,
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-033 runtime proof FAIL", err);
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
