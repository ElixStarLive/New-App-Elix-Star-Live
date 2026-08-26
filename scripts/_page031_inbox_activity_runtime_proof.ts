/**
 * PAGE-031 runtime proof — Inbox Activity overlay against NEW API + Neon.
 * Run: npx tsx scripts/_page031_inbox_activity_runtime_proof.ts
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
  const username = `p31${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  return { id, token, username, email };
}

try {
  const overlay = readFileSync(resolve("src/features/inbox/InboxActivityOverlay.tsx"), "utf8");
  const page = readFileSync(resolve("src/pages/Inbox.tsx"), "utf8");
  const line = readFileSync(resolve("src/features/inbox/inboxActivityLine.ts"), "utf8");
  const session = readFileSync(resolve("src/features/inbox/inboxSession.ts"), "utf8");
  const query = readFileSync(resolve("server/modules/inbox/query.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(!app.includes('path="/activity"'), "must not be a standalone route");
  assert(page.includes("InboxActivityOverlay"), "PAGE-030 must mount overlay");
  assert(page.includes("requestActivityOverlay"), "open owner missing");
  assert(overlay.includes("createPortal"), "portal missing");
  assert(overlay.includes("app:back-button"), "hardware back missing");
  assert(!overlay.includes("wsClient"), "no second WS");
  assert(!overlay.includes("apiListInboxActivity"), "overlay must not fetch");
  assert(session.includes("apiListInboxActivity"), "session owns fetch");
  assert(line.includes("Liked your video"), "like copy missing");
  assert(query.includes("parent_id IS NULL"), "top-level comments only");
  assert(query.includes("FROM blocks"), "block filter missing");
  assert(query.includes("u.deleted_at IS NULL"), "deleted actor filter missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const accountA = await register("a");
  const accountB = await register("b");
  const accountC = await register("c");

  const video = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p31-runtime.mp4', 'clip', 'public') RETURNING id`,
    [accountA.id],
  );
  const videoId = video.rows[0].id;

  await getPool()!.query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    accountB.id,
    videoId,
  ]);
  await getPool()!.query(`INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, 'great clip')`, [
    videoId,
    accountB.id,
  ]);
  await getPool()!.query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    accountB.id,
    videoId,
  ]);

  const otherVideo = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p31-other.mp4', 'other', 'public') RETURNING id`,
    [accountC.id],
  );
  await getPool()!.query(
    `INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, $3)`,
    [otherVideo.rows[0].id, accountB.id, `hey @${accountA.username} check this`],
  );

  const activity = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(activity.status === 200, `activity ${activity.status}`);
  const items = ((activity.body as {
    items?: Array<{
      id?: string;
      kind?: string;
      actorUserId?: string;
      actorUsername?: string;
      videoId?: string;
      snippet?: string | null;
    }>;
    total?: number;
  }).items ?? []) as Array<{
    id?: string;
    kind?: string;
    actorUserId?: string;
    actorUsername?: string;
    videoId?: string;
    snippet?: string | null;
  }>;

  const likes = items.filter((row) => row.kind === "like" && row.actorUserId === accountB.id);
  assert(likes.length === 1, `expected 1 like, got ${likes.length}`);
  assert(likes[0]?.actorUsername === accountB.username, "like actor fabricated");
  assert(likes[0]?.videoId === videoId, "like target wrong");

  const comments = items.filter((row) => row.kind === "comment" && row.actorUserId === accountB.id);
  assert(comments.length === 1, `expected 1 comment, got ${comments.length}`);
  assert(comments[0]?.snippet === "great clip", "comment snippet wrong");

  const saves = items.filter((row) => row.kind === "save" && row.actorUserId === accountB.id);
  assert(saves.length === 1, `expected 1 save, got ${saves.length}`);

  const mentions = items.filter((row) => row.kind === "mention" && row.actorUserId === accountB.id);
  assert(mentions.length === 1, `expected 1 mention, got ${mentions.length}`);

  const ids = items.map((row) => row.id);
  assert(new Set(ids).size === ids.length, "duplicate activity ids");

  const parent = await getPool()!.query<{ id: string }>(
    `SELECT id FROM comments WHERE video_id = $1 AND parent_id IS NULL LIMIT 1`,
    [videoId],
  );
  await getPool()!.query(
    `INSERT INTO comments (video_id, user_id, body, parent_id) VALUES ($1, $2, 'nested reply', $3)`,
    [videoId, accountB.id, parent.rows[0].id],
  );
  const afterReply = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  const afterReplyItems = ((afterReply.body as { items?: Array<{ snippet?: string | null }> }).items ??
    []) as Array<{ snippet?: string | null }>;
  assert(!afterReplyItems.some((row) => row.snippet === "nested reply"), "reply must not appear as comment");

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
    accountA.id,
    accountB.id,
  ]);
  const blocked = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert((((blocked.body as { items?: unknown[] }).items ?? []) as unknown[]).length === 0, "blocked actor leaked");

  const asC = await json("/api/activity", {
    headers: { Authorization: `Bearer ${accountC.token}` },
  });
  const cItems = ((asC.body as { items?: Array<{ videoId?: string; actorUserId?: string }> }).items ??
    []) as Array<{ videoId?: string; actorUserId?: string }>;
  assert(!cItems.some((row) => row.videoId === videoId), "C must not see activity for A's video");
  // C owns otherVideo — B's top-level comment there is C's own comment activity (expected).
  assert(
    cItems.every((row) => row.videoId === otherVideo.rows[0].id),
    "C activity must only be about C's own videos",
  );

  console.log("PAGE-031 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        route: "overlay on /inbox",
        likeOnce: true,
        commentOnce: true,
        saveOnce: true,
        mentionOnce: true,
        replyExcluded: true,
        blockedFiltered: true,
        actor: accountB.username,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-031 runtime proof FAIL", err);
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
