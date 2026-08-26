import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { sendGiftBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta, readWalletBalances } from "../wallet/ledger.js";
import { AppError } from "../../middleware/errors.js";
import { applyGiftToBattle, publishRoom } from "../battle/runtime.js";
import { consumePaidLots, creditPaidGiftGbp } from "./settle.js";
import { incrementGiftGoal } from "./goal.js";
import { bumpEngagement } from "../engagement/progress.js";

const router = Router();

router.get("/", async (_req, res) => {
  const { rows } = await getPool().query<{
    id: string;
    name: string;
    coin_cost: number;
    animation_url: string | null;
  }>(`SELECT id, name, coin_cost, animation_url FROM gifts WHERE active = TRUE ORDER BY sort_order`);
  res.json({
    gifts: rows.map((row) => ({
      id: row.id,
      name: row.name,
      coinCost: row.coin_cost,
      animationUrl: row.animation_url,
    })),
  });
});

router.post("/send", requireAuth, async (req: AuthedRequest, res) => {
  const body = sendGiftBodySchema.parse(req.body);
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
  if (body.bucket !== "test") {
    await bumpEngagement(req.userId as string, "gift", 1);
  }
  if (result.roomId) {
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
  }
  res.json({ transactionId: result.transactionId, coinCost: result.coinCost });
});

router.get("/wallet", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await readWalletBalances(req.userId as string));
});

export default router;
