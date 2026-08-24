import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../../middleware/auth.js";
import { issueCallToken } from "../calls/token.js";
import { AppError } from "../../middleware/errors.js";
import { queryDiscoverPage, queryDiscoverSearch } from "../discover/query.js";
import { querySearchPage } from "../search/query.js";
import { normalizeSearchCategory } from "../../../shared/searchCategories.js";
import {
  listInboxActivity,
  listInboxCircles,
  listInboxNotices,
  listInboxThreads,
  listLiveShareRequests,
} from "../inbox/query.js";
import {
  dmRealtimePayloads,
  getThreadDetail,
  isBlockedEitherWay,
  listThreadMessages,
  markThreadRead,
  sendThreadMessage,
} from "../inbox/thread.js";
import { logger } from "../../infra/logger.js";
import { handleAdminDashboard, handleAdminDau } from "../admin/dashboard.js";
import { handleAdminEconomy, handleAdminPatchGiftCatalog } from "../admin/economy.js";
import { handleAdminMonetisation, handleAdminPatchMonetisationConfig } from "../admin/monetisation.js";
import { handleAdminIapPurchases, handleAdminShopPurchases } from "../admin/purchases.js";
import { handleAdminBan, handleAdminUnban, handleAdminUsers } from "../admin/users.js";
import { handleAdminPatchReport, handleAdminReports } from "../admin/reports.js";
import {
  handleAdminChargeback,
  handleAdminUnfreeze,
  handleAdminWithdrawalAction,
  handleAdminWithdrawals,
} from "../admin/withdrawals.js";
import {
  handleAdminRisingStarsAudit,
  handleAdminRisingStarsAwardBadge,
  handleAdminRisingStarsChallenges,
  handleAdminRisingStarsCreateBadge,
  handleAdminRisingStarsCreateCategory,
  handleAdminRisingStarsCreateChallenge,
  handleAdminRisingStarsCreateRegion,
  handleAdminRisingStarsCreateRewardDefinition,
  handleAdminRisingStarsCreateSeason,
  handleAdminRisingStarsDisqualify,
  handleAdminRisingStarsFreeze,
  handleAdminRisingStarsGrantReward,
  handleAdminRisingStarsSeasons,
  handleAdminRisingStarsSetChallengeStatus,
  handleAdminRisingStarsSnapshot,
} from "../admin/risingStars.js";
import {
  handleAdminProgressionArchiveMission,
  handleAdminProgressionAudit,
  handleAdminProgressionBattleCaps,
  handleAdminProgressionConfig,
  handleAdminProgressionDailyRewards,
  handleAdminProgressionFeatureFlags,
  handleAdminProgressionLevels,
  handleAdminProgressionMissions,
  handleAdminProgressionPatchConfig,
  handleAdminProgressionPatchFeatureFlags,
  handleAdminProgressionPatchMission,
  handleAdminProgressionPutBattleCaps,
  handleAdminProgressionPutDailyPolicy,
  handleAdminProgressionPutDailyReward,
  handleAdminProgressionPutLevel,
  handleAdminProgressionStarterAdjust,
  handleAdminProgressionUser,
  handleAdminProgressionXpAdjust,
} from "../admin/progression.js";

export const inboxRouter = Router();
export const discoverRouter = Router();
export const callsRouter = Router();
export const extraAdminRouter = Router();

function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

