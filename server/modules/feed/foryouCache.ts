/**
 * For You Valkey page cache — NEW implementation of frozen OLD keys/TTL.
 * Anon pages only. Personalized feeds must never share this payload.
 */
import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { requireValkey, valkeyGet, valkeySet, valkeyTrySetNx } from "../../infra/valkey.js";
import type { FeedVideo } from "../../../shared/contracts/social.js";

const FEED_FORYOU_EPOCH_KEY = "elix:feed:foryou:epoch";

export const FEED_FORYOU_CACHE_TTL_MS = Math.min(
  600_000,
  Math.max(5_000, Number(process.env.FEED_FORYOU_CACHE_TTL_MS) || 120_000),
);

export function feedForyouDataKey(epoch: string, page: number, limit: number): string {
  return `elix:feed:foryou:${epoch}:${page}:${limit}`;
}

export function isFeedForyouValkeyEnabled(): boolean {
  return Boolean(env().valkeyUrl);
}

export async function getFeedForyouEpoch(): Promise<string> {
  if (!isFeedForyouValkeyEnabled()) return "0";
  try {
    const epoch = await valkeyGet(FEED_FORYOU_EPOCH_KEY);
    return epoch ?? "0";
  } catch (err) {
    logger.warn({ err }, "getFeedForyouEpoch failed");
    return "0";
  }
}

export async function bumpFeedForyouEpoch(): Promise<void> {
  if (!isFeedForyouValkeyEnabled()) return;
  try {
    await requireValkey().incr(FEED_FORYOU_EPOCH_KEY);
  } catch (err) {
    logger.warn({ err }, "bumpFeedForyouEpoch failed");
  }
}

export async function readFeedForyouCache(
  page: number,
  limit: number,
): Promise<FeedVideo[] | null> {
  if (!isFeedForyouValkeyEnabled()) return null;
  try {
    const epoch = await getFeedForyouEpoch();
    const raw = await valkeyGet(feedForyouDataKey(epoch, page, limit));
    if (!raw) return null;
    const payload = JSON.parse(raw) as { videos?: unknown };
    if (!Array.isArray(payload.videos)) return null;
    return payload.videos as FeedVideo[];
  } catch (err) {
    logger.warn({ err }, "readFeedForyouCache failed");
    return null;
  }
}

export async function writeFeedForyouCache(
  page: number,
  limit: number,
  videos: FeedVideo[],
): Promise<void> {
  if (!isFeedForyouValkeyEnabled()) return;
  try {
    const epoch = await getFeedForyouEpoch();
    await valkeySet(feedForyouDataKey(epoch, page, limit), JSON.stringify({ videos }), FEED_FORYOU_CACHE_TTL_MS);
  } catch (err) {
    logger.warn({ err }, "writeFeedForyouCache failed");
  }
}

/** Single-flight rebuild lock so workers do not stampede Postgres on a cold key. */
export async function acquireFeedForyouBuildLock(page: number, limit: number): Promise<boolean> {
  if (!isFeedForyouValkeyEnabled()) return true;
  try {
    const epoch = await getFeedForyouEpoch();
    return valkeyTrySetNx(`${feedForyouDataKey(epoch, page, limit)}:build`, "1", 8_000);
  } catch {
    return true;
  }
}
