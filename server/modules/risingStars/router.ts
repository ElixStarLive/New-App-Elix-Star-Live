import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { risingStarsAttachLiveBodySchema, risingStarsCreateTeamBodySchema } from "../../../shared/contracts/risingStars.js";
import {
  getCurrentRisingStarsSeason,
  getRisingStarsSeasonById,
  listRisingStarsBadgesForUser,
  listRisingStarsCategories,
  listRisingStarsChallenges,
  listRisingStarsRegions,
  listRisingStarsRewards,
  listRisingStarsStandings,
  listRisingStarsTeams,
} from "./hub.js";
import {
  attachRisingStarsLive,
  createRisingStarsTeam,
  enterRisingStarsChallenge,
  getRisingStarsChallengeDetail,
  getRisingStarsChallengeLive,
  joinRisingStarsTeam,
  listRisingStarsChallengeEntries,
  listRisingStarsChallengeLeaderboard,
  voteRisingStarsEntry,
  withdrawRisingStarsEntry,
} from "./challenge.js";
import {
  assertRisingStarsEnterLimiter,
  assertRisingStarsVoteLimiter,
  assertRisingStarsVoteVelocity,
} from "./limiters.js";

const router = Router();

function queryString(req: { query: Record<string, unknown> }, key: string): string {
  const raw = req.query[key];
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

function queryWeek(req: { query: Record<string, unknown> }): number | undefined {
  const raw = queryString(req, "week");
  if (!raw) return undefined;
  const week = Number(raw);
  if (!Number.isFinite(week)) throw new AppError("validation_error", "week is invalid", 400);
  return Math.trunc(week);
}

router.get("/seasons/current", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ season: await getCurrentRisingStarsSeason() });
});

router.get("/seasons/:id/standings", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ standings: await listRisingStarsStandings(routeParam(req, "id")) });
});

router.get("/seasons/:id", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const season = await getRisingStarsSeasonById(routeParam(req, "id"));
  if (!season) throw new AppError("not_found", "Season not found", 404);
  res.json({ season });
});

router.get("/categories", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const seasonId = queryString(req, "seasonId");
  if (!seasonId) throw new AppError("validation_error", "seasonId required", 400);
  res.json({ categories: await listRisingStarsCategories(seasonId) });
});

router.get("/regions", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const seasonId = queryString(req, "seasonId");
  if (!seasonId) throw new AppError("validation_error", "seasonId required", 400);
  res.json({ regions: await listRisingStarsRegions(seasonId) });
});

router.get("/challenges", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const seasonId = queryString(req, "seasonId");
  if (!seasonId) throw new AppError("validation_error", "seasonId required", 400);
  const categoryId = queryString(req, "categoryId");
  const regionId = queryString(req, "regionId");
  res.json({
    challenges: await listRisingStarsChallenges({
      seasonId,
      categoryId: categoryId || undefined,
      regionId: regionId || undefined,
      week: queryWeek(req),
    }),
  });
});

router.get("/teams", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const seasonId = queryString(req, "seasonId");
  if (!seasonId) throw new AppError("validation_error", "seasonId required", 400);
  const regionId = queryString(req, "regionId");
  res.json({ teams: await listRisingStarsTeams(seasonId, regionId || undefined) });
});

router.get("/rewards", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const seasonId = queryString(req, "seasonId");
  if (!seasonId) throw new AppError("validation_error", "seasonId required", 400);
  res.json({ rewards: await listRisingStarsRewards(seasonId) });
});

router.get("/badges/me", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ badges: await listRisingStarsBadgesForUser(req.userId as string) });
});

router.get("/badges/user/:userId", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ badges: await listRisingStarsBadgesForUser(routeParam(req, "userId")) });
});

router.get("/challenges/:id", async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getRisingStarsChallengeDetail(routeParam(req, "id"), req.userId ?? null));
});

router.get("/challenges/:id/entries", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ entries: await listRisingStarsChallengeEntries(routeParam(req, "id")) });
});

router.get("/challenges/:id/leaderboard", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ leaderboard: await listRisingStarsChallengeLeaderboard(routeParam(req, "id")) });
});

router.get("/challenges/:id/live", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ live: await getRisingStarsChallengeLive(routeParam(req, "id")) });
});

router.post("/challenges/:id/enter", requireAuth, async (req: AuthedRequest, res) => {
  await assertRisingStarsEnterLimiter(req.userId as string);
  const videoId = typeof req.body?.videoId === "string" ? req.body.videoId : "";
  const teamId = typeof req.body?.teamId === "string" ? req.body.teamId : null;
  if (!videoId.trim()) throw new AppError("validation_error", "videoId required", 400);
  const entry = await enterRisingStarsChallenge({
    challengeId: routeParam(req, "id"),
    userId: req.userId as string,
    videoId,
    teamId,
  });
  res.status(201).json({ entry });
});

router.post("/challenges/:id/live/attach", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = risingStarsAttachLiveBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("validation_error", "Invalid body", 400);
  const challenge = await attachRisingStarsLive({
    challengeId: routeParam(req, "id"),
    userId: req.userId as string,
    phase: parsed.data.phase,
    roomId: parsed.data.roomId,
  });
  res.json({ challenge });
});

router.delete("/entries/:id", requireAuth, async (req: AuthedRequest, res) => {
  await withdrawRisingStarsEntry(routeParam(req, "id"), req.userId as string);
  res.json({ ok: true });
});

router.post("/entries/:id/vote", requireAuth, async (req: AuthedRequest, res) => {
  await assertRisingStarsVoteLimiter(req.userId as string);
  await assertRisingStarsVoteVelocity(req.userId as string);
  const result = await voteRisingStarsEntry(routeParam(req, "id"), req.userId as string);
  res.json({ ok: true, ...result });
});

router.post("/teams", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = risingStarsCreateTeamBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError("validation_error", "Invalid body", 400);
  const team = await createRisingStarsTeam({
    seasonId: parsed.data.seasonId,
    regionId: parsed.data.regionId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    captainUserId: req.userId as string,
  });
  res.status(201).json({ team });
});

router.post("/teams/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  await joinRisingStarsTeam(routeParam(req, "id"), req.userId as string);
  res.json({ ok: true });
});

export default router;
