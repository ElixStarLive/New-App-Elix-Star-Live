import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { requireValkey, valkeyDel, valkeyTrySetNx } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";

/**
 * A TOTP code stays valid for its whole 30s step plus skew, so an observed code
 * must be burned after the first success or it can simply be replayed.
 */
const REPLAY_TTL_MS = 3 * 30_000;
const ATTEMPT_MAX = 10;
const ATTEMPT_WINDOW_SEC = 15 * 60;

function replayKey(userId: string, counter: number): string {
  return `auth:2fa:used:${userId}:${counter}`;
}

function attemptKey(userId: string): string {
  return `auth:2fa:fail:${userId}`;
}

function valkeyConfigured(): boolean {
  return Boolean(env().valkeyUrl);
}

function assertTotpValkeyConfigured(): void {
  if (valkeyConfigured()) return;
  throw new AppError("unavailable", "Authenticator verification is unavailable", 503);
}

/** Refuses the attempt when the counter is unreadable rather than opening the door. */
export async function assertTotpAttemptAllowed(userId: string): Promise<void> {
  assertTotpValkeyConfigured();
  let count: number;
  try {
    count = Number((await requireValkey().hget(attemptKey(userId), "n")) ?? "0");
  } catch {
    throw new AppError("rate_limited", "Too many authenticator attempts. Please try again later.", 429);
  }
  if (count >= ATTEMPT_MAX) {
    throw new AppError("rate_limited", "Too many authenticator attempts. Please try again later.", 429);
  }
}

export async function recordTotpFailure(userId: string): Promise<void> {
  assertTotpValkeyConfigured();
  try {
    const key = attemptKey(userId);
    await requireValkey().hincrby(key, "n", 1);
    await requireValkey().expire(key, ATTEMPT_WINDOW_SEC);
  } catch (error) {
    logger.warn({ err: error, userId }, "totp failure counter update failed");
  }
}

export async function clearTotpFailures(userId: string): Promise<void> {
  assertTotpValkeyConfigured();
  try {
    await valkeyDel(attemptKey(userId));
  } catch (error) {
    logger.warn({ err: error, userId }, "totp failure counter clear failed");
  }
}

/** True when this user has not already spent this time step. */
export async function consumeTotpCounter(userId: string, counter: number): Promise<boolean> {
  assertTotpValkeyConfigured();
  try {
    return await valkeyTrySetNx(replayKey(userId, counter), "1", REPLAY_TTL_MS);
  } catch {
    return false;
  }
}

export function totpReplayError(): AppError {
  return new AppError("invalid_credentials", "That authenticator code was already used", 401);
}
