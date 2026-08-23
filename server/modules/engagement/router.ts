import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import {
  listChestsForUser,
  listCreatorCardsForUser,
  listStickersForUser,
  openTreasureChestForUser,
} from "./collections.js";
import { claimDailyLoginForUser, getDailyLoginForUser } from "./dailyLogin.js";
import { isEngagementHubEnabled } from "./flags.js";
import { resolveEngagementFlags } from "./settings.js";
import { getHubSummary } from "./hub.js";
import { claimMissionForUser, listMissionsForUser } from "./missions.js";
import { getFanLevelForUser } from "./progression.js";
import { getMvpLeaderboard, normalizeMvpPeriod } from "./mvp.js";
import { listAchievementsForUser } from "./achievements.js";
import { getRewardWalletForUser } from "./rewardWallet.js";

const router = Router();

async function requireEngagementHub(): Promise<void> {
  if (!isEngagementHubEnabled()) {
    throw new AppError("ENGAGEMENT_HUB_DISABLED", "ENGAGEMENT_HUB_DISABLED", 404);
  }
  const flags = await resolveEngagementFlags();
  if (flags.engagementHubEnabled !== true) {
    throw new AppError("ENGAGEMENT_HUB_DISABLED", "ENGAGEMENT_HUB_DISABLED", 404);
  }
}

router.get("/hub", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ hub: await getHubSummary(req.userId as string) });
});

router.get("/missions", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ missions: await listMissionsForUser(req.userId as string) });
});

router.post("/missions/:id/claim", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json(await claimMissionForUser(req.userId as string, routeParam(req, "id")));
});

router.get("/fan-level", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ fan_level: await getFanLevelForUser(req.userId as string) });
});

router.get("/mvp", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  const period = normalizeMvpPeriod(req.query.period);
  res.json({
    period,
    leaderboard: await getMvpLeaderboard(period, Number(req.query.limit) || 50),
    viewer_id: req.userId,
  });
});

router.get("/achievements", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ achievements: await listAchievementsForUser(req.userId as string) });
});

router.get("/wallet", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ wallet: await getRewardWalletForUser(req.userId as string) });
});

router.get("/daily-login", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json({ daily: await getDailyLoginForUser(req.userId as string) });
});

router.post("/daily-login/claim", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json(await claimDailyLoginForUser(req.userId as string));
});

router.get("/treasure", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json(await listChestsForUser(req.userId as string));
});

router.post("/treasure/spawn", requireAuth, async () => {
  await requireEngagementHub();
  throw new AppError("SPAWN_SERVER_ONLY", "Treasure chests spawn from LIVE activity only.", 403);
});

router.post("/treasure/:chestId/open", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json(await openTreasureChestForUser(req.userId as string, routeParam(req, "chestId")));
});

router.get("/stickers", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  res.json(await listStickersForUser(req.userId as string));
});

router.get("/creator-cards", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  await requireEngagementHub();
  const creatorId =
    typeof req.query.creatorId === "string" && req.query.creatorId.trim()
      ? req.query.creatorId.trim()
      : undefined;
  res.json(await listCreatorCardsForUser(req.userId as string, creatorId));
});

export default router;
