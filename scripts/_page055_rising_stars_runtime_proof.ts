/**
 * PAGE-055 runtime proof — Rising Stars hub discovery, filters, PAGE-056 handoff,
 * Neon rs_* persistence, entry/vote limiter authority (mutations owned by challenge APIs).
 * Run: npx tsx scripts/_page055_rising_stars_runtime_proof.ts
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
  risingStarsCurrentSeasonResponseSchema,
  risingStarsCategoriesResponseSchema,
  risingStarsRegionsResponseSchema,
  risingStarsChallengesResponseSchema,
  risingStarsStandingsResponseSchema,
  risingStarsTeamsResponseSchema,
  risingStarsRewardsResponseSchema,
  risingStarsBadgesResponseSchema,
  risingStarsChallengeDetailResponseSchema,
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
  return { status: res.status, body, cache: res.headers.get("cache-control") };
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
  const username = `p55${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/RisingStars.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/risingStars/risingStarsSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/risingStars/risingStarsApi.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/risingStars/router.ts"), "utf8");
  const hub = readFileSync(resolve("server/modules/risingStars/hub.ts"), "utf8");
  const limiters = readFileSync(resolve("server/modules/risingStars/limiters.ts"), "utf8");
  const challengePage = readFileSync(resolve("src/pages/RisingStarsChallenge.tsx"), "utf8");
  const admin = readFileSync(resolve("src/pages/admin/RisingStars.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/rising-stars"') && app.includes("RequireAuth"), "route+auth");
  assert(app.includes('path="/rising-stars/challenge/:challengeId"'), "page056 route");
  assert(page.includes("Rising Stars") && page.includes("All categories") && page.includes("Standings"), "page");
  assert(!page.includes("/enter") && !page.includes("/vote"), "no vote/enter on hub");
  assert(api.includes("/api/rising-stars/seasons/current"), "current season api");
  assert(session.includes("++generation") && session.includes("++filterGeneration"), "stale guards");
  assert(router.includes('router.get("/seasons/current"'), "public season");
  assert(hub.includes("WHERE status = 'active'") && hub.includes("assignStandingRanks"), "active+ranks");
  assert(limiters.includes("requireValkey") && limiters.includes("rl:rs_enter:"), "valkey limiters");
  assert(challengePage.includes("Submit entry"), "page056 owns entry");
  assert(admin.includes("ADMIN_RISING_STARS_TITLE"), "page077 admin owner");

  assert((await json("/api/health")).status === 200, "health");

  const accountA = await register("a");
  const accountB = await register("b");

  const current = await json("/api/rising-stars/seasons/current");
  assert(current.status === 200, `current → ${current.status}`);
  assert(risingStarsCurrentSeasonResponseSchema.safeParse(current.body).success, "season schema");
  const season = (current.body as { season: { id: string; status: string; title: string } | null }).season;
  assert(season != null && season.status === "active", "active season");
  const seasonId = season!.id;

  const categories = await json(`/api/rising-stars/categories?seasonId=${seasonId}`);
  assert(categories.status === 200, "categories");
  assert(risingStarsCategoriesResponseSchema.safeParse(categories.body).success, "categories schema");
  const categoryList = (categories.body as { categories: Array<{ id: string }> }).categories;
  assert(categoryList.length > 0, "has categories");
  const categoryId = categoryList[0]!.id;

  const regions = await json(`/api/rising-stars/regions?seasonId=${seasonId}`);
  assert(regions.status === 200, "regions");
  assert(risingStarsRegionsResponseSchema.safeParse(regions.body).success, "regions schema");

  const standings = await json(`/api/rising-stars/seasons/${seasonId}/standings`);
  assert(standings.status === 200, "standings");
  assert(risingStarsStandingsResponseSchema.safeParse(standings.body).success, "standings schema");

  const teams = await json(`/api/rising-stars/teams?seasonId=${seasonId}`);
  assert(teams.status === 200, "teams");
  assert(risingStarsTeamsResponseSchema.safeParse(teams.body).success, "teams schema");

  const rewards = await json(`/api/rising-stars/rewards?seasonId=${seasonId}`);
  assert(rewards.status === 200, "rewards");
  assert(risingStarsRewardsResponseSchema.safeParse(rewards.body).success, "rewards schema");

  assert((await json("/api/rising-stars/badges/me")).status === 401, "badges require auth");
  const badges = await json("/api/rising-stars/badges/me", { headers: auth(accountA.token) });
  assert(badges.status === 200, "badges me");
  assert(risingStarsBadgesResponseSchema.safeParse(badges.body).success, "badges schema");

  const inserted = await getPool()!.query<{ id: string }>(
    `INSERT INTO rs_challenges
       (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at, leaderboard_frozen)
     VALUES ($1, $2, 91, 'PAGE-055 Proof Challenge', 'track-rs-proof', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', FALSE)
     RETURNING id`,
    [seasonId, categoryId],
  );
  const challengeId = inserted.rows[0]!.id;

  const listed = await json(
    `/api/rising-stars/challenges?seasonId=${encodeURIComponent(seasonId)}&categoryId=${encodeURIComponent(categoryId)}`,
  );
  assert(listed.status === 200, "challenges");
  assert(risingStarsChallengesResponseSchema.safeParse(listed.body).success, "challenges schema");
  const challengeRows = (listed.body as { challenges: Array<{ id: string; title: string; week_index: number }> })
    .challenges;
  assert(challengeRows.some((row) => row.id === challengeId), "proof challenge listed");
  const weeks = challengeRows.map((row) => row.week_index);
  assert(JSON.stringify([...weeks].sort((a, b) => a - b)) === JSON.stringify(weeks), "week ordering");

  const detail = await json(`/api/rising-stars/challenges/${challengeId}`, {
    headers: auth(accountA.token),
  });
  assert(detail.status === 200, "challenge detail handoff");
  assert(risingStarsChallengeDetailResponseSchema.safeParse(detail.body).success, "detail schema");
  assert(
    (detail.body as { challenge: { id: string; title: string } }).challenge.id === challengeId &&
      (detail.body as { challenge: { title: string } }).challenge.title === "PAGE-055 Proof Challenge",
    "same challengeId/title for PAGE-056",
  );

  const forgedStanding = await json(`/api/rising-stars/seasons/${seasonId}/standings`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ rank: 1, votes: 999999, creator_user_id: accountA.id }),
  });
  assert(forgedStanding.status === 404 || forgedStanding.status === 405, `forged standing → ${forgedStanding.status}`);

  const video = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
     VALUES ($1, 'https://cdn.example/p55-proof.mp4', 'clip', 'public', 'track-rs-proof')
     RETURNING id`,
    [accountA.id],
  );
  const videoId = video.rows[0]!.id;

  const enter = await json(`/api/rising-stars/challenges/${challengeId}/enter`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({
      videoId,
      userId: accountB.id,
      score: 100000,
      rank: 1,
      votes: 9999,
    }),
  });
  assert(enter.status === 201, `enter → ${enter.status}`);
  const entryId = String((enter.body as { entry?: { id?: string; creator_user_id?: string } }).entry?.id ?? "");
  assert(Boolean(entryId), "entry id");
  assert(
    (enter.body as { entry: { creator_user_id: string } }).entry.creator_user_id === accountA.id,
    "entry owner is auth user not forged userId",
  );

  const [retry, concurrent] = await Promise.all([
    json(`/api/rising-stars/challenges/${challengeId}/enter`, {
      method: "POST",
      headers: auth(accountA.token),
      body: JSON.stringify({ videoId }),
    }),
    json(`/api/rising-stars/challenges/${challengeId}/enter`, {
      method: "POST",
      headers: auth(accountA.token),
      body: JSON.stringify({ videoId }),
    }),
  ]);
  assert(retry.status === 201 && concurrent.status === 201, "idempotent enter status");
  assert(
    (retry.body as { entry: { id: string } }).entry.id === entryId &&
      (concurrent.body as { entry: { id: string } }).entry.id === entryId,
    "same entry id",
  );
  const entryCount = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM rs_entries WHERE challenge_id = $1 AND user_id = $2`,
    [challengeId, accountA.id],
  );
  assert((entryCount.rows[0]?.n ?? 0) === 1, "one entry row");

  const selfVote = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ score: 50 }),
  });
  assert(
    (selfVote.body as { message?: string }).message === "CANNOT_VOTE_SELF" || selfVote.status === 400,
    "self-vote blocked",
  );

  const vote = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(accountB.token),
    body: "{}",
  });
  assert(vote.status === 200, `vote → ${vote.status}`);
  assert((vote.body as { vote_count?: number }).vote_count === 1, "vote count 1");

  const voteAgain = await json(`/api/rising-stars/entries/${entryId}/vote`, {
    method: "POST",
    headers: auth(accountB.token),
    body: "{}",
  });
  assert(
    (voteAgain.body as { message?: string }).message === "ALREADY_VOTED_TODAY" || voteAgain.status === 409,
    "daily vote limiter",
  );

  const closed = await getPool()!.query<{ id: string }>(
    `INSERT INTO rs_challenges
       (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at)
     VALUES ($1, $2, 92, 'PAGE-055 Closed', 'track-rs-proof', 'closed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day')
     RETURNING id`,
    [seasonId, categoryId],
  );
  const closedEnter = await json(`/api/rising-stars/challenges/${closed.rows[0]!.id}/enter`, {
    method: "POST",
    headers: auth(accountA.token),
    body: JSON.stringify({ videoId }),
  });
  assert(
    (closedEnter.body as { message?: string }).message === "CHALLENGE_CLOSED" || closedEnter.status === 409,
    "closed challenge protection",
  );

  const isolatedBadges = await json(`/api/rising-stars/badges/user/${accountA.id}`, {
    headers: auth(accountB.token),
  });
  assert(isolatedBadges.status === 200, "public badge lookup");
  assert(Array.isArray((isolatedBadges.body as { badges: unknown[] }).badges), "badge array");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(accountA.token) });
  assert(logout.status === 200, "logout");
  assert((await json("/api/rising-stars/badges/me", { headers: auth(accountA.token) })).status === 401, "post-logout");

  console.log("PAGE-055 RISING STARS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        activeSeason: true,
        categoriesRegionsChallenges: true,
        standingsTeamsRewardsBadges: true,
        page056Handoff: true,
        forgedStandingRejected: true,
        entryIdempotent: true,
        forgedOwnerIgnored: true,
        selfVoteBlocked: true,
        voteLimiter: true,
        closedChallengeBlocked: true,
        neonRsPersistence: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-055 RISING STARS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
