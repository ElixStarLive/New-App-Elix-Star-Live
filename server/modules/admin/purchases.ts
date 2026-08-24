import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export const ADMIN_IAP_PURCHASES_LIMIT = 200;
export const ADMIN_SHOP_PURCHASES_LIMIT = 100;

export type AdminIapPurchase = {
  id: string;
  user_id: string;
  provider: string;
  product_id: string;
  transaction_id: string;
  coins: number;
  status: string;
  created_at: string;
};

export type AdminShopPurchase = {
  id: string;
  user_id: string;
  stripe_session_id: string;
  item_id: string;
  quantity: number;
  amount_pence: number;
  status: string;
  created_at: string;
};

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

function asInt(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function asIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

export async function loadAdminIapPurchases(): Promise<AdminIapPurchase[]> {
  const { rows } = await getPool().query<{
    id: string;
    user_id: string;
    provider: string;
    product_id: string;
    transaction_id: string;
    coins: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id::text AS id,
            user_id::text AS user_id,
            provider,
            product_id,
            provider_txn_id AS transaction_id,
            coins::text AS coins,
            status,
            created_at
       FROM processed_purchases
      ORDER BY created_at DESC
      LIMIT ${ADMIN_IAP_PURCHASES_LIMIT}`,
  );
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    provider: row.provider,
    product_id: row.product_id,
    transaction_id: String(row.transaction_id),
    coins: asInt(row.coins),
    status: row.status,
    created_at: asIso(row.created_at),
  }));
}

export async function loadAdminShopPurchases(): Promise<AdminShopPurchase[]> {
  const { rows } = await getPool().query<{
    id: string;
    user_id: string;
    stripe_session_id: string;
    item_id: string;
    quantity: string;
    amount_pence: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id::text AS id,
            buyer_id::text AS user_id,
            stripe_session_id,
            item_id::text AS item_id,
            quantity::text AS quantity,
            amount_pence::text AS amount_pence,
            status,
            created_at
       FROM shop_purchases
      ORDER BY created_at DESC
      LIMIT ${ADMIN_SHOP_PURCHASES_LIMIT}`,
  );
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    stripe_session_id: row.stripe_session_id,
    item_id: row.item_id,
    quantity: asInt(row.quantity),
    amount_pence: asInt(row.amount_pence),
    status: row.status,
    created_at: asIso(row.created_at),
  }));
}

export async function handleAdminIapPurchases(_req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json({ data: await loadAdminIapPurchases(), source: "iap" });
  } catch (error) {
    writeDatabaseFailure(res, error, "admin iap purchases load failed");
  }
}

export async function handleAdminShopPurchases(_req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json({ data: await loadAdminShopPurchases(), source: "shop" });
  } catch (error) {
    writeDatabaseFailure(res, error, "admin shop purchases load failed");
  }
}
