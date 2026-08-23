import { AppError } from "../../middleware/errors.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function penceFromDb(value: unknown): number {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    }
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    }
    return value;
  }
  if (typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value.trim())) {
    const n = Number(value.trim());
    if (!Number.isSafeInteger(n)) {
      throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    }
    return n;
  }
  throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
}

export function parseCreatorWithdrawBody(body: unknown): { amountPence: number; idempotencyKey: string } {
  if (!isRecord(body)) {
    throw new AppError("invalid_amount", "Enter a valid GBP amount", 400);
  }
  const key = body.idempotency_key;
  if (typeof key !== "string" || !key.trim()) {
    throw new AppError("idempotency_key_required", "Idempotency key is required", 400);
  }
  if (key.length > 120) {
    throw new AppError("idempotency_key_required", "Idempotency key is required", 400);
  }
  const amount = body.amount_pence;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new AppError("invalid_amount", "Enter a valid GBP amount", 400);
  }
  return { amountPence: amount, idempotencyKey: key.trim() };
}

export function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}
