import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../infra/logger.js";
import { isAppError } from "./errors.js";

function isZodError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError || error instanceof z.core.$ZodError;
}

function isJsonBodyParseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const typed = error as { type?: string };
  if (typed.type === "entity.parse.failed") return true;
  return error instanceof SyntaxError && "body" in error;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isZodError(error)) {
    res.status(400).json({
      error: "validation_error",
      message: error.issues[0]?.message ?? "Invalid request",
    });
    return;
  }
  if (isJsonBodyParseError(error)) {
    res.status(400).json({ error: "validation_error", message: "Invalid JSON body" });
    return;
  }
  if (isAppError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  logger.error({ err: error }, "unhandled error");
  res.status(500).json({ error: "unavailable", message: "Internal error" });
}
