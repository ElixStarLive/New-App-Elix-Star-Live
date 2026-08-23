import type { PoolClient } from "pg";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";

export async function consumePaidLots(
  client: PoolClient,
  userId: string,
  coins: number,
): Promise<{ pence: number }> {
  if (coins <= 0) return { pence: 0 };
  const live = await isLiveNeonSchema();
  const table = live ? "elix_paid_coin_lots" : "paid_coin_lots";
  const lots = await client.query<{
    id: string;
    coins_remaining: string;
    coins_original: string;
    gross_pence: string;
  }>(
    `SELECT id, coins_remaining, coins_original, gross_pence
     FROM ${table}
     WHERE user_id = $1 AND coins_remaining > 0 AND settlement_status = 'settled'
     ORDER BY created_at ASC
     FOR UPDATE`,
    [userId],
  );
  let remaining = coins;
  let pence = 0;
  for (const lot of lots.rows) {
    if (remaining <= 0) break;
    const have = Number(lot.coins_remaining);
    const orig = Number(lot.coins_original);
    const gross = Number(lot.gross_pence);
    const take = Math.min(have, remaining);
    const share = orig > 0 ? Math.floor((gross * take) / orig) : 0;
    pence += share;
    remaining -= take;
    await client.query(`UPDATE ${table} SET coins_remaining = coins_remaining - $2 WHERE id = $1`, [
      lot.id,
      take,
    ]);
  }
  return { pence };
}

export function splitGiftPence(pence: number, creatorPct: number): {
  creatorPence: number;
  platformPence: number;
} {
  if (pence <= 0) return { creatorPence: 0, platformPence: 0 };
  const creatorPence = Math.floor((pence * creatorPct) / 100);
  return { creatorPence, platformPence: pence - creatorPence };
}

export async function creditPaidGiftGbp(
  client: PoolClient,
  params: {
    creatorId: string;
    senderId: string;
    giftTxnId: string;
    coins: number;
    pence: number;
  },
): Promise<{ creatorPence: number; platformPence: number }> {
  if (params.pence <= 0) return { creatorPence: 0, platformPence: 0 };
  const live = await isLiveNeonSchema();
  if (live) {
    const cfg = await client.query<{ gift_creator_pct: number; gift_settlement_hours: number }>(
      `SELECT gift_creator_pct, gift_settlement_hours FROM elix_monetisation_config WHERE id = 1`,
    ).catch(() => ({ rows: [] as { gift_creator_pct: number; gift_settlement_hours: number }[] }));
    const creatorPct = cfg.rows[0]?.gift_creator_pct ?? 60;
    const hours = cfg.rows[0]?.gift_settlement_hours ?? 72;
    const split = splitGiftPence(params.pence, creatorPct);
    try {
      await client.query(
        `INSERT INTO elix_creator_earnings (creator_id, sender_id, gift_txn_id, coins, amount_pence, status, available_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + ($6::text || ' hours')::interval)`,
        [params.creatorId, params.senderId, params.giftTxnId, params.coins, split.creatorPence, String(hours)],
      );
      await client.query(
        `INSERT INTO elix_creator_wallet_gbp (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [params.creatorId],
      );
      await client.query(
        `UPDATE elix_creator_wallet_gbp SET pending_pence = pending_pence + $2, updated_at = NOW() WHERE user_id = $1`,
        [params.creatorId, split.creatorPence],
      );
      await client.query(
        `UPDATE elix_platform_wallet_gbp SET available_pence = available_pence + $1 WHERE id = 1`,
        [split.platformPence],
      );
      await client.query(
        `INSERT INTO elix_financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ($1, $2, 'gift_creator_pending', $3, 'gift', $4)`,
        [`creator:${params.creatorId}`, split.creatorPence, `gift_creator:${params.giftTxnId}`, params.giftTxnId],
      );
      await client.query(
        `INSERT INTO elix_financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ($1, $2, 'gift_platform', $3, 'gift', $4)`,
        ["platform", split.platformPence, `gift_platform:${params.giftTxnId}`, params.giftTxnId],
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("unavailable", "GIFT_SETTLEMENT_UNAVAILABLE", 503);
    }
    return split;
  }

  const cfg = await client.query<{
    gift_creator_pct: number;
    gift_settlement_hours: number;
  }>(`SELECT gift_creator_pct, gift_settlement_hours FROM monetisation_config WHERE id = 1`);
  const creatorPct = cfg.rows[0]?.gift_creator_pct ?? 60;
  const hours = cfg.rows[0]?.gift_settlement_hours ?? 72;
  const split = splitGiftPence(params.pence, creatorPct);
  await client.query(
    `INSERT INTO creator_earnings (creator_id, sender_id, gift_txn_id, coins, amount_pence, status, available_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + ($6::text || ' hours')::interval)`,
    [params.creatorId, params.senderId, params.giftTxnId, params.coins, split.creatorPence, String(hours)],
  );
  await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
    params.creatorId,
  ]);
  await client.query(
    `UPDATE creator_wallet_gbp SET pending_pence = pending_pence + $2, updated_at = NOW() WHERE user_id = $1`,
    [params.creatorId, split.creatorPence],
  );
  await client.query(`UPDATE platform_wallet_gbp SET available_pence = available_pence + $1 WHERE id = 1`, [
    split.platformPence,
  ]);
  await client.query(
    `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
     VALUES ($1, $2, 'gift_creator_pending', $3, 'gift', $4)`,
    [`creator:${params.creatorId}`, split.creatorPence, `gift_creator:${params.giftTxnId}`, params.giftTxnId],
  );
  await client.query(
    `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
     VALUES ($1, $2, 'gift_platform', $3, 'gift', $4)`,
    ["platform", split.platformPence, `gift_platform:${params.giftTxnId}`, params.giftTxnId],
  );
  return split;
}

export async function matureCreatorEarnings(client: PoolClient): Promise<number> {
  const live = await isLiveNeonSchema();
  const earningsTable = live ? "elix_creator_earnings" : "creator_earnings";
  const walletTable = live ? "elix_creator_wallet_gbp" : "creator_wallet_gbp";
  const due = await client.query<{ id: string; creator_id: string; amount_pence: string }>(
    `SELECT id, creator_id, amount_pence
     FROM ${earningsTable}
     WHERE status = 'pending' AND available_at <= NOW()
     FOR UPDATE SKIP LOCKED
     LIMIT 200`,
  );
  for (const row of due.rows) {
    const amount = Number(row.amount_pence);
    await client.query(
      `UPDATE ${walletTable}
       SET pending_pence = GREATEST(pending_pence - $2, 0),
           available_pence = available_pence + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [row.creator_id, amount],
    );
    await client.query(`UPDATE ${earningsTable} SET status = 'available' WHERE id = $1`, [row.id]);
  }
  return due.rows.length;
}
