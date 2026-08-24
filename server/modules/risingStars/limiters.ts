import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";

const ENTER_WINDOW_SEC = 60;
const ENTER_MAX = 5;
const VOTE_WINDOW_SEC = 60;
const VOTE_MAX = 20;

async function incrementOrSkip(key: string, windowSec: number, max: number, message: string): Promise<void> {
  if (!env().valkeyUrl) {
    if (env().isProduction) {
      throw new AppError("unavailable", "FRAUD_CHECK_UNAVAILABLE", 503);
    }
    return;
  }
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, windowSec);
  if (count > max) {
    throw new AppError("rate_limited", message, 429);
  }
}

export async function assertRisingStarsEnterLimiter(userId: string): Promise<void> {
  await incrementOrSkip(`rl:rs_enter:${userId}`, ENTER_WINDOW_SEC, ENTER_MAX, "RS_ENTER_RATE_LIMITED");
}

export async function assertRisingStarsVoteLimiter(userId: string): Promise<void> {
  await incrementOrSkip(`rl:rs_vote:${userId}`, VOTE_WINDOW_SEC, VOTE_MAX, "RS_VOTE_RATE_LIMITED");
}

export async function assertRisingStarsVoteVelocity(userId: string): Promise<void> {
  await incrementOrSkip(`fraud:rs_vote:${userId}`, VOTE_WINDOW_SEC, VOTE_MAX, "RS_VOTE_RATE_LIMITED");
}
