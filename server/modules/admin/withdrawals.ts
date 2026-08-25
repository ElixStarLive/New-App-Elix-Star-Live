import type { PoolClient } from "pg";
import type { Response } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { isUniqueViolation, penceFromDb } from "../payouts/moneyParse.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_WITHDRAWAL_LIMIT = 100;
export const ADMIN_WITHDRAWAL_NOTE_MAX = 500;

export const ADMIN_WITHDRAWAL_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "paid_manually",
  "rejected",
  "cancelled",
] as const;

export const ADMIN_WITHDRAWAL_LIST_FILTERS = [...ADMIN_WITHDRAWAL_STATUSES, "all"] as const;

export const ADMIN_WITHDRAWAL_ACTIONS = ["review", "approve", "reject", "cancel", "mark-paid"] as const;

export type AdminWithdrawalStatus = (typeof ADMIN_WITHDRAWAL_STATUSES)[number];
export type AdminWithdrawalListFilter = (typeof ADMIN_WITHDRAWAL_LIST_FILTERS)[number];
export type AdminWithdrawalAction = (typeof ADMIN_WITHDRAWAL_ACTIONS)[number];
export type AdminWithdrawalMoneyEffect = "none" | "hold_to_withdrawn" | "hold_to_available";

export const ADMIN_WITHDRAWAL_OPEN_STATUSES = ["pending", "under_review", "approved"] as const;

export const ADMIN_WITHDRAWAL_WORKFLOW = [...ADMIN_WITHDRAWAL_STATUSES];
export const ADMIN_WITHDRAWAL_MANUAL_NOTE = "Manual bank payout only — no automated bank rail";

const ACTION_FROM: Record<AdminWithdrawalAction, readonly AdminWithdrawalStatus[]> = {
  review: ["pending"],
  approve: ["pending", "under_review"],
  reject: ["pending", "under_review"],
  cancel: ["pending", "under_review"],
  "mark-paid": ["approved"],
};

const ACTION_TO: Record<AdminWithdrawalAction, AdminWithdrawalStatus> = {
  review: "under_review",
  approve: "approved",
  reject: "rejected",
  cancel: "cancelled",
  "mark-paid": "paid_manually",
};

const ACTION_MONEY: Record<AdminWithdrawalAction, AdminWithdrawalMoneyEffect> = {
  review: "none",
  approve: "hold_to_withdrawn",
  reject: "hold_to_available",
  cancel: "hold_to_available",
  "mark-paid": "none",
};

const ACTION_NOTE_REQUIRED: Record<AdminWithdrawalAction, boolean> = {
  review: false,
  approve: false,
  reject: true,
  cancel: true,
  "mark-paid": false,
};

const ACTION_ERROR: Record<AdminWithdrawalAction, string> = {
  review: "Payout not found or not pending",
  approve: "Payout not found or already processed",
  reject: "Payout not found or already processed",
  cancel: "Payout not found or not cancellable",
  "mark-paid": "Payout must be approved before marking paid",
};

export type AdminWithdrawalRow = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  amountPence: number;
  currency: "GBP";
  status: string;
  adminNote: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
};

type LockedWithdrawal = {
  id: string;
  user_id: string;
  amount_pence: string;
  status: string;
  admin_note: string | null;
};

function creatorAccount(userId: string): string {
  return `creator:${userId}`;
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

function asIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export function isAdminWithdrawalId(value: string): boolean {
  return UUID_RE.test(value);
}

export function isAdminWithdrawalAction(value: unknown): value is AdminWithdrawalAction {
  return typeof value === "string" && (ADMIN_WITHDRAWAL_ACTIONS as readonly string[]).includes(value);
}

export function parseAdminWithdrawalStatusFilter(raw: unknown): AdminWithdrawalListFilter {
  const status = typeof raw === "string" && raw.trim() ? raw.trim() : "pending";
  if (!(ADMIN_WITHDRAWAL_LIST_FILTERS as readonly string[]).includes(status)) {
    throw new AppError("validation_error", "Invalid status", 400);
  }
  return status as AdminWithdrawalListFilter;
}

export function parseAdminWithdrawalNote(raw: unknown, required: boolean): string | null {
  if (raw == null || raw === "") {
    if (required) throw new AppError("validation_error", "adminNote required", 400);
    return null;
  }
  if (typeof raw !== "string") throw new AppError("validation_error", "adminNote required", 400);
  const note = raw.trim();
  if (note.length > ADMIN_WITHDRAWAL_NOTE_MAX) {
    throw new AppError("validation_error", "adminNote is too long", 400);
  }
  if (required && !note) throw new AppError("validation_error", "adminNote required", 400);
  return note || null;
}

export function allowedSourcesForAction(action: AdminWithdrawalAction): readonly AdminWithdrawalStatus[] {
  return ACTION_FROM[action];
}

export function resultingStatusForAction(action: AdminWithdrawalAction): AdminWithdrawalStatus {
  return ACTION_TO[action];
}

export function moneyEffectForAction(action: AdminWithdrawalAction): AdminWithdrawalMoneyEffect {
  return ACTION_MONEY[action];
}

export function actionRequiresNote(action: AdminWithdrawalAction): boolean {
  return ACTION_NOTE_REQUIRED[action];
}

export function isValidWithdrawalTransition(from: string, action: AdminWithdrawalAction): boolean {
  return (ACTION_FROM[action] as readonly string[]).includes(from);
}

function mapWithdrawalRow(row: {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  amount_pence: string;
  status: string;
  admin_note: string | null;
  processed_by: string | null;
  processed_at: Date | string | null;
  created_at: Date | string;
}): AdminWithdrawalRow {
  const created = asIso(row.created_at);
  if (!created) throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  const amount = penceFromDb(row.amount_pence);
  if (amount <= 0) throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username ?? "",
    displayName: row.display_name ?? "",
    amountPence: amount,
    currency: "GBP",
    status: row.status,
    adminNote: row.admin_note,
    processedBy: row.processed_by,
    processedAt: asIso(row.processed_at),
    createdAt: created,
  };
}

