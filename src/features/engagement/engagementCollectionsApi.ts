import {
  engagementChestOpenResponseSchema,
  engagementCreatorCardsResponseSchema,
  engagementStickersResponseSchema,
  engagementTreasureResponseSchema,
  type EngagementChestOpenResponse,
  type EngagementCreatorCardsResponse,
  type EngagementStickersResponse,
  type EngagementTreasureResponse,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementCollectionsApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementCollectionsSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(
  error: { message?: string; status: number; code?: string },
  fallback: string,
): EngagementCollectionsApiFailure {
  return {
    ok: false,
    error: error.message || fallback,
    sessionExpired: isEngagementCollectionsSessionFailure(error.status, error.code),
    disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
  };
}

export async function apiEngagementTreasure(): Promise<
  { ok: true; treasure: EngagementTreasureResponse } | EngagementCollectionsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/treasure");
  if (error) return failure(error, "Could not load collections");
  const parsed = engagementTreasureResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load collections", sessionExpired: false, disabled: false };
  }
  return { ok: true, treasure: parsed.data };
}

export async function apiEngagementStickers(): Promise<
  { ok: true; stickers: EngagementStickersResponse } | EngagementCollectionsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/stickers");
  if (error) return failure(error, "Could not load collections");
  const parsed = engagementStickersResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load collections", sessionExpired: false, disabled: false };
  }
  return { ok: true, stickers: parsed.data };
}

export async function apiEngagementCreatorCards(): Promise<
  { ok: true; cards: EngagementCreatorCardsResponse } | EngagementCollectionsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/creator-cards");
  if (error) return failure(error, "Could not load collections");
  const parsed = engagementCreatorCardsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load collections", sessionExpired: false, disabled: false };
  }
  return { ok: true, cards: parsed.data };
}

export async function apiEngagementTreasureOpen(
  chestId: string,
): Promise<{ ok: true } & EngagementChestOpenResponse | EngagementCollectionsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/engagement/treasure/${encodeURIComponent(chestId)}/open`,
    { method: "POST" },
  );
  if (error) {
    return failure(error, "Open failed");
  }
  const parsed = engagementChestOpenResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Open failed", sessionExpired: false, disabled: false };
  }
  return parsed.data;
}
