/**
 * PAGE-013 runtime proof — hashtag exact match / views order / blocks against NEW Neon.
 * Run: npx tsx scripts/_page013_hashtag_runtime_proof.ts
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
const unique = `h13${Date.now().toString(36)}`;
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
      displayName: username,
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
  const creator = await register("c");
  const blockedUser = await register("b");
  const pool = getPool();

  const car = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'car clip ${unique}', 'public', ARRAY['car']) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-car.mp4`],
  );
  const carpet = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'carpet clip ${unique}', 'public', ARRAY['carpet']) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-carpet.mp4`],
  );
  const hashed = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'hashed car ${unique}', 'public', ARRAY['#Car']) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-hash.mp4`],
  );
  const privateVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'private car ${unique}', 'private', ARRAY['car']) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-priv.mp4`],
  );
  const blockedVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'blocked car ${unique}', 'public', ARRAY['car']) RETURNING id`,
    [blockedUser.id, `https://cdn.example/${unique}-blk.mp4`],
  );
  await pool.query(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, deleted_at)
     VALUES ($1, $2, 'deleted car ${unique}', 'public', ARRAY['car'], NOW())`,
    [creator.id, `https://cdn.example/${unique}-del.mp4`],
  );

  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blockedUser.id,
  ]);
  await pool.query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    car.rows[0].id,
    viewer.id,
  ]);
  await pool.query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    car.rows[0].id,
    creator.id,
  ]);

  const page = await json("/api/hashtags/Car", {}, viewer.token);
  if (page.status !== 200) throw new Error(`hashtag ${page.status}`);
  const body = asRecord(page.body);
  if (body.tag !== "car") throw new Error(`tag normalize wrong: ${String(body.tag)}`);
  if (Number(body.useCount) !== 2) throw new Error(`useCount want 2 got ${String(body.useCount)}`);
  const videos = (body.videos as unknown[]) || [];
  const ids = videos.map((row) => String(asRecord(row).id));
  if (!ids.includes(car.rows[0].id)) throw new Error("car video missing");
  if (!ids.includes(hashed.rows[0].id)) throw new Error("#Car normalized membership missing");
  if (ids.includes(carpet.rows[0].id)) throw new Error("carpet incorrectly merged into car");
  if (ids.includes(privateVid.rows[0].id)) throw new Error("private video leaked");
  if (ids.includes(blockedVid.rows[0].id)) throw new Error("blocked creator leaked");
  if (ids[0] !== car.rows[0].id) throw new Error("views ordering wrong — car should rank first");

  const hashRoute = await json("/api/hashtags/%23car", {}, viewer.token);
  if (asRecord(hashRoute.body).tag !== "car") throw new Error("encoded #car failed");

  const missing = await json("/api/hashtags/nopezzzz", {}, viewer.token);
  if (Number(asRecord(missing.body).useCount) !== 0) throw new Error("unknown tag should be empty count");
  if (((asRecord(missing.body).videos as unknown[]) || []).length !== 0) {
    throw new Error("unknown tag should return empty videos");
  }

  const outsider = await register("x");
  const outsiderPage = await json("/api/hashtags/car", {}, outsider.token);
  const outsiderIds = ((asRecord(outsiderPage.body).videos as unknown[]) || []).map((row) =>
    String(asRecord(row).id),
  );
  if (!outsiderIds.includes(blockedVid.rows[0].id)) {
    throw new Error("account without block must see previously blocked creator video");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-013",
        tag: "car",
        useCount: body.useCount,
        topVideoId: ids[0],
        carId: car.rows[0].id,
        carpetExcluded: true,
        blockedExcluded: true,
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
