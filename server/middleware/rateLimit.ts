import type { Request, Response, NextFunction } from "express";
import { env } from "../infra/env.js";
import { requireValkey } from "../infra/valkey.js";
import { AppError } from "./errors.js";

export async function rateLimit(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }
  if (!env().valkeyUrl) {
    if (env().isProduction) {
      next(new AppError("unavailable", "Rate limiter requires Valkey", 503));
      return;
    }
    next();
    return;
  }
  const key = `rl:${req.ip ?? "unknown"}:${req.method}:${req.path}`;
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, 60);
  if (count > 120) {
    next(new AppError("rate_limited", "Too many requests", 429));
    return;
  }
  next();
}
