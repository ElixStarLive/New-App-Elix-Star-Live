import {
  inboxActivityResponseSchema,
  inboxCirclesResponseSchema,
  inboxLiveShareResponseSchema,
  inboxNoticesResponseSchema,
  type InboxActivityItem,
  type InboxCircle,
  type InboxLiveShare,
  type InboxNotice,
} from "@shared/contracts";
import { apiMarkAlertsRead } from "@/features/alerts/alertsApi";
import { apiRequest } from "@/lib/apiClient";

export async function apiListInboxActivity(): Promise<{
  items: InboxActivityItem[];
  total: number;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/activity");
  if (error) return { items: [], total: 0, error: error.message, status: error.status };
  const parsed = inboxActivityResponseSchema.safeParse(data);
  if (!parsed.success) return { items: [], total: 0, error: "Invalid activity response" };
  return { items: parsed.data.items, total: parsed.data.total, error: null };
}

export async function apiListInboxCircles(): Promise<{
  users: InboxCircle[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/circles");
  if (error) return { users: [], error: error.message, status: error.status };
  const parsed = inboxCirclesResponseSchema.safeParse(data);
  if (!parsed.success) return { users: [], error: "Invalid inbox circles" };
  return { users: parsed.data.users, error: null };
}

export async function apiListInboxNotices(): Promise<{
  gifts: InboxNotice[];
  giftCount: number;
  shop: InboxNotice[];
  alerts: InboxNotice[];
  alertCount: number;
  unreadIds: string[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/notices");
  if (error) {
    return {
      gifts: [],
      giftCount: 0,
      shop: [],
      alerts: [],
      alertCount: 0,
      unreadIds: [],
      error: error.message,
      status: error.status,
    };
  }
  const parsed = inboxNoticesResponseSchema.safeParse(data);
  if (!parsed.success) {
    return {
      gifts: [],
      giftCount: 0,
      shop: [],
      alerts: [],
      alertCount: 0,
      unreadIds: [],
      error: "Invalid inbox notices",
    };
  }
  return { ...parsed.data, error: null };
}

export async function apiListLiveShareRequests(): Promise<{
  items: InboxLiveShare[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/live-share-requests");
  if (error) return { items: [], error: error.message, status: error.status };
  const parsed = inboxLiveShareResponseSchema.safeParse(data);
  if (!parsed.success) return { items: [], error: "Invalid live share response" };
  return { items: parsed.data.items, error: null };
}

/** POST /api/live-share — share an active live with another user (Inbox Requests). */
export async function apiLiveShareCreate(payload: {
  targetUserId: string;
  streamKey: string;
  hostUserId?: string;
  hostName?: string;
  hostAvatar?: string;
  sharerName?: string;
  sharerAvatar?: string;
}): Promise<{ ok: true; persisted: boolean } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/live-share", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "Invalid live share response" };
  const persisted = (data as { persisted?: unknown }).persisted === true;
  return { ok: true, persisted };
}

export async function apiMarkInboxNoticesRead(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiMarkAlertsRead(ids);
}
