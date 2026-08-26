/**
 * PAGE-012 runtime proof — Search browse/users/videos/blocks against NEW Neon.
 * Run: npx tsx scripts/_page012_search_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so cache/presence paths stay honest.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `s12${Date.now().toString(36)}`;
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

async function register(suffix: string): Promise<{ token: string; id: string; username: string }> {
  const username = `${unique}${suffix}`.slice(0, 20);
  const email = `${username}@example.com`;
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      displayName: `Display ${username}`,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register ${suffix} ${registered.status} ${JSON.stringify(registered.body)}`);
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
    if (login.status !== 200) throw new Error(`login ${suffix} ${login.status}`);
    token = accessToken(login.body);
    id = String(asRecord(asRecord(login.body).user).id ?? id);
  }
  if (!token || !id) throw new Error(`register ${suffix} missing identity`);
  return { token, id, username };
}

try {
  await requireValkey().ping();
  const viewer = await register("v");
  const maya = await register("m");
  const blockedUser = await register("b");
  const other = await register("o");
  const pool = getPool();

  const dance = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'dance night ${unique}', 'public', ARRAY['dance']) RETURNING id`,
    [maya.id, `https://cdn.example/${unique}-dance.mp4`],
  );
  const privateVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'dance private ${unique}', 'private', ARRAY['dance']) RETURNING id`,
    [maya.id, `https://cdn.example/${unique}-priv.mp4`],
  );
  const blockedVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'dance blocked ${unique}', 'public', ARRAY['dance']) RETURNING id`,
    [blockedUser.id, `https://cdn.example/${unique}-blk.mp4`],
  );
  const deletedVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, deleted_at)
     VALUES ($1, $2, 'dance gone ${unique}', 'public', ARRAY['dance'], NOW()) RETURNING id`,
    [maya.id, `https://cdn.example/${unique}-del.mp4`],
  );
  const beach = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'beach day ${unique}', 'public', ARRAY['summer']) RETURNING id`,
    [other.id, `https://cdn.example/${unique}-beach.mp4`],
  );

  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blockedUser.id,
  ]);

  const empty = await json("/api/search?category=All", {}, viewer.token);
  if (empty.status !== 200) throw new Error(`empty browse ${empty.status}`);
  const emptyBody = asRecord(empty.body);
  if (!Array.isArray(emptyBody.users) || emptyBody.users.length !== 0) {
    throw new Error("empty query must return users:[]");
  }
  if (!Array.isArray(emptyBody.videos) || emptyBody.videos.length === 0) {
    throw new Error("browse All must return videos");
  }
  const browseIds = (emptyBody.videos as unknown[]).map((row) => String(asRecord(row).id));
  if (!browseIds.includes(dance.rows[0].id)) throw new Error("public dance missing from browse");
  if (browseIds.includes(privateVid.rows[0].id)) throw new Error("private video leaked in browse");
  if (browseIds.includes(blockedVid.rows[0].id)) throw new Error("blocked creator video leaked in browse");
  if (browseIds.includes(deletedVid.rows[0].id)) throw new Error("deleted video leaked in browse");

  const danceCat = await json("/api/search?category=Dance", {}, viewer.token);
  const danceCaptions = ((asRecord(danceCat.body).videos as unknown[]) || []).map((row) => {
    const r = asRecord(row);
    return `${String(r.description ?? "")} ${String(asRecord(r.user).username ?? "")}`;
  });
  if (!danceCaptions.some((row) => row.includes("dance night"))) throw new Error("Dance chip missed dance night");
  if (danceCaptions.some((row) => row.includes("dance blocked"))) throw new Error("Dance chip showed blocked");

  const found = await json(`/api/search?q=${encodeURIComponent(maya.username.slice(0, 4))}`, {}, viewer.token);
  if (found.status !== 200) throw new Error(`user search ${found.status}`);
  const users = (asRecord(found.body).users as unknown[]) || [];
  if (!users.some((row) => String(asRecord(row).userId) === maya.id)) {
    throw new Error("username search missed maya");
  }
  if (users.some((row) => String(asRecord(row).userId) === blockedUser.id)) {
    throw new Error("blocked user appeared in user search");
  }
  const mayaHit = asRecord(users.find((row) => String(asRecord(row).userId) === maya.id));
  if (String(mayaHit.username) !== maya.username) throw new Error("username identity wrong");
  if (!String(mayaHit.displayName).includes(maya.username)) throw new Error("displayName missing");

  const displayQ = await json(`/api/search?q=${encodeURIComponent("Display")}`, {}, viewer.token);
  const displayUsers = (asRecord(displayQ.body).users as unknown[]) || [];
  if (!displayUsers.some((row) => String(asRecord(row).userId) === maya.id)) {
    throw new Error("display-name search missed maya");
  }

  const unknown = await json("/api/search?q=zzznobodyexists999", {}, viewer.token);
  if (((asRecord(unknown.body).users as unknown[]) || []).length !== 0) throw new Error("unknown user leaked");
  if (((asRecord(unknown.body).videos as unknown[]) || []).length !== 0) throw new Error("unknown video leaked");

  const videoHits = await json("/api/search?q=dance", {}, viewer.token);
  const videos = (asRecord(videoHits.body).videos as unknown[]) || [];
  const videoIds = videos.map((row) => String(asRecord(row).id));
  if (!videoIds.includes(dance.rows[0].id)) throw new Error("video search missed dance night");
  if (videoIds.includes(privateVid.rows[0].id)) throw new Error("private video in search");
  if (videoIds.includes(blockedVid.rows[0].id)) throw new Error("blocked video in search");
  if (videoIds.includes(deletedVid.rows[0].id)) throw new Error("deleted video in search");
  if (videoIds.includes(beach.rows[0].id)) throw new Error("unrelated beach in dance search");
  const danceRow = asRecord(videos.find((row) => String(asRecord(row).id) === dance.rows[0].id));
  if (String(asRecord(danceRow.user).id) !== maya.id) throw new Error("creator hydration wrong");

  const blank = await json("/api/search?q=%20%20", {}, viewer.token);
  if (((asRecord(blank.body).users as unknown[]) || []).length !== 0) {
    throw new Error("whitespace query must behave as empty users");
  }

  // Race: slower first query must not win after second completes (client loadSeq owns this;
  // server still returns independently — prove both responses stay correct for their q).
  const slowQ = maya.username.slice(0, 3);
  const fastQ = other.username;
  const [slow, fast] = await Promise.all([
    json(`/api/search?q=${encodeURIComponent(slowQ)}`, {}, viewer.token),
    json(`/api/search?q=${encodeURIComponent(fastQ)}`, {}, viewer.token),
  ]);
  if (slow.status !== 200 || fast.status !== 200) throw new Error("race queries failed");
  const slowUsers = ((asRecord(slow.body).users as unknown[]) || []).map((row) => String(asRecord(row).userId));
  const fastUsers = ((asRecord(fast.body).users as unknown[]) || []).map((row) => String(asRecord(row).userId));
  if (!slowUsers.includes(maya.id)) throw new Error("slow race query wrong");
  if (!fastUsers.includes(other.id)) throw new Error("fast race query wrong");

  // Account-switch: other viewer without block must see blockedUser content.
  const outsider = await register("x");
  const outsiderHits = await json("/api/search?q=dance", {}, outsider.token);
  const outsiderIds = ((asRecord(outsiderHits.body).videos as unknown[]) || []).map((row) =>
    String(asRecord(row).id),
  );
  if (!outsiderIds.includes(blockedVid.rows[0].id)) {
    throw new Error("account without block must see previously blocked creator video");
  }

  // Client navigation contracts (source-level STEM/Inbox already ownership-tested).
  const pageSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/pages/SearchPage.tsx", import.meta.url), "utf8"),
  );
  if (!pageSrc.includes("exitToFromLocationState") || !pageSrc.includes("loadSeq")) {
    throw new Error("SearchPage missing returnTo/race owners");
  }
  if (pageSrc.includes("localStorage") || pageSrc.includes("elix_recent_searches")) {
    throw new Error("SearchPage must not own localStorage search authority");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-012",
        mayaId: maya.id,
        danceVideoId: dance.rows[0].id,
        browseCount: browseIds.length,
        userHits: users.length,
        videoHits: videoIds.length,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool().end();
  } catch {
    /* ignore */
  }
}
