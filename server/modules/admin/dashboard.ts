import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export const ADMIN_DAU_QUERY = `
  SELECT COUNT(DISTINCT user_id)::text AS dau
  FROM auth_sessions
  WHERE created_at > NOW() - INTERVAL '24 hours'
`;

export const ADMIN_DASHBOARD_QUERY = `
  SELECT
    (SELECT COUNT(*)::text FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT COUNT(*)::text FROM videos WHERE deleted_at IS NULL) AS videos,
    (SELECT COUNT(*)::text FROM live_streams WHERE status = 'live') AS live,
    (SELECT COUNT(*)::text FROM reports WHERE status IN ('open', 'pending')) AS reports,
    (SELECT COALESCE(SUM(amount_pence), 0)::text FROM shop_purchases WHERE status = 'paid') AS revenue,
    (SELECT COUNT(DISTINCT user_id)::text FROM auth_sessions WHERE created_at > NOW() - INTERVAL '24 hours') AS dau
`;

export type AdminDashboardStats = {
  dailyActiveUsers: number;
  totalUsers: number;
  totalVideos: number;
  liveRooms: number;
  totalRevenueMinor: number;
  pendingReports: number;
};

export function parseAdminCount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function postgresUnavailableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

export function mapDashboardRow(row: Record<string, unknown> | undefined): AdminDashboardStats | null {
  if (!row) return null;
  const dailyActiveUsers = parseAdminCount(row.dau);
  const totalUsers = parseAdminCount(row.users);
  const totalVideos = parseAdminCount(row.videos);
  const liveRooms = parseAdminCount(row.live);
  const totalRevenueMinor = parseAdminCount(row.revenue);
  const pendingReports = parseAdminCount(row.reports);
  if (
    dailyActiveUsers == null ||
    totalUsers == null ||
    totalVideos == null ||
    liveRooms == null ||
    totalRevenueMinor == null ||
    pendingReports == null
  ) {
    return null;
  }
  return {
    dailyActiveUsers,
    totalUsers,
    totalVideos,
    liveRooms,
    totalRevenueMinor,
    pendingReports,
  };
}

export async function loadAdminDashboardStats(): Promise<AdminDashboardStats> {
  
  const { rows } = await getPool().query<Record<string, unknown>>(
    ADMIN_DASHBOARD_QUERY,
  );
  const stats = mapDashboardRow(rows[0]);
  if (!stats) throw new Error("DASHBOARD_SHAPE_INVALID");
  return stats;
}

export async function loadAdminDau(): Promise<number> {
  
  const { rows } = await getPool().query<{ dau: string }>(ADMIN_DAU_QUERY);
  const dau = parseAdminCount(rows[0]?.dau);
  if (dau == null) throw new Error("DAU_SHAPE_INVALID");
  return dau;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string, includeDauNull: boolean): void {
  const code = postgresUnavailableCode(error);
  logger.error({ err: error }, label);
  if (code === "42P01" || code === "42703") {
    if (includeDauNull) {
      res.status(503).json({ error: "SCHEMA_UNAVAILABLE", dau: null });
      return;
    }
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  if (includeDauNull) {
    res.status(500).json({ error: "DATABASE_ERROR", dau: null });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

export async function handleAdminDashboard(_req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const stats = await loadAdminDashboardStats();
    res.json(stats);
  } catch (error) {
    writeDatabaseFailure(res, error, "admin dashboard failed", false);
  }
}

export async function handleAdminDau(_req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, max-age=60");
  try {
    const dau = await loadAdminDau();
    res.json({ dau });
  } catch (error) {
    writeDatabaseFailure(res, error, "admin stats/dau failed", true);
  }
}

