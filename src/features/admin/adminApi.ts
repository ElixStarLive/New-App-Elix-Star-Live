import { apiRequest } from "@/lib/apiClient";
import { apiMutate, listFrom, parseListFrom, type MutationResult } from "@/lib/apiResult";
import { asNonNegInt, asString, isRecord } from "@/lib/isRecord";

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

function parseUserRow(raw: unknown): AdminUserRow | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    username: asString(raw.username, "user"),
    email: asString(raw.email),
    isAdmin: raw.isAdmin === true,
    banned: raw.banned === true,
  };
}

export async function apiFetchAdminUsers(): Promise<{ users: AdminUserRow[]; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/admin/users");
  if (error) return { users: [], error: error.message };
  const users = parseListFrom(data, "users", parseUserRow);
  if (!users) return { users: [], error: "Invalid users" };
  return { users, error: null };
}

export type AdminReportRow = {
  id: string;
  targetKind: string;
  targetId: string;
  reason: string;
  status: string;
};

function parseReportRow(raw: unknown): AdminReportRow | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    targetKind: asString(raw.targetKind),
    targetId: asString(raw.targetId),
    reason: asString(raw.reason),
    status: asString(raw.status, "open"),
  };
}

export async function apiFetchAdminReports(): Promise<{
  reports: AdminReportRow[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/admin/reports");
  if (error) return { reports: [], error: error.message };
  const reports = parseListFrom(data, "reports", parseReportRow);
  if (!reports) return { reports: [], error: "Invalid reports" };
  return { reports, error: null };
}

export async function apiBanUser(userId: string, banned: boolean): Promise<MutationResult> {
  return apiMutate(`/api/admin/users/${encodeURIComponent(userId)}/ban`, "POST", { banned });
}

export async function apiResolveReport(reportId: string): Promise<MutationResult> {
  return apiMutate(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`);
}

export async function apiFetchAdminTable(path: string): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(path);
  if (error) return { rows: [], error: error.message };
  const list = listFrom(data, "rows");
  if (!list) return { rows: [], error: "Invalid response" };
  return { rows: list.filter(isRecord), error: null };
}
