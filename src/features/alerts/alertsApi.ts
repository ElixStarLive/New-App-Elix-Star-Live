import { alertsResponseSchema, type AlertItem } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export async function apiListAlerts(): Promise<{
  items: AlertItem[];
  total: number;
  unreadIds: string[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/notifications");
  if (error) return { items: [], total: 0, unreadIds: [], error: error.message, status: error.status };
  const parsed = alertsResponseSchema.safeParse(data);
  if (!parsed.success) return { items: [], total: 0, unreadIds: [], error: "Invalid alerts response" };
  return { items: parsed.data.items, total: parsed.data.total, unreadIds: parsed.data.unreadIds, error: null };
}

export async function apiMarkAlertsRead(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true };
  const { error } = await apiRequest<unknown>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
