import type { Request, Response, NextFunction } from "express";
import { getPool } from "../infra/postgres.js";
import { verifyAccessToken } from "../infra/tokens.js";
import { AppError } from "./errors.js";

export type AuthedRequest = Request & {
  userId?: string;
  sessionId?: string;
  isAdmin?: boolean;
};

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(/(?:^|; )auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function attachSession(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    next();
    return;
  }
  const claims = await verifyAccessToken(token);
  if (!claims) {
    next();
    return;
  }
  const { rows } = await getPool().query<{
    revoked_at: Date | null;
    expires_at: Date;
    is_admin: boolean;
    banned_until: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT s.revoked_at, s.expires_at, u.is_admin, u.banned_until, u.deleted_at
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [claims.sessionId, claims.userId],
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.expires_at < new Date() || row.deleted_at) {
    next();
    return;
  }
  if (row.banned_until && row.banned_until > new Date()) {
    const forgotPasswordRequest =
      req.method === "POST" && (req.path === "/api/auth/forgot-password" || req.originalUrl?.split("?")[0] === "/api/auth/forgot-password");
    if (forgotPasswordRequest) {
      next();
      return;
    }
    next(new AppError("banned", "Account is banned", 403));
    return;
  }
  req.userId = claims.userId;
  req.sessionId = claims.sessionId;
  req.isAdmin = row.is_admin;
  next();
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.userId) {
    next(new AppError("unauthenticated", "Sign in required", 401));
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.userId) {
    next(new AppError("unauthenticated", "Sign in required", 401));
    return;
  }
  if (!req.isAdmin) {
    next(new AppError("forbidden", "Admin only", 403));
    return;
  }
  next();
}
