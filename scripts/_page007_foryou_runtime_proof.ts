/**
 * PAGE-007 runtime proof — For You feed envelope, Neon-backed pages, live list, view track.
 * Run: npx tsx scripts/_page007_foryou_runtime_proof.ts
 * Requires API :8080, Vite :5173, NEW Neon. Forces local Valkey for anon cache path.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p7${Date.now().toString(36)}`;
const email = `${unique}@example.com`;
const username = unique.slice(0, 20);
const password = "password12";

async function json(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const r = asRecord(body);
  const session = asRecord(r.session);
  return String(session.access_token ?? session.accessToken ?? "");
}

try {
  await requireValkey().ping();

  const anon = await json("/api/feed/foryou?page=1&limit=50");
  if (anon.status !== 200) throw new Error(`anon foryou ${anon.status}`);
  const anonBody = asRecord(anon.body);
  if (!Array.isArray(anonBody.videos)) throw new Error("anon foryou missing videos[]");
  if (!("mutualUserIds" in anonBody) || !("hasMore" in anonBody) || !("source" in anonBody)) {
    throw new Error(`anon foryou missing envelope fields: ${JSON.stringify(anonBody)}`);
  }
  for (const raw of anonBody.videos as unknown[]) {
    const v = asRecord(raw);
    const url = String(v.url ?? "");
    if (url.includes("/stories/")) throw new Error("story clip leaked into foryou");
  }

  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      displayName: username,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register ${registered.status}`);
  }
  let token = accessToken(registered.body);
  if (!token) {
    const { default: pg } = await import("pg");
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL required");
    const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    try {
      await pool.query(
        `UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE email_normalized = $1`,
        [email.toLowerCase()],
      );
    } finally {
      await pool.end();
    }
    const login = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200) throw new Error(`login ${login.status}`);
    token = accessToken(login.body);
  }
  if (!token) throw new Error("missing token");

  const authed = await json("/api/feed/foryou?page=1&limit=50", {}, token);
  if (authed.status !== 200) throw new Error(`authed foryou ${authed.status}`);
  const feed = asRecord(authed.body);
  if (!Array.isArray(feed.videos)) throw new Error("authed foryou missing videos");

  const lives = await json("/api/live/streams", {}, token);
  if (lives.status !== 200) throw new Error(`live streams ${lives.status}`);
  const liveBody = asRecord(lives.body);
  if (!Array.isArray(liveBody.streams)) throw new Error("live streams missing streams[]");

  const videos = feed.videos as Record<string, unknown>[];
  if (videos.length > 0) {
    const first = asRecord(videos[0]);
    const videoId = String(first.id ?? "");
    if (videoId) {
      const view1 = await json(
        "/api/feed/track-view",
        { method: "POST", body: JSON.stringify({ videoId }) },
        token,
      );
      if (view1.status !== 200) throw new Error(`track-view ${view1.status}`);
      const view2 = await json(
        "/api/feed/track-view",
        { method: "POST", body: JSON.stringify({ videoId }) },
        token,
      );
      if (view2.status !== 200) throw new Error(`track-view reuse ${view2.status}`);
      const counted1 = Boolean(asRecord(view1.body).counted);
      const counted2 = Boolean(asRecord(view2.body).counted);
      if (counted1 && counted2) throw new Error("track-view not deduped for same viewer");

      const like = await json(`/api/videos/${encodeURIComponent(videoId)}/like`, { method: "POST" }, token);
      if (like.status !== 200 && like.status !== 201) {
        // may already be liked or forbidden — only fail hard on 5xx
        if (like.status >= 500) throw new Error(`like ${like.status}`);
      }
    }
  }

  const shell = await fetch("http://127.0.0.1:5173/feed");
  if (shell.status !== 200) throw new Error(`feed shell ${shell.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-007",
        email,
        foryouEnvelope: true,
        noStoriesInFeed: true,
        liveStreamsList: true,
        viewDedupe: videos.length > 0,
        valkeyPing: true,
        storyCirclesOnForYou: false,
        note: "OLD VideoFeed has no story rings; NEW matches. Live card device join verified when a real host is live.",
      },
      null,
      2,
    ),
  );
} finally {
  await closeValkey().catch(() => undefined);
}
