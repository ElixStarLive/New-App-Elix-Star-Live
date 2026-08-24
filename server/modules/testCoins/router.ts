import { createHash } from "node:crypto";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { creditTestCoinBalance, readTestCoinBalance } from "./store.js";

const router = Router();

function secretsMatch(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.equals(right);
}

router.get("/balance", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const read = await readTestCoinBalance(req.userId as string);
  if (read.status !== "ok") {
    throw new AppError("unavailable", "Test coin store unavailable", 503);
  }
  res.status(200).json({ balance: read.balance });
});

router.post("/mint", requireAuth, async (req: AuthedRequest, res) => {
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
  const credited = await creditTestCoinBalance(req.userId as string, amount);
  if (credited.status !== "ok") {
    throw new AppError("unavailable", "Test coin store unavailable", 503);
  }
  res.status(200).json({ balance: credited.balance, minted: amount });
});

export default router;
