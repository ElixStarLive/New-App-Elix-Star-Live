import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";

export type StoredGiftGoal = {
  giftId: string;
  giftName: string;
  giftIcon: string;
  targetCount: number;
  currentCount: number;
};

const GIFT_GOAL_TTL_MS = 24 * 60 * 60 * 1000;

function requireRealtime(): void {
  if (!env().valkeyUrl) {
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }
}

function key(roomId: string): string {
  return `gift_goal:${roomId}`;
}

function normalizeGoal(raw: Record<string, unknown>): StoredGiftGoal | null {
  const giftId = typeof raw.giftId === "string" ? raw.giftId.trim() : "";
  if (!giftId) return null;
  const targetCount = Math.max(1, Math.min(20_000, Math.floor(Number(raw.targetCount) || 1)));
  const currentCount = Math.max(0, Math.min(targetCount, Math.floor(Number(raw.currentCount) || 0)));
  return {
    giftId,
    giftName: typeof raw.giftName === "string" ? raw.giftName : "Gift",
    giftIcon: typeof raw.giftIcon === "string" ? raw.giftIcon : "",
    targetCount,
    currentCount,
  };
}

export async function getGiftGoal(roomId: string): Promise<StoredGiftGoal | null> {
  requireRealtime();
  const raw = await requireValkey().get(key(roomId));
  if (!raw) return null;
  try {
    return normalizeGoal(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function setGiftGoal(roomId: string, goal: StoredGiftGoal): Promise<StoredGiftGoal | null> {
  const normalized = normalizeGoal(goal);
  if (!normalized) return null;
  requireRealtime();
  await requireValkey().set(key(roomId), JSON.stringify(normalized), "PX", GIFT_GOAL_TTL_MS);
  return normalized;
}

export async function clearGiftGoal(roomId: string): Promise<void> {
  requireRealtime();
  await requireValkey().del(key(roomId));
}

export async function incrementGiftGoal(
  roomId: string,
  giftId: string,
  quantity = 1,
): Promise<StoredGiftGoal | null> {
  const goal = await getGiftGoal(roomId);
  if (!goal || goal.giftId !== giftId) return null;
  const add = Math.max(1, Math.floor(Number(quantity) || 1));
  return setGiftGoal(roomId, {
    ...goal,
    currentCount: Math.min(goal.targetCount, goal.currentCount + add),
  });
}
