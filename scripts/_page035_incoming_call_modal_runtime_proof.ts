/**
 * PAGE-035 runtime proof — Incoming Call Modal signalling + handoff contracts.
 * Run: npx tsx scripts/_page035_incoming_call_modal_runtime_proof.ts
 * Device / physical ringtone PASS not claimed from this script alone.
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
  const username = `p35${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const modal = readFileSync(resolve("src/components/IncomingCallModal.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/calls/videoCallSession.ts"), "utf8");
  const page034 = readFileSync(resolve("src/pages/VideoCall.tsx"), "utf8");
  const signaling = readFileSync(resolve("server/modules/calls/signaling.ts"), "utf8");

  assert((app.match(/<IncomingCallModal \/>/g) || []).length === 1, "exactly one global modal");
  assert(app.includes("bindVideoCallSignals"), "PAGE-006 bind missing");
  assert(modal.includes("acceptIncomingCall") && modal.includes("rejectIncomingCall"), "modal actions");
  assert(modal.includes("Incoming video call..."), "OLD copy missing");
  assert(modal.includes("bg-[#22C55E]") && modal.includes("bg-[#EF4444]"), "Accept/Decline colors");
  assert(modal.includes("username[0]?.toUpperCase()"), "avatar letter fallback");
  assert(modal.includes('pathname === "/call"'), "hide on PAGE-034");
  assert(!modal.includes("LiveKitSession") && !modal.includes("getUserMedia") && !modal.includes("new WebSocket"), "no media/socket in modal");
  assert(!page034.includes("IncomingCallModal"), "PAGE-034 must not own modal");
  assert(session.includes('wsClient.send("call_accepted"'), "accept owner");
  assert(session.includes('wsClient.send("call_rejected"'), "decline owner");
  assert(signaling.includes("isBlockedEitherWay") && signaling.includes("call_accepted"), "accept block gate");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const a = await register("a");
  const b = await register("b");

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

  // 1) Invite identity for modal
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const inviteA = (await aWs.waitEvent("call_invite")) as {
    callId?: string;
    callerId?: string;
    callerUsername?: string;
    threadId?: string;
    roomName?: string;
  };
  const inviteB = (await bWs.waitEvent("call_invite")) as {
    callId?: string;
    callerId?: string;
    callerUsername?: string;
    threadId?: string;
  };
  assert(inviteA.callId === inviteB.callId, "invite callId sync");
  assert(inviteB.callerId === a.id, "callee invite callerId");
  assert(inviteB.callerUsername === a.username, `caller username ${inviteB.callerUsername}`);
  assert(inviteB.threadId === threadId, "thread context");
  assert(String(inviteA.roomName || "").startsWith("call_"), "call_* room");
  const callId = inviteA.callId!;

  // 2) Decline — callee stays off LiveKit
  sendEvent(bWs.ws, "call_rejected", { callId });
  const declined = (await aWs.waitEvent("call_rejected")) as { reason?: string; callId?: string };
  assert(declined.reason === "declined", `decline reason ${declined.reason}`);
  assert(declined.callId === callId, "decline callId");
  const declinedToken = await json(`/api/calls/${callId}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${b.token}` },
  });
  assert(declinedToken.status === 403 || declinedToken.status === 404, `decline token ${declinedToken.status}`);

  // 3) Accept handoff → both receive call_accepted (PAGE-034 owns media)
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const invite2 = (await aWs.waitEvent("call_invite")) as { callId?: string; roomName?: string };
  const invite2b = (await bWs.waitEvent("call_invite")) as { callId?: string };
  assert(invite2.callId === invite2b.callId, "second invite sync");
  const callId2 = invite2.callId!;
  sendEvent(bWs.ws, "call_accepted", { callId: callId2 });
  const acceptedA = (await aWs.waitEvent("call_accepted")) as { callId?: string; roomName?: string };
  const acceptedB = (await bWs.waitEvent("call_accepted")) as { callId?: string; roomName?: string };
  assert(acceptedA.callId === callId2 && acceptedB.callId === callId2, "accept fanout");
  assert(acceptedA.roomName === invite2.roomName && acceptedB.roomName === invite2.roomName, "accept room");
  sendEvent(bWs.ws, "call_ended", { callId: callId2 });
  await aWs.waitEvent("call_ended");

  // 4) Caller cancels before answer → callee gets call_ended (modal must clear)
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const invite3 = (await aWs.waitEvent("call_invite")) as { callId?: string };
  await bWs.waitEvent("call_invite");
  const callId3 = invite3.callId!;
  sendEvent(aWs.ws, "call_ended", { callId: callId3 });
  const endedB = (await bWs.waitEvent("call_ended")) as { callId?: string };
  assert(endedB.callId === callId3, "caller-cancel ended for callee");
  sendEvent(bWs.ws, "call_accepted", { callId: callId3 });
  const staleAccept = await Promise.race([
    bWs.waitEvent("call_accepted", 1200).then(() => "accepted").catch(() => "none"),
    aWs.waitEvent("call_accepted", 1200).then(() => "accepted").catch(() => "none"),
  ]);
  assert(staleAccept === "none", "stale accept must not fanout");
  const staleRow = await getPool()!.query<{ status: string }>(`SELECT status FROM calls WHERE id = $1`, [callId3]);
  assert(staleRow.rows[0]?.status === "ended", "stale call remains ended");

  // 5) Block during ring → accept becomes call_rejected reason=blocked
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const invite4 = (await aWs.waitEvent("call_invite")) as { callId?: string };
  await bWs.waitEvent("call_invite");
  const callId4 = invite4.callId!;
  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    b.id,
    a.id,
  ]);
  sendEvent(bWs.ws, "call_accepted", { callId: callId4 });
  const blockedA = (await aWs.waitEvent("call_rejected")) as { reason?: string; callId?: string };
  const blockedB = (await bWs.waitEvent("call_rejected")) as { reason?: string; callId?: string };
  assert(blockedA.reason === "blocked" && blockedB.reason === "blocked", "block-during-ring");
  assert(blockedA.callId === callId4 && blockedB.callId === callId4, "blocked callId");
  const blockedRow = await getPool()!.query<{ status: string }>(`SELECT status FROM calls WHERE id = $1`, [callId4]);
  assert(blockedRow.rows[0]?.status === "rejected", "blocked accept must reject Neon row");

  // 6) Fresh invite while blocked → no modal opportunity (caller rejected immediately)
  sendEvent(aWs.ws, "call_invite", { calleeId: b.id, threadId });
  const blockedInvite = (await aWs.waitEvent("call_rejected")) as { reason?: string };
  assert(blockedInvite.reason === "blocked", "blocked invite");
  const noInviteB = await bWs.waitEvent("call_invite", 1000).then(() => "invite").catch(() => "none");
  assert(noInviteB === "none", "blocked invite must not reach callee modal");

  aWs.close();
  bWs.close();

  console.log("PAGE-035 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        globalModalOwner: true,
        inviteIdentity: true,
        decline: true,
        acceptHandoff: true,
        callerCancel: true,
        staleAcceptRejected: true,
        blockDuringRing: true,
        blockedInviteNoModal: true,
        noLiveKitInModal: true,
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-035 runtime proof FAIL", err);
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
