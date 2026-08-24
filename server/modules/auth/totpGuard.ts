import { env } from "../../infra/env.js";
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

/** Refuses the attempt when the counter is unreadable rather than opening the door. */
export async function assertTotpAttemptAllowed(userId: string): Promise<void> {
  if (!valkeyConfigured()) return;
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
  if (!valkeyConfigured()) return;
  try {
    const key = attemptKey(userId);
    await requireValkey().hincrby(key, "n", 1);
    await requireValkey().expire(key, ATTEMPT_WINDOW_SEC);
  } catch {
    /* the attempt already failed; a missing counter must not mask that */
  }
}

export async function clearTotpFailures(userId: string): Promise<void> {
  if (!valkeyConfigured()) return;
  try {
    await valkeyDel(attemptKey(userId));
  } catch {
    /* best effort — a stale counter only ever costs the user a retry window */
  }
}

/**
 * True when this user has not already spent this time step. Without Valkey there
 * is no shared store to burn the step in, and a process-local set would be a lie
 * across replicas, so single-use is only claimed when Valkey is configured.
 */
export async function consumeTotpCounter(userId: string, counter: number): Promise<boolean> {
  if (!valkeyConfigured()) return true;
  try {
    return await valkeyTrySetNx(replayKey(userId, counter), "1", REPLAY_TTL_MS);
  } catch {
    return false;
  }
}

export function totpReplayError(): AppError {
  return new AppError("invalid_credentials", "That authenticator code was already used", 401);
}
