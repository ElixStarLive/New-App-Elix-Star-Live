import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { invalidatePublicGiftsCatalogCache } from "../gifts/catalogCache.js";

export const ADMIN_GIFT_COIN_COST_MAX = 10_000_000;
export const ADMIN_GIFT_ID_MAX = 128;

export const ADMIN_GIFTS_LIST_SQL = `
  SELECT id, name, coin_cost, active
    FROM gifts
   ORDER BY sort_order ASC, id ASC
`;

export const ADMIN_PACKAGES_LIST_SQL = `
  SELECT product_id, provider, coins, label, price_pence
    FROM coin_packages
   ORDER BY coins ASC, provider ASC
`;

export type AdminEconomyGift = {
  id: string;
  name: string;
  coinCost: number;
  isActive: boolean;
};

export type AdminEconomyPackage = {
  id: string;
  productId: string;
  provider: string;
  title: string;
  coins: number;
  priceDisplay: string;
};

export type AdminGiftPatch = {
  coinCost?: number;
  isActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function postgresUnavailableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string): void {
  const code = postgresUnavailableCode(error);
  logger.error({ err: error }, label);
  if (code === "42P01" || code === "42703") {
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

export function parseAdminGiftId(raw: unknown): string {
  if (typeof raw !== "string") throw new AppError("validation_error", "giftId is required", 400);
  const giftId = raw.trim();
  if (!giftId) throw new AppError("validation_error", "giftId is required", 400);
  if (giftId.length > ADMIN_GIFT_ID_MAX) throw new AppError("validation_error", "Invalid gift", 400);
  return giftId;
}

export function parseAdminGiftPatch(body: unknown): AdminGiftPatch {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  const patch: AdminGiftPatch = {};
  if (Object.prototype.hasOwnProperty.call(body, "coinCost")) {
    if (typeof body.coinCost !== "number" || !Number.isInteger(body.coinCost)) {
      throw new AppError("validation_error", "Invalid price", 400);
    }
    if (body.coinCost <= 0 || body.coinCost > ADMIN_GIFT_COIN_COST_MAX) {
      throw new AppError("validation_error", "Invalid price", 400);
    }
    patch.coinCost = body.coinCost;
  }
  if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      throw new AppError("validation_error", "Invalid status", 400);
    }
    patch.isActive = body.isActive;
  }
  if (patch.coinCost === undefined && patch.isActive === undefined) {
    throw new AppError("validation_error", "No fields to update", 400);
  }
  return patch;
}

export function formatAdminPackagePriceDisplay(pricePence: number): string {
  if (!Number.isInteger(pricePence) || pricePence <= 0) return "";
  const pounds = Math.floor(pricePence / 100);
  const pence = pricePence % 100;
  return `£${pounds}.${String(pence).padStart(2, "0")}`;
}

function mapGiftRow(row: { id: string; name: string; coin_cost: number; active: boolean }): AdminEconomyGift {
  return {
    id: row.id,
    name: row.name,
    coinCost: row.coin_cost,
    isActive: row.active === true,
  };
}

export async function loadAdminEconomy(): Promise<{
  gifts: AdminEconomyGift[];
  packages: AdminEconomyPackage[];
  boosters: [];
}> {
  const giftsResult = await getPool().query<{
    id: string;
    name: string;
    coin_cost: number;
    active: boolean;
  }>(ADMIN_GIFTS_LIST_SQL);
  const packagesResult = await getPool().query<{
    product_id: string;
    provider: string;
    coins: number;
    label: string;
    price_pence: number;
  }>(ADMIN_PACKAGES_LIST_SQL);
  return {
    gifts: giftsResult.rows.map(mapGiftRow),
    packages: packagesResult.rows.map((row) => ({
      id: `${row.provider}:${row.product_id}`,
      productId: row.product_id,
      provider: row.provider,
      title: row.label,
      coins: row.coins,
      priceDisplay: formatAdminPackagePriceDisplay(Number(row.price_pence)),
    })),
    boosters: [],
  };
}

export async function applyAdminGiftPatch(
  actorId: string,
  giftId: string,
  patch: AdminGiftPatch,
): Promise<AdminEconomyGift> {
  const sets: string[] = [];
  const params: Array<string | number | boolean> = [];
  if (patch.coinCost !== undefined) {
    params.push(patch.coinCost);
    sets.push(`coin_cost = $${params.length}`);
  }
  if (patch.isActive !== undefined) {
    params.push(patch.isActive);
    sets.push(`active = $${params.length}`);
  }
  params.push(giftId);
  const updated = await getPool().query<{
    id: string;
    name: string;
    coin_cost: number;
    active: boolean;
  }>(
    `UPDATE gifts SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id, name, coin_cost, active`,
    params,
  );
  if (!updated.rows[0]) throw new AppError("not_found", "Gift not found", 404);
  await invalidatePublicGiftsCatalogCache();
  logger.info(
    {
      giftId,
      by: actorId,
      coin_cost: patch.coinCost,
      is_active: patch.isActive,
    },
    "admin gift catalog updated",
  );
  return mapGiftRow(updated.rows[0]);
}

export async function handleAdminEconomy(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json(await loadAdminEconomy());
  } catch (error) {
    writeDatabaseFailure(res, error, "admin economy load failed");
  }
}

export async function handleAdminPatchGiftCatalog(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const giftId = parseAdminGiftId(req.params.giftId);
  const patch = parseAdminGiftPatch(req.body);
  try {
    const gift = await applyAdminGiftPatch(req.userId as string, giftId, patch);
    res.json({ gift });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin patch gift catalog failed");
  }
}
