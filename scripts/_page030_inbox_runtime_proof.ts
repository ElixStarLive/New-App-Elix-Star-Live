/**
 * PAGE-030 runtime proof — Inbox against NEW API + Neon.
 * Run: npx tsx scripts/_page030_inbox_runtime_proof.ts
 * Device PASS not claimed.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

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
  const username = `p30${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  return { id, token, username, email, password };
}

try {
  const page = readFileSync(resolve("src/pages/Inbox.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/inbox/inboxSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/inbox/inboxApi.ts"), "utf8");
  const chatApi = readFileSync(resolve("src/features/chat/chatApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const liveShare = readFileSync(resolve("server/modules/inbox/liveShare.ts"), "utf8");
  const clientRoutes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");

  assert(app.includes('path="/inbox" element={<Inbox />}'), "route missing");
  assert(page.includes("Main") && page.includes("Unread") && page.includes("Requests"), "filters missing");
  assert(page.includes("New followers") && page.includes("Gift received") && page.includes("Alerts"), "hubs missing");
  assert(page.includes("dm_thread_updated"), "must listen to dm_thread_updated");
  assert(!page.includes('wsClient.on("dm_message"'), "Inbox list must not own dm_message");
  assert(!page.includes("elix_inbox_deleted"), "no local tombstones");
  assert(page.includes("apiLiveStatus"), "live-share must check active status");
  assert(session.includes("apiDeleteChatThread"), "server delete owner missing");
  assert(session.includes("viewerChanged"), "account-switch clear missing");
  assert(api.includes("/api/activity"), "activity API missing");
  assert(api.includes("/api/live-share"), "live-share POST client missing");
  assert(chatApi.includes("/api/inbox/threads"), "threads API missing");
  assert(chatApi.includes('=== "user"'), "stub username filter missing");
  assert(liveShare.includes("upsertLiveShareInbox"), "live share write missing");
  assert(clientRoutes.includes('post("/live-share"'), "POST /api/live-share mount missing");
  assert(!clientRoutes.includes("/api/chat"), "no dual chat mount in client routes");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const accountA = await register("a");
  const accountB = await register("b");
  const accountC = await register("c");

  const opened = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ userId: accountB.id }),
  });
  assert(opened.status === 200 || opened.status === 201, `open thread ${opened.status}`);
  const threadId = String((opened.body as { id?: string })?.id ?? "");
  assert(Boolean(threadId), "thread id missing");

  const sent = await json(`/api/inbox/threads/${threadId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: JSON.stringify({ body: "hello inbox runtime" }),
  });
  assert(sent.status === 201, `send ${sent.status}`);

  const listA = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(listA.status === 200, `A threads ${listA.status}`);
  const threadsA = ((listA.body as { threads?: Array<{ id?: string; unread?: boolean; lastMessage?: string }> }).threads ??
    []) as Array<{ id?: string; unread?: boolean; lastMessage?: string; otherUsername?: string }>;
  assert(threadsA[0]?.id === threadId, "thread not first");
  assert(threadsA[0]?.unread === true, "unread missing");
  assert(threadsA[0]?.lastMessage === "hello inbox runtime", "preview mismatch");
  assert(!threadsA.some((row) => (row.otherUsername || "").toLowerCase() === "user"), "fabricated username");

  const read = await json(`/api/inbox/threads/${threadId}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(read.status === 200, `read ${read.status}`);
  const listRead = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  const afterRead = ((listRead.body as { threads?: Array<{ id?: string; unread?: boolean }> }).threads ?? []).find(
    (row) => row.id === threadId,
  );
  assert(afterRead?.unread === false, "unread did not clear");

  const deleted = await json(`/api/inbox/threads/${threadId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(deleted.status === 200, `delete ${deleted.status}`);
  const afterDelete = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(
    !(((afterDelete.body as { threads?: Array<{ id?: string }> }).threads ?? []) as Array<{ id?: string }>).some(
      (row) => row.id === threadId,
    ),
    "deleted thread still listed",
  );
  const reload = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(
    !(((reload.body as { threads?: Array<{ id?: string }> }).threads ?? []) as Array<{ id?: string }>).some(
      (row) => row.id === threadId,
    ),
    "deleted thread returned after reload — tombstone risk",
  );

  const video = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p30.mp4', 'clip', 'public') RETURNING id`,
    [accountA.id],
  );
  const videoId = video.rows[0].id;
  await getPool()!.query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    accountB.id,
    videoId,
  ]);
  const activity = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(activity.status === 200, `activity ${activity.status}`);
  const items = ((activity.body as { items?: Array<{ kind?: string; actorUsername?: string; actorUserId?: string }> })
    .items ?? []) as Array<{ kind?: string; actorUsername?: string; actorUserId?: string }>;
  const like = items.find((row) => row.kind === "like" && row.actorUserId === accountB.id);
  assert(Boolean(like), "like activity missing");
  assert(like?.actorUsername === accountB.username, "actor username fabricated");
  assert(items.filter((row) => row.kind === "like" && row.actorUserId === accountB.id).length === 1, "duplicate like");

  const share = await json("/api/live-share", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: JSON.stringify({
      targetUserId: accountA.id,
      streamKey: accountB.id,
      hostUserId: accountB.id,
      hostName: accountB.username,
      sharerName: accountB.username,
    }),
  });
  assert(share.status === 200, `live-share POST ${share.status}`);
  const shares = await json("/api/inbox/live-share-requests", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(shares.status === 200, `live-share GET ${shares.status}`);
  const shareItems = ((shares.body as { items?: Array<{ sharerId?: string; roomId?: string }> }).items ??
    []) as Array<{ sharerId?: string; roomId?: string }>;
  assert(shareItems.some((row) => row.sharerId === accountB.id), "live share missing for A");

  const statusEnded = await json(`/api/live/status?room=${encodeURIComponent(accountB.id)}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(statusEnded.status === 200, `live status ${statusEnded.status}`);
  assert((statusEnded.body as { active?: boolean }).active === false, "ended live must be inactive");

  const listC = await json("/api/inbox/threads", {
    headers: { Authorization: `Bearer ${accountC.token}` },
  });
  assert(listC.status === 200, `C threads ${listC.status}`);
  assert((((listC.body as { threads?: unknown[] }).threads ?? []) as unknown[]).length === 0, "C must not see A threads");

  const activityC = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountC.token}` },
  });
  assert((((activityC.body as { items?: unknown[] }).items ?? []) as unknown[]).length === 0, "C must not see A activity");

  console.log("PAGE-030 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        route: "/inbox",
        accounts: [accountA.email, accountB.email, accountC.email],
        threadDeleted: true,
        activityActor: accountB.username,
        liveSharePersisted: true,
        endedLiveInactive: true,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-030 runtime proof FAIL", err);
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
