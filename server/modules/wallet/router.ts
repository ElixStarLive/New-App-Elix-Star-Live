import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { withdrawalBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta, balancesFromRow, type WalletRow } from "./ledger.js";
import { creditVerifiedIap } from "../iap/credit.js";
import { env } from "../../infra/env.js";

const router = Router();

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.equals(right);
}

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<WalletRow>(
    `SELECT paid_coins, promo_coins, starter_coins, test_coins FROM wallet_balances WHERE user_id = $1`,
    [req.userId],
  );
  if (!rows[0]) throw new AppError("not_found", "Wallet not found", 404);
  res.json(balancesFromRow(rows[0]));
});

router.post("/iap/verify", requireAuth, async (req: AuthedRequest, res) => {
  const coins = await creditVerifiedIap(req.userId as string, req.body);
  res.json({ ok: true, coins });
});

router.post("/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  const body = withdrawalBodySchema.parse(req.body);
  await withTransaction(async (client) => {
    const wallet = await client.query<{ available_pence: string }>(
      `SELECT available_pence FROM creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
      [req.userId],
    );
    const available = Number(wallet.rows[0]?.available_pence ?? 0);
    if (available < body.amountPence) {
      throw new AppError("insufficient_balance", "Not enough available balance", 400);
    }
    await client.query(
      `UPDATE creator_wallet_gbp
       SET available_pence = available_pence - $2, withdrawn_pence = withdrawn_pence + $2, updated_at = NOW()
       WHERE user_id = $1`,
      [req.userId, body.amountPence],
    );
    await client.query(
      `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
       VALUES ($1, $2, 'withdrawal', $3, 'withdrawal', $3)`,
      [`creator:${req.userId}`, -body.amountPence, body.idempotencyKey],
    );
    await client.query(
      `INSERT INTO withdrawals_gbp (user_id, amount_pence, status, idempotency_key)
       VALUES ($1, $2, 'pending', $3)`,
      [req.userId, body.amountPence, body.idempotencyKey],
    );
  });
  res.json({ ok: true });
});

router.post("/test-coins", requireAuth, async (req: AuthedRequest, res) => {
  if (env().isProduction && process.env.ALLOW_TEST_COINS !== "true") {
    throw new AppError("forbidden", "Test coin mint is disabled", 403);
  }
  const expected = process.env.TEST_COINS_ISSUE_PASSWORD ?? "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const amount = typeof req.body?.amount === "number" ? req.body.amount : 0;
  if (!expected || !secretsMatch(password, expected)) {
    throw new AppError("forbidden", "Test coin mint is not authorized", 403);
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000) {
    throw new AppError("validation_error", "Invalid test coin amount", 400);
  }
  const result = await withTransaction(async (client) => {
    return applyWalletDelta(client, {
      userId: req.userId as string,
      bucket: "test",
      delta: amount,
      reason: "test_coin_mint",
      idempotencyKey: randomUUID(),
    });
  });
  res.json({ testCoins: result.balanceAfter });
});

export default router;
