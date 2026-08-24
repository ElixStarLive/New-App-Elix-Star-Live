import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";

const IAP_VERIFY_LIMIT = 20;
const IAP_VERIFY_WINDOW_SEC = 60 * 60;

export async function assertIapVerifyVelocity(userId: string): Promise<void> {
  if (!env().valkeyUrl) {
    if (env().isProduction) {
      throw new AppError("unavailable", "Rate limiter requires Valkey", 503);
    }
    return;
  }
  const key = `iap:verify:${userId}`;
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, IAP_VERIFY_WINDOW_SEC);
  if (count > IAP_VERIFY_LIMIT) {
    throw new AppError("rate_limited", "Too many purchase attempts", 429);
  }
}
