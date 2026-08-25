import { requireValkey, valkeyTrySetNx } from "./valkey.js";
import { env } from "./env.js";
import { getPool, withTransaction } from "./postgres.js";
import { logger } from "./logger.js";
import { scanAndTickBattles } from "../modules/battle/runtime.js";
import { matureCreatorEarnings } from "../modules/gifts/settle.js";
import { drainPushNotifyJobs } from "../modules/push/queue.js";
import { cleanupStaleUploadSessions } from "../modules/uploads/session.js";
import { expireAbandonedLives } from "../modules/live/start.js";
import { sweepForYouLifecycle } from "../modules/feed/foryouLifecycle.js";

const LEADER_KEY = "elix:jobs:leader";
let forYouSweepTicks = 0;

export function startBackgroundJobs(): void {
  if (process.env.ELIX_JOB_WORKER === "0" || process.env.NODE_ENV === "test") return;
  const timer = setInterval(() => {
    void runOnce().catch((error) => logger.error({ err: error }, "job loop failed"));
  }, 30_000);
  timer.unref?.();
}

async function expireStaleLiveRows(): Promise<void> {
  await getPool().query(`DELETE FROM stories WHERE expires_at < NOW()`);
  await getPool().query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
       WHERE status = 'live' AND started_at < NOW() - INTERVAL '12 hours'`,
  );
}

async function runOnce(): Promise<void> {
  if (!env().valkeyUrl) {
    await expireStaleLiveRows();
    await cleanupStaleUploadSessions();
    await expireAbandonedLives();
    await withTransaction(async (client) => {
      await matureCreatorEarnings(client);
    });
    forYouSweepTicks += 1;
    if (forYouSweepTicks >= 30) {
      forYouSweepTicks = 0;
      await sweepForYouLifecycle().catch((error) => logger.warn({ err: error }, "foryou sweep failed"));
    }
    return;
  }
  const token = `${process.pid}:${Date.now()}`;
  const leader = await valkeyTrySetNx(LEADER_KEY, token, 90_000);
  if (!leader) return;
  await expireStaleLiveRows();
  await cleanupStaleUploadSessions();
  await expireAbandonedLives();
  await withTransaction(async (client) => {
    await matureCreatorEarnings(client);
  });
  await scanAndTickBattles();
  await drainPushNotifyJobs();
  // OLD ran For You sweep ~every 15m; job loop is 30s → every 30 ticks.
  forYouSweepTicks += 1;
  if (forYouSweepTicks >= 30) {
    forYouSweepTicks = 0;
    await sweepForYouLifecycle().catch((error) => logger.warn({ err: error }, "foryou sweep failed"));
  }
  await requireValkey().pexpire(LEADER_KEY, 90_000);
}