const WITHDRAWAL_SELECT = `
  SELECT w.id::text AS id,
         w.user_id::text AS user_id,
         COALESCE(u.username, '') AS username,
         COALESCE(u.display_name, '') AS display_name,
         w.amount_pence::text AS amount_pence,
         w.status,
         w.admin_note,
         w.processed_by::text AS processed_by,
         w.processed_at,
         w.created_at
    FROM withdrawals_gbp w
    LEFT JOIN users u ON u.id = w.user_id AND u.deleted_at IS NULL
`;

export async function loadAdminWithdrawals(rawStatus: unknown): Promise<AdminWithdrawalRow[]> {
  const status = parseAdminWithdrawalStatusFilter(rawStatus);
  const sql =
    status === "all"
      ? `${WITHDRAWAL_SELECT} ORDER BY w.created_at DESC LIMIT ${ADMIN_WITHDRAWAL_LIMIT}`
      : `${WITHDRAWAL_SELECT} WHERE w.status = $1 ORDER BY w.created_at ASC LIMIT ${ADMIN_WITHDRAWAL_LIMIT}`;
  const { rows } = await getPool().query<{
    id: string;
    user_id: string;
    username: string | null;
    display_name: string | null;
    amount_pence: string;
    status: string;
    admin_note: string | null;
    processed_by: string | null;
    processed_at: Date | null;
    created_at: Date;
  }>(sql, status === "all" ? [] : [status]);
  return rows.map(mapWithdrawalRow);
}

async function loadWithdrawalById(client: PoolClient | ReturnType<typeof getPool>, id: string): Promise<AdminWithdrawalRow> {
  const { rows } = await client.query<{
    id: string;
    user_id: string;
    username: string | null;
    display_name: string | null;
    amount_pence: string;
    status: string;
    admin_note: string | null;
    processed_by: string | null;
    processed_at: Date | null;
    created_at: Date;
  }>(`${WITHDRAWAL_SELECT} WHERE w.id = $1`, [id]);
  if (!rows[0]) throw new AppError("not_found", "Payout not found or already processed", 400);
  return mapWithdrawalRow(rows[0]);
}

async function writeWithdrawalAudit(
  client: PoolClient,
  actorId: string,
  action: string,
  targetUserId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO moderation_audit (actor_id, action, target_user_id, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorId, action, targetUserId, JSON.stringify(details)],
  );
}

