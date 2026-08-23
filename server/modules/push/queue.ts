import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { requireValkey } from "../../infra/valkey.js";
import { pushNotifyUser } from "./send.js";

export const PUSH_NOTIFY_QUEUE = "elix:jobs";

type PushNotifyJob = {
  type: "push_notify";
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function enqueuePushNotify(job: Omit<PushNotifyJob, "type">): Promise<{ queued: boolean; reason?: string }> {
  if (!env().valkeyUrl) {
    logger.warn("push_notify not queued: Valkey unavailable");
    return { queued: false, reason: "valkey_unavailable" };
  }
  const payload: PushNotifyJob = { type: "push_notify", ...job };
  await requireValkey().lpush(PUSH_NOTIFY_QUEUE, JSON.stringify(payload));
  return { queued: true };
}

export async function drainPushNotifyJobs(limit = 20): Promise<void> {
  if (!env().valkeyUrl) return;
  const valkey = requireValkey();
  for (let i = 0; i < limit; i += 1) {
    const raw = await valkey.rpop(PUSH_NOTIFY_QUEUE);
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn("push_notify dropped: invalid job payload");
      continue;
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { type?: unknown }).type !== "push_notify") {
      await valkey.lpush(PUSH_NOTIFY_QUEUE, raw);
      return;
    }
    const job = parsed as PushNotifyJob;
    const result = await pushNotifyUser(job.userId, job.title, job.body, job.data);
    if (!result.configured) {
      logger.warn({ reason: result.reason }, "push_notify job finished without delivery");
    }
  }
}
