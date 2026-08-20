import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { asNonNegInt, asString } from "@/lib/isRecord";

export type AdminDashboard = {
  dailyActiveUsers: number;
  totalUsers: number;
  totalVideos: number;
  liveRooms: number;
  totalRevenueMinor: number;
  pendingReports: number;
};

export async function apiFetchAdminDashboard(): Promise<{
  data: AdminDashboard | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/dashboard");
  if (error) return { data: null, error: error.message };
  if (!isRecord(data)) return { data: null, error: "Invalid dashboard" };
  return {
    data: {
      dailyActiveUsers: asNonNegInt(data.dailyActiveUsers),
      totalUsers: asNonNegInt(data.totalUsers),
      totalVideos: asNonNegInt(data.totalVideos),
      liveRooms: asNonNegInt(data.liveRooms),
      totalRevenueMinor: asNonNegInt(data.totalRevenueMinor),
      pendingReports: asNonNegInt(data.pendingReports),
    },
    error: null,
  };
}

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  banned: boolean;
};

export async function apiFetchAdminUsers(): Promise<{ users: AdminUserRow[]; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/users");
  if (error) return { users: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.users) ? data.users : null;
  if (!list) return { users: [], error: "Invalid users" };
  const users: AdminUserRow[] = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    users.push({
      id: raw.id,
      username: asString(raw.username, "user"),
      email: asString(raw.email),
      isAdmin: raw.isAdmin === true,
      banned: raw.banned === true,
    });
  }
  return { users, error: null };
}

export type AdminReportRow = {
  id: string;
  targetKind: string;
  targetId: string;
  reason: string;
  status: string;
};

export async function apiFetchAdminReports(): Promise<{
  reports: AdminReportRow[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/reports");
  if (error) return { reports: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.reports) ? data.reports : null;
  if (!list) return { reports: [], error: "Invalid reports" };
  const reports: AdminReportRow[] = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    reports.push({
      id: raw.id,
      targetKind: asString(raw.targetKind),
      targetId: asString(raw.targetId),
      reason: asString(raw.reason),
      status: asString(raw.status, "open"),
    });
  }
  return { reports, error: null };
}

export async function apiBanUser(
  userId: string,
  banned: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "POST",
    body: JSON.stringify({ banned }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiResolveReport(reportId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFetchAdminTable(path: string): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(path);
  if (error) return { rows: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.rows) ? data.rows : null;
  if (!list) return { rows: [], error: "Invalid response" };
  return {
    rows: list.filter(isRecord),
    error: null,
  };
}
