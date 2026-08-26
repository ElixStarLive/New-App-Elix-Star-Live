/**
 * PAGE-056 runtime proof — Rising Stars Challenge detail/entries/leaderboard,
 * enter/vote/team/live-attach/withdraw, Neon rs_*, Valkey limiters, isolation.
 * Run: npx tsx scripts/_page056_rising_stars_challenge_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

delete process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const {
  risingStarsChallengeDetailResponseSchema,
  risingStarsEntriesResponseSchema,
  risingStarsLeaderboardResponseSchema,
  risingStarsEnterResponseSchema,
  risingStarsVoteResponseSchema,
} = await import("../shared/contracts/risingStars.ts");

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
  const username = `p56${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

try {
  const page = readFileSync(resolve("src/pages/RisingStarsChallenge.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/risingStars/risingStarsChallengeSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/risingStars/risingStarsApi.ts"), "utf8");
  const challengeMod = readFileSync(resolve("server/modules/risingStars/challenge.ts"), "utf8");
  const limiters = readFileSync(resolve("server/modules/risingStars/limiters.ts"), "utf8");
  const landing = readFileSync(resolve("src/pages/RisingStars.tsx"), "utf8");
  const admin = readFileSync(resolve("src/pages/admin/RisingStars.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/rising-stars/challenge/:challengeId"'), "route");
  assert(landing.includes("/rising-stars/challenge/"), "handoff");
  assert(page.includes("Submit entry") && page.includes("Withdraw entry") && page.includes("Attach live"), "actions");
  assert(page.includes("Vote") && page.includes("Join"), "vote+team");
  assert(api.includes("/enter") && api.includes("/vote") && api.includes("/live/attach"), "apis");
  assert(session.includes("++generation"), "stale gen");
  assert(challengeMod.includes("CANNOT_VOTE_SELF") && challengeMod.includes("ROOM_NOT_OWNED"), "fraud");
  assert(limiters.includes("rl:rs_enter:") && limiters.includes("rl:rs_vote:"), "valkey");
  assert(admin.includes("ADMIN_RISING_STARS_TITLE"), "page077");
  assert(!page.includes("Math.random") && !page.includes("localStorage"), "no client authority");

  assert((await json("/api/health")).status === 200, "health");

  const creator = await register("a");
  const voter = await register("b");
  const other = await register("c");

  const season = await getPool()!.query<{ id: string }>(
    `SELECT id FROM rs_seasons WHERE status = 'active' LIMIT 1`,
  );
  assert(Boolean(season.rows[0]?.id), "active season");
  const seasonId = season.rows[0]!.id;
  const category = await getPool()!.query<{ id: string }>(
    `SELECT id FROM rs_categories WHERE season_id = $1 ORDER BY sort_order ASC LIMIT 1`,
    [seasonId],
  );
  const categoryId = category.rows[0]!.id;

  const open = await getPool()!.query<{ id: string }>(
    `INSERT INTO rs_challenges
       (season_id, category_id, week_index, title, description, sound_track_id, status, opens_at, closes_at, leaderboard_frozen)
     VALUES ($1, $2, 56, 'PAGE-056 Proof Open', 'Use the sound', 'track-rs-p56', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', FALSE)
     RETURNING id`,
    [seasonId, categoryId],
  );
  const closed = await getPool()!.query<{ id: string }>(
    `INSERT INTO rs_challenges
       (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at)
     VALUES ($1, $2, 57, 'PAGE-056 Closed', 'track-rs-p56', 'closed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day')
     RETURNING id`,
    [seasonId, categoryId],
  );
  const frozen = await getPool()!.query<{ id: string }>(
    `INSERT INTO rs_challenges
       (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at, leaderboard_frozen)
     VALUES ($1, $2, 58, 'PAGE-056 Frozen', 'track-rs-p56', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', TRUE)
     RETURNING id`,
    [seasonId, categoryId],
  );
  const openId = open.rows[0]!.id;
  const closedId = closed.rows[0]!.id;
  const frozenId = frozen.rows[0]!.id;

  const listed = await json(
    `/api/rising-stars/challenges?seasonId=${encodeURIComponent(seasonId)}&categoryId=${encodeURIComponent(categoryId)}`,
  );
  assert(
    ((listed.body as { challenges: Array<{ id: string }> }).challenges).some((row) => row.id === openId),
    "PAGE-055 list includes challenge",
  );

  const publicDetail = await json(`/api/rising-stars/challenges/${openId}`);
  assert(publicDetail.status === 200, "public detail");
  assert(risingStarsChallengeDetailResponseSchema.safeParse(publicDetail.body).success, "detail schema");
  assert((publicDetail.body as { challenge: { id: string } }).challenge.id === openId, "same challengeId");
  assert((publicDetail.body as { my_entry: unknown }).my_entry == null, "public my_entry null");

  assert((await json(`/api/rising-stars/challenges/not-a-uuid`)).status === 400, "malformed id");
  assert(
    (await json(`/api/rising-stars/challenges/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)).status === 404,
    "missing id",
  );

  const video = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
     VALUES ($1, 'https://cdn.example/p56-proof.mp4', 'clip', 'public', 'track-rs-p56')
     RETURNING id`,
    [creator.id],
  );
  const foreignVideo = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
     VALUES ($1, 'https://cdn.example/p56-foreign.mp4', 'theirs', 'public', 'track-rs-p56')
     RETURNING id`,
    [voter.id],
  );
  const videoId = video.rows[0]!.id;

  assert(
    (
      await json(`/api/rising-stars/challenges/${openId}/enter`, {
        method: "POST",
        body: JSON.stringify({ videoId }),
      })
    ).status === 401,
    "enter requires auth",
  );

  const enter = await json(`/api/rising-stars/challenges/${openId}/enter`, {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ videoId, userId: voter.id, score: 100000, rank: 1 }),
  });
  assert(enter.status === 201, `enter → ${enter.status}`);
  assert(risingStarsEnterResponseSchema.safeParse(enter.body).success, "enter schema");
  const entryId = String((enter.body as { entry: { id: string; creator_user_id: string } }).entry.id);
  assert(
    (enter.body as { entry: { creator_user_id: string } }).entry.creator_user_id === creator.id,
    "forged userId ignored",
  );

  const [retry, concurrent] = await Promise.all([
    json(`/api/rising-stars/challenges/${openId}/enter`, {
      method: "POST",
      headers: auth(creator.token),
      body: JSON.stringify({ videoId }),
    }),
    json(`/api/rising-stars/challenges/${openId}/enter`, {
      method: "POST",
      headers: auth(creator.token),
      body: JSON.stringify({ videoId }),
    }),
  ]);
  assert(retry.status === 201 && concurrent.status === 201, `idempotent enter ${retry.status}/${concurrent.status}`);
  assert(
    (retry.body as { entry: { id: string } }).entry.id === entryId &&
      (concurrent.body as { entry: { id: string } }).entry.id === entryId,
    "same entry",
  );
  const entryCount = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM rs_entries WHERE challenge_id = $1 AND user_id = $2`,
    [openId, creator.id],
  );
  assert((entryCount.rows[0]?.n ?? 0) === 1, "one entry row");

  const closedEnter = await json(`/api/rising-stars/challenges/${closedId}/enter`, {
    method: "POST",
    headers: auth(other.token),
    body: JSON.stringify({ videoId }),
  });
  assert((closedEnter.body as { message?: string }).message === "CHALLENGE_CLOSED", "closed enter");

  const frozenEnter = await json(`/api/rising-stars/challenges/${frozenId}/enter`, {
    method: "POST",
    headers: auth(other.token),
    body: JSON.stringify({ videoId }),
  });
  assert((frozenEnter.body as { message?: string }).message === "LEADERBOARD_FROZEN", "frozen enter");

  const foreignEnter = await json(`/api/rising-stars/challenges/${openId}/enter`, {
    method: "POST",
    headers: auth(other.token),
    body: JSON.stringify({ videoId: foreignVideo.rows[0]!.id }),
  });
  assert((foreignEnter.body as { message?: string }).message === "VIDEO_NOT_OWNED", "foreign video");

  const entries = await json(`/api/rising-stars/challenges/${openId}/entries`);
  assert(entries.status === 200, "entries");
  assert(risingStarsEntriesResponseSchema.safeParse(entries.body).success, "entries schema");
  assert(
    ((entries.body as { entries: Array<{ id: string }> }).entries).some((row) => row.id === entryId),
    "entry listed",
  );

  const board = await json(`/api/rising-stars/challenges/${openId}/leaderboard`);
  assert(board.status === 200, "leaderboard");
  assert(risingStarsLeaderboardResponseSchema.safeParse(board.body).success, "board schema");

  const selfVote = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ score: 50, rank: 1 }),
  });
  assert((selfVote.body as { message?: string }).message === "CANNOT_VOTE_SELF", "self-vote");

  const vote = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(voter.token),
    body: JSON.stringify({ score: 999999, rank: 1 }),
  });
  assert(vote.status === 200, `vote → ${vote.status}`);
  assert(risingStarsVoteResponseSchema.safeParse(vote.body).success, "vote schema");
  assert((vote.body as { vote_count: number }).vote_count === 1, "server vote_count");

  const voteAgain = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(voter.token),
    body: "{}",
  });
  assert((voteAgain.body as { message?: string }).message === "ALREADY_VOTED_TODAY", "vote limiter");

  const team = await json("/api/rising-stars/teams", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({
      seasonId,
      name: "P56 Crew",
      slug: `p56-crew-${Date.now().toString(36)}`,
    }),
  });
  assert(team.status === 201, `team → ${team.status}`);
  const teamId = String((team.body as { team: { id: string } }).team.id);
  const join = await json(`/api/rising-stars/teams/${teamId}/join`, {
    method: "POST",
    headers: auth(voter.token),
    body: "{}",
  });
  assert(join.status === 200, "join");
  const joinAgain = await json(`/api/rising-stars/teams/${teamId}/join`, {
    method: "POST",
    headers: auth(voter.token),
    body: "{}",
  });
  assert(joinAgain.status === 200, "join idempotent");
  const members = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM rs_team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, voter.id],
  );
  assert((members.rows[0]?.n ?? 0) === 1, "one membership");

  await getPool()!.query(
    `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'RS LIVE P56', 'live')`,
    [creator.id, creator.id],
  );
  const stolen = await json(`/api/rising-stars/challenges/${openId}/live/attach`, {
    method: "POST",
    headers: auth(voter.token),
    body: JSON.stringify({ phase: "qualifier", roomId: creator.id }),
  });
  assert((stolen.body as { message?: string }).message === "ROOM_NOT_OWNED", "forged live");

  const fakeRoom = await json(`/api/rising-stars/challenges/${openId}/live/attach`, {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ phase: "qualifier", roomId: other.id }),
  });
  assert([403, 404].includes(fakeRoom.status), `fake room → ${fakeRoom.status}`);

  const attach = await json(`/api/rising-stars/challenges/${openId}/live/attach`, {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ phase: "qualifier", roomId: creator.id }),
  });
  assert(attach.status === 200, `attach → ${attach.status}`);
  assert(
    (attach.body as { challenge: { live_qualifier_room_id: string } }).challenge.live_qualifier_room_id ===
      creator.id,
    "live attached",
  );
  const attachAgain = await json(`/api/rising-stars/challenges/${openId}/live/attach`, {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ phase: "qualifier", roomId: creator.id }),
  });
  assert(attachAgain.status === 200, "attach idempotent");
  assert(
    (attachAgain.body as { challenge: { live_qualifier_room_id: string } }).challenge.live_qualifier_room_id ===
      creator.id,
    "still attached",
  );

  await getPool()!.query(`UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE host_id = $1`, [
    creator.id,
  ]);
  const liveAfterEnd = await json(`/api/rising-stars/challenges/${openId}/live`);
  assert(
    (liveAfterEnd.body as { live: { live_qualifier_room_id: string } }).live.live_qualifier_room_id ===
      creator.id,
    "ended live retains historical room id",
  );

  const stolenWithdraw = await json(`/api/rising-stars/entries/${entryId}`, {
    method: "DELETE",
    headers: auth(voter.token),
  });
  assert(
    stolenWithdraw.status === 409 ||
      (stolenWithdraw.body as { message?: string }).message === "WITHDRAW_DENIED",
    "cross-account withdraw denied",
  );

  const withdraw = await json(`/api/rising-stars/entries/${entryId}`, {
    method: "DELETE",
    headers: auth(creator.token),
  });
  assert(withdraw.status === 200, "withdraw");
  const withdrawAgain = await json(`/api/rising-stars/entries/${entryId}`, {
    method: "DELETE",
    headers: auth(creator.token),
  });
  assert((withdrawAgain.body as { message?: string }).message === "WITHDRAW_DENIED", "duplicate withdraw");

  const after = await json(`/api/rising-stars/challenges/${openId}`, {
    headers: auth(creator.token),
  });
  assert((after.body as { my_entry: { status: string } | null }).my_entry?.status === "withdrawn", "withdrawn");

  const neon = await getPool()!.query<{ status: string }>(
    `SELECT status FROM rs_entries WHERE id = $1 AND user_id = $2`,
    [entryId, creator.id],
  );
  assert(neon.rows[0]?.status === "withdrawn", "Neon withdrawn");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(creator.token) });
  assert(logout.status === 200, "logout");
  assert(
    (
      await json(`/api/rising-stars/challenges/${openId}/enter`, {
        method: "POST",
        headers: auth(creator.token),
        body: JSON.stringify({ videoId }),
      })
    ).status === 401,
    "post-logout enter 401",
  );

  console.log("PAGE-056 RISING STARS CHALLENGE RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        detailHandoff: true,
        enterIdempotent: true,
        forgedOwnerIgnored: true,
        selfVoteBlocked: true,
        voteLimiter: true,
        teamJoinIdempotent: true,
        liveAttachOwned: true,
        forgedLiveRejected: true,
        withdrawOwned: true,
        crossAccountWithdrawDenied: true,
        closedFrozenProtected: true,
        neonRsPersistence: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-056 RISING STARS CHALLENGE RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
