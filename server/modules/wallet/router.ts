import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { withdrawalBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta, readWalletBalances } from "./ledger.js";
import { withdrawCreatorGbp } from "./withdrawGbp.js";
import { creditVerifiedIap } from "../iap/credit.js";
import { env } from "../../infra/env.js";

const router = Router();

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.equals(right);
}

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await readWalletBalances(req.userId as string));
});

router.post("/iap/verify", requireAuth, async (req: AuthedRequest, res) => {
  const coins = await creditVerifiedIap(req.userId as string, req.body);
  res.json({ ok: true, coins });
});

router.post("/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  await withdrawCreatorGbp(req.userId as string, withdrawalBodySchema.parse(req.body));
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
