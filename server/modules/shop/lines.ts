import { AppError } from "../../middleware/errors.js";
import {
  SHOP_MAX_BASKET_LINES,
  SHOP_MAX_QTY,
  SHOP_MIN_QTY,
} from "../../../shared/contracts/shop.js";

export type ShopLine = { id: string; quantity: number };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseQty(raw: unknown): number {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isInteger(Number(raw))) {
    return Number(raw);
  }
  throw new AppError("validation_error", "Quantity must be a whole number from 1 to 99", 400);
}

export function parseShopCheckoutLines(body: unknown): ShopLine[] {
  if (!body || typeof body !== "object") {
    throw new AppError("validation_error", "itemId or items required", 400);
  }
  const raw = body as Record<string, unknown>;
  const lines: ShopLine[] = [];

  const push = (idRaw: unknown, qtyRaw: unknown) => {
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!UUID_RE.test(id)) {
      throw new AppError("validation_error", "A shop item id is invalid", 400);
    }
    const quantity = parseQty(qtyRaw ?? 1);
    if (quantity < SHOP_MIN_QTY || quantity > SHOP_MAX_QTY) {
      throw new AppError("validation_error", "Quantity must be between 1 and 99", 400);
    }
    const existing = lines.find((line) => line.id === id);
    if (existing) {
      const next = existing.quantity + quantity;
      if (next > SHOP_MAX_QTY) {
        throw new AppError("validation_error", "Quantity must be between 1 and 99", 400);
      }
      existing.quantity = next;
      return;
    }
    if (lines.length >= SHOP_MAX_BASKET_LINES) {
      throw new AppError("validation_error", "Basket is limited to 10 items", 400);
    }
    lines.push({ id, quantity });
  };

  if (Array.isArray(raw.items)) {
    if (raw.items.length > SHOP_MAX_BASKET_LINES) {
      throw new AppError("validation_error", "Basket is limited to 10 items", 400);
    }
    for (const row of raw.items) {
      if (!row || typeof row !== "object") {
        throw new AppError("validation_error", "A basket line is invalid", 400);
      }
      const line = row as Record<string, unknown>;
      push(line.id, line.quantity);
    }
  } else if (typeof raw.itemId === "string" && raw.itemId.trim()) {
    push(raw.itemId, raw.quantity ?? 1);
  }

  if (lines.length === 0) {
    throw new AppError("validation_error", "itemId or items required", 400);
  }
  return lines;
}

export function shopCheckoutIdempotencyKey(userId: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 200) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(key)) return null;
  return `shop_cs_${userId}_${key}`.slice(0, 255);
}
