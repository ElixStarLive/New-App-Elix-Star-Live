import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export const ADMIN_MONETISATION_REASON_MAX = 500;
export const ADMIN_MONETISATION_HOURS_MAX = 8760;
export const ADMIN_MONETISATION_WITHDRAWALS_LIMIT = 200;

export const ADMIN_MONETISATION_CONFIG_FIELDS = [
  "giftCreatorPct",
  "giftPlatformPct",
  "giftSettlementHours",
] as const;

export type AdminMonetisationConfigField = (typeof ADMIN_MONETISATION_CONFIG_FIELDS)[number];

export type AdminMonetisationConfig = {
  giftCreatorPct: number;
  giftPlatformPct: number;
  giftSettlementHours: number;
};

export type AdminMonetisationWithdrawal = {
  id: string;
  user_id: string;
  amount_pence: number;
  status: string;
  created_at: string;
};

export type AdminMonetisationPatch = {
  field: AdminMonetisationConfigField;
  value: number;
  reason: string | null;
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

function asInt(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function parseAdminMonetisationReason(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid reason", 400);
  const reason = raw.trim();
  if (reason.length > ADMIN_MONETISATION_REASON_MAX) throw new AppError("validation_error", "Reason is too long", 400);
  return reason || null;
}

export function parseAdminMonetisationPatch(body: unknown): AdminMonetisationPatch {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  const field = body.field;
  if (field !== "giftCreatorPct" && field !== "giftPlatformPct" && field !== "giftSettlementHours") {
    throw new AppError("validation_error", "UNKNOWN_FIELD", 400);
  }
  if (typeof body.value !== "number" || !Number.isInteger(body.value)) {
    throw new AppError("validation_error", "Invalid value", 400);
  }
  if (field === "giftSettlementHours") {
    if (body.value < 0 || body.value > ADMIN_MONETISATION_HOURS_MAX) {
      throw new AppError("validation_error", "Invalid settlement hours", 400);
    }
  } else if (body.value < 0 || body.value > 100) {
    throw new AppError("validation_error", "Invalid percentage", 400);
  }
  return {
    field,
    value: body.value,
    reason: parseAdminMonetisationReason(body.reason),
  };
}

function mapConfig(row: {
  gift_creator_pct: number;
  gift_platform_pct: number;
  gift_settlement_hours: number;
}): AdminMonetisationConfig {
  return {
    giftCreatorPct: asInt(row.gift_creator_pct),
    giftPlatformPct: asInt(row.gift_platform_pct),
    giftSettlementHours: asInt(row.gift_settlement_hours),
  };
}

export async function loadAdminMonetisationConfig(): Promise<AdminMonetisationConfig> {
  const { rows } = await getPool().query<{
    gift_creator_pct: number;
    gift_platform_pct: number;
    gift_settlement_hours: number;
  }>(
    `SELECT gift_creator_pct, gift_platform_pct, gift_settlement_hours
       FROM monetisation_config
      WHERE id = 1`,
  );
  if (!rows[0]) throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  return mapConfig(rows[0]);
}

export async function loadAdminMonetisationPage(): Promise<{
  config: AdminMonetisationConfig;
  dashboard: Record<string, unknown>;
  report: Record<string, unknown>;
  withdrawals: AdminMonetisationWithdrawal[];
}> {
  const config = await loadAdminMonetisationConfig();
  const live = await (await import("../../infra/liveSchema.js")).isLiveNeonSchema();
  const lotsTable = live ? "elix_paid_coin_lots" : "paid_coin_lots";
  const earningsTable = live ? "elix_creator_earnings" : "creator_earnings";
  const ledgerTable = live ? "elix_financial_ledger" : "financial_ledger";
  const walletTable = live ? "elix_creator_wallet_gbp" : "creator_wallet_gbp";
  const [pendingLots, settledLots, giftCreator, giftPlatform, wallets, withdrawalGroups, shop, iap, withdrawalRows] =
    await Promise.all([
      getPool().query<{ c: number; gross: string }>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(gross_pence), 0)::text AS gross
           FROM ${lotsTable}
          WHERE settlement_status = 'pending_settlement'`,
      ),
      getPool().query<{ c: number; gross: string }>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(gross_pence), 0)::text AS gross
           FROM ${lotsTable}
          WHERE settlement_status = 'settled'`,
      ),
      getPool().query<{ n: string }>(
        `SELECT COALESCE(SUM(amount_pence), 0)::text AS n
           FROM ${earningsTable}
          WHERE status <> 'reversed'`,
      ),
      getPool().query<{ n: string }>(
        `SELECT COALESCE(SUM(amount_pence), 0)::text AS n
           FROM ${ledgerTable}
          WHERE reason = 'gift_platform'`,
      ),
      getPool().query<{
        pending: string;
        available: string;
        withdrawn: string;
        held: string;
      }>(
        `SELECT COALESCE(SUM(pending_pence), 0)::text AS pending,
                COALESCE(SUM(available_pence), 0)::text AS available,
                COALESCE(SUM(withdrawn_pence), 0)::text AS withdrawn,
                COALESCE(SUM(held_pence), 0)::text AS held
           FROM ${walletTable}`,
      ),
      getPool().query<{ status: string; c: number; pence: string }>(
        `SELECT status, COUNT(*)::int AS c, COALESCE(SUM(amount_pence), 0)::text AS pence
           FROM withdrawals_gbp
          GROUP BY status
          ORDER BY status`,
      ),
      getPool().query<{ c: number; pence: string }>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_pence), 0)::text AS pence
           FROM shop_purchases
          WHERE status = 'paid'`,
      ),
      getPool().query<{ c: number; coins: string }>(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(coins), 0)::text AS coins
           FROM processed_purchases
          WHERE status <> 'reversed'`,
      ),
      getPool().query<{
        id: string;
        user_id: string;
        amount_pence: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT id::text AS id,
                user_id::text AS user_id,
                amount_pence::text AS amount_pence,
                status,
                created_at
           FROM withdrawals_gbp
          ORDER BY created_at DESC
          LIMIT ${ADMIN_MONETISATION_WITHDRAWALS_LIMIT}`,
      ),
    ]);

  const wallet = wallets.rows[0];
  return {
    config,
    dashboard: {
      pending_paid_coin_lots: { c: pendingLots.rows[0]?.c ?? 0, gross_pence: asInt(pendingLots.rows[0]?.gross) },
      settled_paid_coin_lots: { c: settledLots.rows[0]?.c ?? 0, gross_pence: asInt(settledLots.rows[0]?.gross) },
      gifts: {
        creator_pence: asInt(giftCreator.rows[0]?.n),
        platform_pence: asInt(giftPlatform.rows[0]?.n),
      },
      wallets: {
        pending_pence: asInt(wallet?.pending),
        available_pence: asInt(wallet?.available),
        withdrawn_pence: asInt(wallet?.withdrawn),
        held_pence: asInt(wallet?.held),
      },
      withdrawals: withdrawalGroups.rows.map((row) => ({
        status: row.status,
        c: row.c,
        pence: asInt(row.pence),
      })),
      shop: { c: shop.rows[0]?.c ?? 0, pence: asInt(shop.rows[0]?.pence) },
      iap: { c: iap.rows[0]?.c ?? 0, coins: asInt(iap.rows[0]?.coins) },
      currency: "GBP",
    },
    report: {
      gifts: {
        creator_pence: asInt(giftCreator.rows[0]?.n),
        platform_pence: asInt(giftPlatform.rows[0]?.n),
      },
      wallets: {
        pending_pence: asInt(wallet?.pending),
        available_pence: asInt(wallet?.available),
        withdrawn_pence: asInt(wallet?.withdrawn),
        held_pence: asInt(wallet?.held),
      },
      shop: { c: shop.rows[0]?.c ?? 0, pence: asInt(shop.rows[0]?.pence) },
      iap: { c: iap.rows[0]?.c ?? 0, coins: asInt(iap.rows[0]?.coins) },
    },
    withdrawals: withdrawalRows.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      amount_pence: asInt(row.amount_pence),
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    })),
  };
}

export async function applyAdminMonetisationPatch(
  actorId: string,
  patch: AdminMonetisationPatch,
): Promise<AdminMonetisationConfig> {
  const current = await loadAdminMonetisationConfig();
  let next = current;
  if (patch.field === "giftCreatorPct") {
    next = { ...current, giftCreatorPct: patch.value, giftPlatformPct: 100 - patch.value };
  } else if (patch.field === "giftPlatformPct") {
    next = { ...current, giftPlatformPct: patch.value, giftCreatorPct: 100 - patch.value };
  } else {
    next = { ...current, giftSettlementHours: patch.value };
  }
  if (next.giftCreatorPct + next.giftPlatformPct !== 100) {
    throw new AppError("validation_error", "Invalid percentage", 400);
  }
  const updated = await getPool().query<{
    gift_creator_pct: number;
    gift_platform_pct: number;
    gift_settlement_hours: number;
  }>(
    `UPDATE monetisation_config
        SET gift_creator_pct = $1,
            gift_platform_pct = $2,
            gift_settlement_hours = $3
      WHERE id = 1
  RETURNING gift_creator_pct, gift_platform_pct, gift_settlement_hours`,
    [next.giftCreatorPct, next.giftPlatformPct, next.giftSettlementHours],
  );
  if (!updated.rows[0]) throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  const config = mapConfig(updated.rows[0]);
  logger.info(
    {
      by: actorId,
      field: patch.field,
      previous: current,
      next: config,
      reason: patch.reason,
    },
    "admin monetisation config patched",
  );
  return config;
}

export async function handleAdminMonetisation(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json(await loadAdminMonetisationPage());
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin monetisation load failed");
  }
}

export async function handleAdminPatchMonetisationConfig(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const patch = parseAdminMonetisationPatch(req.body);
  try {
    const config = await applyAdminMonetisationPatch(req.userId as string, patch);
    res.json({ ok: true, config });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin monetisation config patch failed");
  }
}