async function ensureInboxThread(req: AuthedRequest, res: import("express").Response): Promise<void> {
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!userId || userId === req.userId) throw new AppError("validation_error", "Invalid recipient", 400);
  if (await isBlockedEitherWay(req.userId as string, userId)) {
    throw new AppError("forbidden", "You cannot message this user.", 403);
  }
  const live = await isLiveNeonSchema();
  if (live) {
    const existing = await getPool().query<{ id: string }>(
      `SELECT id FROM chat_threads
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
       LIMIT 1`,
      [req.userId, userId],
    );
    if (existing.rows[0]) {
      res.json({ id: existing.rows[0].id });
      return;
    }
    const created = await getPool().query<{ id: string }>(
      `INSERT INTO chat_threads (user1_id, user2_id, last_message, last_at, created_at)
       VALUES ($1, $2, '', NOW(), NOW())
       RETURNING id`,
      [req.userId, userId],
    );
    res.status(201).json({ id: created.rows[0].id });
    return;
  }
  const existing = await getPool().query<{ id: string }>(
    `SELECT t.id
     FROM chat_threads t
     JOIN chat_thread_members a ON a.thread_id = t.id AND a.user_id = $1
     JOIN chat_thread_members b ON b.thread_id = t.id AND b.user_id = $2
     LIMIT 1`,
    [req.userId, userId],
  );
  if (existing.rows[0]) {
    res.json({ id: existing.rows[0].id });
    return;
  }
  const created = await withTransaction(async (client) => {
    const thread = await client.query<{ id: string }>(`INSERT INTO chat_threads DEFAULT VALUES RETURNING id`);
    const id = thread.rows[0].id;
    await client.query(`INSERT INTO chat_thread_members (thread_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      id,
      req.userId,
      userId,
    ]);
    return id;
  });
  res.status(201).json({ id: created });
}

inboxRouter.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ threads: await listInboxThreads(req.userId as string) });
});

inboxRouter.get("/circles", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ users: await listInboxCircles(req.userId as string) });
});

inboxRouter.get("/notices", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await listInboxNotices(req.userId as string));
});

inboxRouter.get("/live-share-requests", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ items: await listLiveShareRequests(req.userId as string) });
});

inboxRouter.post("/threads", requireAuth, async (req: AuthedRequest, res) => {
  await ensureInboxThread(req, res);
});



inboxRouter.delete("/threads/:threadId", requireAuth, async (req: AuthedRequest, res) => {
  const threadId = param(req, "threadId");
  if (await isLiveNeonSchema()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        `SELECT 1 FROM chat_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) FOR UPDATE`,
        [threadId, req.userId],
      );
      if (!owned.rows[0]) {
        await client.query("ROLLBACK");
        throw new AppError("not_found", "Thread not found", 404);
      }
      await client.query(`DELETE FROM messages WHERE thread_id = $1`, [threadId]);
      await client.query(
        `DELETE FROM chat_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`,
        [threadId, req.userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      client.release();
    }
    res.json({ ok: true });
    return;
  }
  const result = await getPool().query(
    `DELETE FROM chat_threads t
     USING chat_thread_members m
     WHERE t.id = $1 AND m.thread_id = t.id AND m.user_id = $2`,
    [threadId, req.userId],
  );
  if (!result.rowCount) throw new AppError("not_found", "Thread not found", 404);
  res.json({ ok: true });
});

inboxRouter.get("/threads/:threadId", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ thread: await getThreadDetail(req.userId as string, param(req, "threadId")) });
});

inboxRouter.get("/threads/:threadId/messages", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ messages: await listThreadMessages(req.userId as string, param(req, "threadId")) });
});

inboxRouter.post("/threads/:threadId/read", requireAuth, async (req: AuthedRequest, res) => {
  await markThreadRead(req.userId as string, param(req, "threadId"));
  res.json({ ok: true });
});

inboxRouter.post("/threads/:threadId/messages", requireAuth, async (req: AuthedRequest, res) => {
  const threadId = param(req, "threadId");
  const rawBody = typeof req.body?.body === "string" ? req.body.body : "";
  const clientRequestId = typeof req.body?.clientRequestId === "string" ? req.body.clientRequestId : undefined;
  const result = await sendThreadMessage(req.userId as string, threadId, rawBody, clientRequestId);
  if (result.created) {
    try {
      const { sendToUserGlobal } = await import("../../websocket/index.js");
      const payloads = dmRealtimePayloads(threadId, result.message, req.userId as string);
      await sendToUserGlobal(req.userId as string, "dm_message", payloads.message);
      await sendToUserGlobal(result.otherUserId, "dm_message", payloads.message);
      await sendToUserGlobal(req.userId as string, "dm_thread_updated", payloads.threadUpdated);
      await sendToUserGlobal(result.otherUserId, "dm_thread_updated", payloads.threadUpdated);
    } catch (error) {
      logger.warn({ err: error, threadId }, "dm fanout skipped");
    }
  }
  res.status(result.created ? 201 : 200).json({ message: result.message });
});

discoverRouter.get("/discover/search", async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json({ users: [], videos: [] });
    return;
  }
  res.json(await queryDiscoverSearch(req.userId ?? null, q));
});

discoverRouter.get("/discover", async (req: AuthedRequest, res) => {
  res.json(await queryDiscoverPage(req.userId ?? null));
});

discoverRouter.get("/search", async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const category = normalizeSearchCategory(typeof req.query.category === "string" ? req.query.category : "All");
  res.json(await querySearchPage(req.userId ?? null, q, category));
});

discoverRouter.get("/activity", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await listInboxActivity(req.userId as string));
});

callsRouter.post("/:callId/token", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await issueCallToken(req.userId as string, param(req, "callId")));
});

extraAdminRouter.get("/dashboard", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminDashboard(req, res).catch(next);
});

extraAdminRouter.get("/stats/dau", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminDau(req, res).catch(next);
});

extraAdminRouter.post("/users/:userId/ban", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminBan(req, res).catch(next);
});

extraAdminRouter.delete("/users/:userId/ban", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminUnban(req, res).catch(next);
});

extraAdminRouter.patch("/reports/:reportId", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminPatchReport(req, res).catch(next);
});

extraAdminRouter.get("/users", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminUsers(req, res).catch(next);
});

extraAdminRouter.get("/reports", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminReports(req, res).catch(next);
});

extraAdminRouter.get("/withdrawals", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawals(req, res).catch(next);
});

extraAdminRouter.post("/withdrawals/:id/review", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawalAction(req, res, "review").catch(next);
});

extraAdminRouter.post("/withdrawals/:id/approve", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawalAction(req, res, "approve").catch(next);
});

extraAdminRouter.post("/withdrawals/:id/reject", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawalAction(req, res, "reject").catch(next);
});

extraAdminRouter.post("/withdrawals/:id/cancel", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawalAction(req, res, "cancel").catch(next);
});

extraAdminRouter.post("/withdrawals/:id/mark-paid", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminWithdrawalAction(req, res, "mark-paid").catch(next);
});

extraAdminRouter.post("/chargeback", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminChargeback(req, res).catch(next);
});

extraAdminRouter.post("/unfreeze/:userId", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminUnfreeze(req, res).catch(next);
});


extraAdminRouter.get("/iap-purchases", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminIapPurchases(req, res).catch(next);
});

extraAdminRouter.get("/shop-purchases", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminShopPurchases(req, res).catch(next);
});

extraAdminRouter.get("/rising-stars/seasons", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsSeasons(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/seasons", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateSeason(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/categories", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateCategory(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/regions", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateRegion(req, res).catch(next);
});

extraAdminRouter.get("/rising-stars/challenges", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsChallenges(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/challenges", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateChallenge(req, res).catch(next);
});

extraAdminRouter.patch("/rising-stars/challenges/:id/status", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsSetChallengeStatus(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/challenges/:id/freeze", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsFreeze(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/challenges/:id/snapshot", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsSnapshot(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/entries/:id/disqualify", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsDisqualify(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/badges", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateBadge(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/badges/award", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsAwardBadge(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/rewards/definitions", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsCreateRewardDefinition(req, res).catch(next);
});

extraAdminRouter.post("/rising-stars/rewards/grants", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsGrantReward(req, res).catch(next);
});

extraAdminRouter.get("/rising-stars/audit", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminRisingStarsAudit(req, res).catch(next);
});

extraAdminRouter.get("/progression/config", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionConfig(req, res).catch(next);
});
extraAdminRouter.patch("/progression/config", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPatchConfig(req, res).catch(next);
});
extraAdminRouter.get("/progression/levels", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionLevels(req, res).catch(next);
});
extraAdminRouter.put("/progression/levels", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPutLevel(req, res).catch(next);
});
extraAdminRouter.get("/progression/users/:userId", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionUser(req, res).catch(next);
});
extraAdminRouter.post("/progression/xp-adjustments", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionXpAdjust(req, res).catch(next);
});
extraAdminRouter.post("/progression/starter-adjustments", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionStarterAdjust(req, res).catch(next);
});
extraAdminRouter.get("/progression/missions", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionMissions(req, res).catch(next);
});
extraAdminRouter.patch("/progression/missions/:id", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPatchMission(req, res).catch(next);
});
extraAdminRouter.post("/progression/missions/:id/archive", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionArchiveMission(req, res).catch(next);
});
extraAdminRouter.get("/progression/daily-rewards", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionDailyRewards(req, res).catch(next);
});
extraAdminRouter.put("/progression/daily-rewards", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPutDailyReward(req, res).catch(next);
});
extraAdminRouter.put("/progression/daily-rewards/policy", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPutDailyPolicy(req, res).catch(next);
});
extraAdminRouter.get("/progression/battle-energy-caps", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionBattleCaps(req, res).catch(next);
});
extraAdminRouter.put("/progression/battle-energy-caps", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPutBattleCaps(req, res).catch(next);
});
extraAdminRouter.get("/progression/feature-flags", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionFeatureFlags(req, res).catch(next);
});
extraAdminRouter.patch("/progression/feature-flags", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionPatchFeatureFlags(req, res).catch(next);
});
extraAdminRouter.get("/progression/audit-history", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminProgressionAudit(req, res).catch(next);
});

extraAdminRouter.get("/monetisation", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminMonetisation(req, res).catch(next);
});

extraAdminRouter.patch("/monetisation/config", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminPatchMonetisationConfig(req, res).catch(next);
});

extraAdminRouter.get("/economy", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminEconomy(req, res).catch(next);
});

extraAdminRouter.patch("/gifts/catalog/:giftId", requireAuth, requireAdmin, (req, res, next) => {
  void handleAdminPatchGiftCatalog(req, res).catch(next);
});
