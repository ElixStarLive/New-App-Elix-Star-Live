import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { logger } from "../../infra/logger.js";

const BALANCE_HASH = "test_coins:balances";

export type TestCoinsRead = { status: "ok"; balance: number } | { status: "unavailable" };
export type TestCoinsWrite = { status: "ok"; balance: number } | { status: "unavailable" };
export type TestCoinsDebit =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient"; balance: number }
  | { ok: false; reason: "unavailable" };

function asPositiveInt(amount: unknown): number {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return 0;
  return amount;
}

export function isTestCoinStoreConfigured(): boolean {
  return Boolean(env().valkeyUrl);
}

export async function readTestCoinBalance(userId: string): Promise<TestCoinsRead> {
  if (!userId || !isTestCoinStoreConfigured()) return { status: "unavailable" };
  try {
    const raw = await requireValkey().hget(BALANCE_HASH, userId);
    return { status: "ok", balance: Math.max(0, Math.floor(Number(raw ?? 0))) };
  } catch (error) {
    logger.error({ err: error, userId }, "test-coin balance unreadable");
    return { status: "unavailable" };
  }
}

export async function creditTestCoinBalance(userId: string, amount: number): Promise<TestCoinsWrite> {
  const add = asPositiveInt(amount);
  if (!userId || !isTestCoinStoreConfigured()) return { status: "unavailable" };
  if (!add) return readTestCoinBalance(userId);
  try {
    const next = await requireValkey().hincrby(BALANCE_HASH, userId, add);
    return { status: "ok", balance: Math.max(0, Number(next)) };
  } catch (error) {
    logger.error({ err: error, userId, add }, "test-coin credit failed");
    return { status: "unavailable" };
  }
}

export async function debitTestCoinBalance(userId: string, amount: number): Promise<TestCoinsDebit> {
  const spend = asPositiveInt(amount);
  if (!userId || !spend) {
    const read = await readTestCoinBalance(userId);
    return read.status === "ok"
      ? { ok: false, reason: "insufficient", balance: read.balance }
      : { ok: false, reason: "unavailable" };
  }
  if (!isTestCoinStoreConfigured()) return { ok: false, reason: "unavailable" };
  try {
    const redis = requireValkey();
    const after = Number(await redis.hincrby(BALANCE_HASH, userId, -spend));
    if (after < 0) {
      try {
        await redis.hincrby(BALANCE_HASH, userId, spend);
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      const restored = await readTestCoinBalance(userId);
      if (restored.status !== "ok") return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "insufficient", balance: restored.balance };
    }
    return { ok: true, balance: after };
  } catch (error) {
    logger.error({ err: error, userId, spend }, "test-coin debit failed");
    return { ok: false, reason: "unavailable" };
  }
}
