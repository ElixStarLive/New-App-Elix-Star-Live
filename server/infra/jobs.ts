import { requireValkey, valkeyTrySetNx } from "./valkey.js";
import { env } from "./env.js";
import { getPool, withTransaction } from "./postgres.js";
import { logger } from "./logger.js";
import { scanAndTickBattles } from "../modules/battle/runtime.js";
import { matureCreatorEarnings } from "../modules/gifts/settle.js";

const LEADER_KEY = "elix:jobs:leader";

export function startBackgroundJobs(): void {
  if (process.env.ELIX_JOB_WORKER === "0" || process.env.NODE_ENV === "test") return;
  const timer = setInterval(() => {
    void runOnce().catch((error) => logger.error({ err: error }, "job loop failed"));
  }, 30_000);
  timer.unref?.();
}

async function runOnce(): Promise<void> {
  if (!env().valkeyUrl) {
    await getPool().query(`DELETE FROM stories WHERE expires_at < NOW()`);
    await getPool().query(
      `UPDATE live_streams SET status = 'ended', ended_at = NOW()
       WHERE status = 'live' AND started_at < NOW() - INTERVAL '12 hours'`,
    );
    await withTransaction(async (client) => {
      await matureCreatorEarnings(client);
    });
    return;
  }
  const token = `${process.pid}:${Date.now()}`;
  const leader = await valkeyTrySetNx(LEADER_KEY, token, 90_000);
  if (!leader) return;
  await getPool().query(`DELETE FROM stories WHERE expires_at < NOW()`);
  await getPool().query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
     WHERE status = 'live' AND started_at < NOW() - INTERVAL '12 hours'`,
  );
  await withTransaction(async (client) => {
    await matureCreatorEarnings(client);
  });
  await scanAndTickBattles();
  await requireValkey().pexpire(LEADER_KEY, 90_000);
}
