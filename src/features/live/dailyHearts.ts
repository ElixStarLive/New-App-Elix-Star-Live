import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export async function apiGetDailyHearts(creatorId: string): Promise<{
  todayCount: number;
  totalCount: number;
  hasSent: boolean;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/hearts/daily/${encodeURIComponent(creatorId)}`);
  if (error || !isRecord(data)) {
    return { todayCount: 0, totalCount: 0, hasSent: false, error: error?.message ?? "Could not load Join state" };
  }
  return {
    todayCount: typeof data.todayCount === "number" ? data.todayCount : 0,
    totalCount: typeof data.totalCount === "number" ? data.totalCount : 0,
    hasSent: data.hasSent === true,
    error: null,
  };
}

export async function apiSendDailyHeart(creatorId: string): Promise<{
  ok: boolean;
  already: boolean;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/hearts/daily", {
    method: "POST",
    body: JSON.stringify({ creatorId }),
  });
  if (error) return { ok: false, already: false, error: error.message || "Could not send membership heart. Try again." };
  if (!isRecord(data)) return { ok: false, already: false, error: "Could not send membership heart. Try again." };
  const already = data.already === true;
  const ok = data.ok === true || already;
  return {
    ok,
    already,
    error: ok ? null : "Could not send membership heart. Try again.",
  };
}