async function applyWithdrawalAction(
  actorId: string,
  withdrawalId: string,
  action: AdminWithdrawalAction,
  note: string | null,
): Promise<AdminWithdrawalRow> {
  try {
  return await withTransaction(async (client) => {
    const locked = await client.query<LockedWithdrawal>(
      `SELECT id::text AS id,
              user_id::text AS user_id,
              amount_pence::text AS amount_pence,
              status,
              admin_note
         FROM withdrawals_gbp
        WHERE id = $1
        FOR UPDATE`,
      [withdrawalId],
    );
    const existing = locked.rows[0];
    if (!existing || !isValidWithdrawalTransition(existing.status, action)) {
      throw new AppError("validation_error", ACTION_ERROR[action], 400);
    }
    const amount = penceFromDb(existing.amount_pence);
    if (amount <= 0 || !Number.isSafeInteger(amount)) {
      throw new AppError("validation_error", "Withdrawal amount is invalid", 400);
    }

    await client.query(`SELECT user_id FROM creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`, [existing.user_id]);

    const money = moneyEffectForAction(action);
    if (money === "hold_to_withdrawn") {
      const moved = await client.query(
        `UPDATE creator_wallet_gbp
            SET held_pence = held_pence - $2,
                withdrawn_pence = withdrawn_pence + $2,
                updated_at = NOW()
          WHERE user_id = $1 AND held_pence >= $2`,
        [existing.user_id, amount],
      );
      if (!moved.rowCount) {
        throw new AppError("unavailable", "Held balance could not be withdrawn", 503);
      }
      await client.query(
        `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ($1, $2, 'withdrawal_approve', $3, 'withdrawal', $4)`,
        [creatorAccount(existing.user_id), amount, `withdrawal_approve:${withdrawalId}`, withdrawalId],
      );
    } else if (money === "hold_to_available") {
      const restored = await client.query(
        `UPDATE creator_wallet_gbp
            SET held_pence = GREATEST(held_pence - $2, 0),
                available_pence = available_pence + $2,
                updated_at = NOW()
          WHERE user_id = $1 AND held_pence >= $2`,
        [existing.user_id, amount],
      );
      if (!restored.rowCount) {
        throw new AppError("unavailable", "Held balance could not be restored", 503);
      }
      const reason = action === "reject" ? "withdrawal_reject_restore" : "withdrawal_cancel_restore";
      const key = action === "reject" ? `withdrawal_reject:${withdrawalId}` : `withdrawal_cancel:${withdrawalId}`;
      await client.query(
        `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ($1, $2, $3, $4, 'withdrawal', $5)`,
        [creatorAccount(existing.user_id), amount, reason, key, withdrawalId],
      );
    }

    const nextStatus = resultingStatusForAction(action);
    const storedNote = note ?? (action === "review" || action === "mark-paid" ? existing.admin_note : note);
    const updated = await client.query(
      `UPDATE withdrawals_gbp
          SET status = $2,
              admin_note = $3,
              processed_by = $4,
              processed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = $5`,
      [withdrawalId, nextStatus, storedNote, actorId, existing.status],
    );
    if (!updated.rowCount) {
      throw new AppError("validation_error", ACTION_ERROR[action], 400);
    }

    await writeWithdrawalAudit(client, actorId, `withdrawal_${action.replace("-", "_")}`, existing.user_id, {
      withdrawal_id: withdrawalId,
      previous_status: existing.status,
      new_status: nextStatus,
      amount_pence: amount,
      currency: "GBP",
      note: note,
    });

    return loadWithdrawalById(client, withdrawalId);
  });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("validation_error", ACTION_ERROR[action], 400);
    }
    throw error;
  }
}

export async function applyAdminEarningChargeback(
  actorId: string,
  earningId: string,
): Promise<{ reversed: { id: string; creatorId: string; amountPence: number; status: "reversed" } }> {
  try {
  return await withTransaction(async (client) => {
    const earning = await client.query<{
      id: string;
      creator_id: string;
      amount_pence: string;
      status: string;
    }>(
      `SELECT id::text AS id,
              creator_id::text AS creator_id,
              amount_pence::text AS amount_pence,
              status
         FROM creator_earnings
        WHERE id = $1 AND status IN ('pending', 'available')
        FOR UPDATE`,
      [earningId],
    );
    const row = earning.rows[0];
    if (!row) {
      throw new AppError("validation_error", "Earning not found or already processed", 400);
    }
    const amount = penceFromDb(row.amount_pence);
    if (amount <= 0 || !Number.isSafeInteger(amount)) {
      throw new AppError("validation_error", "Earning amount is invalid", 400);
    }

    const wallet = await client.query<{ pending_pence: string; available_pence: string }>(
      `SELECT pending_pence::text AS pending_pence, available_pence::text AS available_pence
         FROM creator_wallet_gbp
        WHERE user_id = $1
        FOR UPDATE`,
      [row.creator_id],
    );
    const pending = wallet.rows[0] ? penceFromDb(wallet.rows[0].pending_pence) : 0;
    const available = wallet.rows[0] ? penceFromDb(wallet.rows[0].available_pence) : 0;
    if (row.status === "available" && available < amount) {
      throw new AppError(
        "insufficient_available",
        "Earning already withdrawn or spent; cannot reverse from available balance",
        409,
      );
    }
    if (row.status !== "available" && pending < amount) {
      throw new AppError("insufficient_pending", "Insufficient pending balance to reverse earning", 409);
    }

    if (row.status === "available") {
      const debited = await client.query(
        `UPDATE creator_wallet_gbp
            SET available_pence = available_pence - $2, updated_at = NOW()
          WHERE user_id = $1 AND available_pence >= $2`,
        [row.creator_id, amount],
      );
      if (!debited.rowCount) {
        throw new AppError(
          "insufficient_available",
          "Earning already withdrawn or spent; cannot reverse from available balance",
          409,
        );
      }
    } else {
      const debited = await client.query(
        `UPDATE creator_wallet_gbp
            SET pending_pence = pending_pence - $2, updated_at = NOW()
          WHERE user_id = $1 AND pending_pence >= $2`,
        [row.creator_id, amount],
      );
      if (!debited.rowCount) {
        throw new AppError("insufficient_pending", "Insufficient pending balance to reverse earning", 409);
      }
    }

    await client.query(`UPDATE creator_earnings SET status = 'reversed' WHERE id = $1 AND status = $2`, [
      earningId,
      row.status,
    ]);
    await client.query(
      `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
       VALUES ($1, $2, 'earning_chargeback', $3, 'earning', $4)`,
      [creatorAccount(row.creator_id), amount, `earning_chargeback:${earningId}`, earningId],
    );
    await writeWithdrawalAudit(client, actorId, "withdrawal_chargeback", row.creator_id, {
      earning_id: earningId,
      previous_status: row.status,
      new_status: "reversed",
      amount_pence: amount,
      currency: "GBP",
    });
    return {
      reversed: {
        id: row.id,
        creatorId: row.creator_id,
        amountPence: amount,
        status: "reversed" as const,
      },
    };
  });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("validation_error", "Earning not found or already processed", 400);
    }
    throw error;
  }
}

