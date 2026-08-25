import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { sendGiftBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta } from "../wallet/ledger.js";
import { creditTestCoinBalance, debitTestCoinBalance } from "../testCoins/store.js";
import { AppError } from "../../middleware/errors.js";
import { logger } from "../../infra/logger.js";
import { applyGiftToBattle, publishRoom } from "../battle/runtime.js";
import { consumePaidLots, creditPaidGiftGbp } from "./settle.js";
import { incrementGiftGoal } from "./goal.js";
import { bumpEngagement } from "../engagement/progress.js";
import { bumpAchievement } from "../engagement/achievements.js";
import { recordCreatorGiftProgress } from "../engagement/collections.js";
import { addMvpPoints } from "../engagement/mvp.js";
import { loadPublicGiftsCatalog } from "./catalog.js";
import { readPublicGiftsCatalogCache, writePublicGiftsCatalogCache } from "./catalogCache.js";

const router = Router();

async function runBestEffortRealtimeSideEffects(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    if (error instanceof AppError && error.code === "unavailable") {
      logger.warn({ err: error }, "gift realtime side-effects unavailable");
      return;
    }
    throw error;
  }
}

router.get("/", async (_req, res) => {
  const cached = await readPublicGiftsCatalogCache();
  if (cached) {
    res.json({ gifts: cached });
    return;
  }
  const gifts = await loadPublicGiftsCatalog();
  await writePublicGiftsCatalogCache(gifts);
  res.json({ gifts });
});

router.post("/send", requireAuth, async (req: AuthedRequest, res) => {
  const body = sendGiftBodySchema.parse(req.body);

  
  if (body.bucket === "test") {
    const gift = await getPool().query<{ id: string; coin_cost: number; name: string; animation_url: string | null }>(
      `SELECT id, coin_cost, name, animation_url FROM gifts WHERE id = $1 AND active = TRUE`,
      [body.giftId],
    );
    if (!gift.rows[0]) throw new AppError("not_found", "Gift not found", 404);
    const cost = gift.rows[0].coin_cost;
    const existing = await getPool().query<{ id: string }>(
        `SELECT id FROM gift_transactions WHERE idempotency_key = $1`,
        [body.idempotencyKey],
      );
      if (existing.rows[0]) {
        res.json({ transactionId: existing.rows[0].id, coinCost: cost });
        return;
      }
    const debit = await debitTestCoinBalance(req.userId as string, cost);
    if (!debit.ok) {
      if (debit.reason === "unavailable") {
        throw new AppError("unavailable", "Test coin store unavailable", 503);
      }
      throw new AppError("insufficient_balance", "Not enough test coins", 400);
    }
    let transactionId: string;
    try {
        const inserted = await getPool().query<{ id: string }>(
          `INSERT INTO gift_transactions (sender_id, recipient_id, gift_id, stream_id, coin_cost, bucket, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
          [req.userId, body.recipientId, body.giftId, body.streamId, cost, body.bucket, body.idempotencyKey],
        );
        transactionId = inserted.rows[0].id;
      } catch (error) {
        await creditTestCoinBalance(req.userId as string, cost);
        throw error;
      }
    const stream = await getPool().query<{ room_id: string }>(
          `SELECT room_id FROM live_streams WHERE id = $1`,
          [body.streamId],
        );
    const roomId = stream.rows[0]?.room_id ?? (null);
    if (roomId) {
      await applyGiftToBattle(roomId, body.recipientId, cost);
      await publishRoom(roomId, "gift_sent", {
        transactionId,
        giftId: body.giftId,
        giftName: gift.rows[0].name,
        senderId: req.userId,
        recipientId: body.recipientId,
        coinCost: cost,
        animationUrl: gift.rows[0].animation_url,
      });
    }
    res.json({ transactionId, coinCost: cost });
    return;
  }
  
  const result = await withTransaction(async (client) => {
    const gift = await client.query<{ id: string; coin_cost: number; name: string; animation_url: string | null }>(
      `SELECT id, coin_cost, name, animation_url FROM gifts WHERE id = $1 AND active = TRUE`,
      [body.giftId],
    );
    if (!gift.rows[0]) throw new AppError("not_found", "Gift not found", 404);
    const cost = gift.rows[0].coin_cost;
    await applyWalletDelta(client, {
      userId: req.userId as string,
      bucket: body.bucket,
      delta: -cost,
      reason: "gift_send",
      idempotencyKey: body.idempotencyKey,
      refType: "gift",
      refId: body.giftId,
    });
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO gift_transactions (sender_id, recipient_id, gift_id, stream_id, coin_cost, bucket, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.userId, body.recipientId, body.giftId, body.streamId, cost, body.bucket, body.idempotencyKey],
    );
    let creatorPence = 0;
    if (body.bucket === "paid") {
      const lots = await consumePaidLots(client, req.userId as string, cost);
      const credited = await creditPaidGiftGbp(client, {
        creatorId: body.recipientId,
        senderId: req.userId as string,
        giftTxnId: inserted.rows[0].id,
        coins: cost,
        pence: lots.pence,
      });
      creatorPence = credited.creatorPence;
    }
    const stream = await client.query<{ room_id: string }>(
      `SELECT room_id FROM live_streams WHERE id = $1`,
      [body.streamId],
    );
    return {
      transactionId: inserted.rows[0].id,
      coinCost: cost,
      roomId: stream.rows[0]?.room_id ?? null,
      giftName: gift.rows[0].name,
      animationUrl: gift.rows[0].animation_url,
      creatorPence,
    };
  });
  await bumpEngagement(req.userId as string, "gift", 1);
  if (body.bucket === "paid" || body.bucket === "promo") {
    await addMvpPoints(req.userId as string, result.coinCost, {
      roomId: result.roomId ?? "",
      hostUserId: body.recipientId,
      source: body.bucket === "paid" ? "paid_gift" : "promo_gift",
      giftTransactionId: result.transactionId,
    });
    await bumpAchievement(req.userId as string, "gifts_sent", 1);
    await recordCreatorGiftProgress(req.userId as string, body.recipientId, 1);
  }
  if (result.roomId) {
    await runBestEffortRealtimeSideEffects(async () => {
      await applyGiftToBattle(result.roomId, body.recipientId, result.coinCost);
      if (body.bucket === "paid") {
        const goal = await incrementGiftGoal(result.roomId, body.giftId, 1);
        if (goal) {
          await publishRoom(result.roomId, "gift_goal_sync", goal);
        }
      }
      await publishRoom(result.roomId, "gift_sent", {
        transactionId: result.transactionId,
        giftId: body.giftId,
        giftName: result.giftName,
        senderId: req.userId,
        recipientId: body.recipientId,
        coinCost: result.coinCost,
        animationUrl: result.animationUrl,
      });
    });
  }
  res.json({ transactionId: result.transactionId, coinCost: result.coinCost });
});

export default router;