export async function applyAdminUnfreeze(
  actorId: string,
  userId: string,
): Promise<{ ok: true; userId: string; released: number; stillReserved: number }> {
  return withTransaction(async (client) => {
    const reservedR = await client.query<{ reserved: string }>(
      `SELECT COALESCE(SUM(amount_pence), 0)::text AS reserved
         FROM withdrawals_gbp
        WHERE user_id = $1
          AND status = ANY($2::text[])`,
      [userId, [...ADMIN_WITHDRAWAL_OPEN_STATUSES]],
    );
    const reserved = penceFromDb(reservedR.rows[0]?.reserved ?? "0");
    const wallet = await client.query<{ held_pence: string }>(
      `SELECT held_pence::text AS held_pence
         FROM creator_wallet_gbp
        WHERE user_id = $1
        FOR UPDATE`,
      [userId],
    );
    if (!wallet.rows[0]) {
      throw new AppError("not_found", "Creator balance not found", 404);
    }
    const held = penceFromDb(wallet.rows[0].held_pence);
    const released = held > reserved ? held - reserved : 0;
    const nextHeld = reserved;
    await client.query(
      `UPDATE creator_wallet_gbp
          SET held_pence = $2,
              available_pence = available_pence + $3,
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId, nextHeld, released],
    );
    if (released > 0) {
      await writeWithdrawalAudit(client, actorId, "withdrawal_unfreeze", userId, {
        released_pence: released,
        still_reserved_pence: reserved,
        currency: "GBP",
      });
    }
    return { ok: true as const, userId, released, stillReserved: reserved };
  });
}

function parseEarningId(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("validation_error", "earningId required", 400);
  }
  const value = (body as { earningId?: unknown }).earningId;
  if (typeof value !== "string" || !isAdminWithdrawalId(value)) {
    throw new AppError("validation_error", "earningId required", 400);
  }
  return value;
}

export async function handleAdminWithdrawals(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const withdrawals = await loadAdminWithdrawals(req.query.status);
    res.json({
      withdrawals,
      workflow: ADMIN_WITHDRAWAL_WORKFLOW,
      note: ADMIN_WITHDRAWAL_MANUAL_NOTE,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin list withdrawals failed");
  }
}

export async function handleAdminWithdrawalAction(
  req: AuthedRequest,
  res: Response,
  action: AdminWithdrawalAction,
): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const withdrawalId = String(req.params.id ?? "");
  if (!isAdminWithdrawalId(withdrawalId)) {
    throw new AppError("validation_error", "Invalid withdrawal", 400);
  }
  const note = parseAdminWithdrawalNote(req.body?.adminNote, actionRequiresNote(action));
  try {
    const withdrawal = await applyWithdrawalAction(req.userId as string, withdrawalId, action, note);
    res.json({ withdrawal });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, `admin withdrawal ${action} failed`);
  }
}

export async function handleAdminChargeback(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const earningId = parseEarningId(req.body);
  try {
    res.json(await applyAdminEarningChargeback(req.userId as string, earningId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin chargeback failed");
  }
}

export async function handleAdminUnfreeze(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = String(req.params.userId ?? "");
  if (!isAdminWithdrawalId(userId)) {
    throw new AppError("validation_error", "Invalid user", 400);
  }
  try {
    res.json(await applyAdminUnfreeze(req.userId as string, userId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin unfreeze failed");
  }
}
