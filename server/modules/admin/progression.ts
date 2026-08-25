import type { PoolClient } from "pg";
import type { Response } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { applyWalletDelta, parseCoinCount } from "../wallet/ledger.js";
import {
  DEFAULT_BATTLE_ENERGY_CAPS,
  ENGAGEMENT_FLAG_KEYS,
  HIGH_IMPACT_FLAG_KEYS,
  dailyPolicyAllowsClaim,
  isSchemaUnavailable,
  listEngagementFlagDetail,
  mergeEngagementFlags,
  parseBattleEnergyCaps,
  parseDailyRewardPolicy,
  parseFlagOverrides,
  resolveBattleEnergyCaps,
  resolveDailyRewardPolicy,
  resolveEngagementFlags,
  type BattleEnergyCaps,
  type DailyRewardPolicy,
  type EngagementFlagKey,
  type EngagementFlagRow,
  type EngagementFlags,
} from "../engagement/settings.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION_AUDIENCES = ["all_authenticated", "creators_only", "viewers_only", "new_users"] as const;
const XP_AMOUNT_MAX = 1_000_000;
const LEVEL_XP_MAX = 9_000_000_000;
const ADJUST_ABS_MAX = 9_000_000_000;

export type MissionAudience = (typeof MISSION_AUDIENCES)[number];

export type AdminXpConfig = {
  source: string;
  xpAmount: number;
  enabled: boolean;
  description: string;
};

export type AdminLevelRow = {
  level: number;
  totalXpRequired: number;
  title: string | null;
  badgeCode: string | null;
};

export type AdminMissionRow = {
  id: string;
  scope: string;
  title: string;
  description: string;
  goalCount: number;
  rewardXp: number;
  rewardPromoCoins: number;
  rewardEnergy: number;
  metricKey: string;
  enabled: boolean;
  sortOrder: number;
  audience: MissionAudience;
  startsAt: string | null;
  endsAt: string | null;
  archived: boolean;
};

export type AdminDailyReward = {
  streakDay: number;
  rewardXp: number;
  rewardPromoCoins: number;
  rewardLabel: string | null;
};

export type AdminProgressionSnapshot = {
  starterCoinBalance: number;
  totalXp: number;
  currentLevel: number;
};

export type AdminAuditEntry = {
  id: string;
  adminUserId: string;
  action: string;
  target: string;
  createdAt: string;
};

export type MissionAdminMeta = {
  audience: MissionAudience;
  starts_at: string | null;
  ends_at: string | null;
  archived: boolean;
};

function toAdminCapsJson(caps: BattleEnergyCaps) {
  return {
    watchAmount: caps.watch_amount,
    commentAmount: caps.comment_amount,
    shareAmount: caps.share_amount,
    watchCap: caps.watch_cap,
    commentCap: caps.comment_cap,
    shareCap: caps.share_cap,
    storageCap: caps.storage_cap,
    sessionCap: caps.session_cap,
    dailyCap: caps.daily_cap,
    minimumBoost: caps.minimum_boost,
    allowedBoostValues: caps.allowed_boost_values,
    fanEnergyThreshold: caps.fan_energy_threshold,
    scoreMultiplier: caps.score_multiplier,
    boostDurationSec: caps.boost_duration_sec,
    enabled: caps.enabled,
  };
}

function toAdminPolicyJson(policy: DailyRewardPolicy) {
  return {
    streakResetPolicy: policy.streak_reset_policy,
    effectiveStart: policy.effective_start,
    effectiveEnd: policy.effective_end,
    active: policy.active,
  };
}

function toAdminFlagRowsJson(detail: { flags: EngagementFlags; rows: EngagementFlagRow[] }) {
  return {
    flags: detail.flags,
    rows: detail.rows.map((row) => ({
      key: row.key,
      effective: row.effective,
      defaultValue: row.default_value,
      envValue: row.env_value,
      adminValue: row.admin_value,
      lastChangedBy: row.last_changed_by,
      lastChangedAt: row.last_changed_at,
      reason: row.reason,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
}

function requireActor(req: AuthedRequest): string {
  if (!req.userId) throw new AppError("unauthenticated", "Sign in required", 401);
  return req.userId;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string): void {
  logger.error({ err: error }, label);
  if (isSchemaUnavailable(error)) {
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

function parseUuid(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) {
    throw new AppError("validation_error", `${label} required`, 400);
  }
  return raw.trim();
}

function parseBoundedInt(raw: unknown, label: string, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new AppError("validation_error", `${label} invalid`, 400);
  }
  if (raw < min || raw > max) throw new AppError("validation_error", `${label} invalid`, 400);
  return raw;
}

function parseOptionalInt(raw: unknown, label: string, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  return parseBoundedInt(raw, label, min, max);
}

function parseOptionalBool(raw: unknown, label: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") throw new AppError("validation_error", `${label} invalid`, 400);
  return raw;
}

function parseOptionalText(raw: unknown, label: string, max: number, allowEmpty: boolean): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null) return null;
  if (typeof raw !== "string") throw new AppError("validation_error", `${label} invalid`, 400);
  const value = raw.trim();
  if (value.length > max) throw new AppError("validation_error", `${label} too long`, 400);
  if (!value && !allowEmpty) throw new AppError("validation_error", `${label} required`, 400);
  return value || null;
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new AppError("validation_error", "UNKNOWN_FIELD", 400);
  }
}

async function writeAudit(
  client: PoolClient,
  adminUserId: string,
  action: string,
  target: string,
  previousValue: unknown,
  newValue: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO engagement_admin_audit
       (admin_user_id, action, target, previous_value, new_value)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [adminUserId, action, target, JSON.stringify(previousValue ?? null), JSON.stringify(newValue ?? null)],
  );
}

async function upsertSetting(client: PoolClient, key: string, value: unknown): Promise<void> {
  await client.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

async function readSetting(client: PoolClient, key: string): Promise<unknown> {
  const { rows } = await client.query<{ value_json: unknown }>(
    `SELECT value_json FROM engagement_settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value_json ?? null;
}

export function parseXpConfigPatch(body: unknown): { source: string; xpAmount: number; enabled: boolean } {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, ["source", "xpAmount", "enabled", "description"]);
  if (typeof body.source !== "string" || !body.source.trim() || body.source.trim().length > 100) {
    throw new AppError("validation_error", "source invalid", 400);
  }
  return {
    source: body.source.trim(),
    xpAmount: parseBoundedInt(body.xpAmount, "xpAmount", 0, XP_AMOUNT_MAX),
    enabled: parseOptionalBool(body.enabled, "enabled") ?? true,
  };
}

export function parseLevelPatch(body: unknown): {
  level: number;
  totalXpRequired: number;
  title: string | null;
  badgeCode: string | null;
} {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, ["level", "totalXpRequired", "title", "badgeCode", "cosmeticPayload"]);
  return {
    level: parseBoundedInt(body.level, "level", 1, 1000),
    totalXpRequired: parseBoundedInt(body.totalXpRequired, "totalXpRequired", 1, LEVEL_XP_MAX),
    title: parseOptionalText(body.title, "title", 100, true) ?? null,
    badgeCode: parseOptionalText(body.badgeCode, "badgeCode", 100, true) ?? null,
  };
}

export function parseAdjustment(body: unknown): {
  userId: string;
  amountDelta: number;
  reason: string;
  idempotencyKey: string;
} {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, ["userId", "amountDelta", "reason", "idempotencyKey"]);
  const amountDelta = parseBoundedInt(body.amountDelta, "amountDelta", -ADJUST_ABS_MAX, ADJUST_ABS_MAX);
  if (amountDelta === 0) throw new AppError("validation_error", "Adjustment cannot be zero", 400);
  const reason = parseOptionalText(body.reason, "reason", 1000, false);
  if (!reason || reason.length < 3) throw new AppError("validation_error", "reason required", 400);
  const idempotencyKey = parseOptionalText(body.idempotencyKey, "idempotencyKey", 200, false);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new AppError("validation_error", "idempotencyKey required", 400);
  }
  return {
    userId: parseUuid(body.userId, "userId"),
    amountDelta,
    reason,
    idempotencyKey,
  };
}

export function parseMissionPatch(body: unknown): {
  title?: string;
  description?: string | null;
  goalCount?: number;
  rewardXp?: number;
  rewardPromoCoins?: number;
  rewardEnergy?: number;
  enabled?: boolean;
  sortOrder?: number;
  audience?: MissionAudience;
  startsAt?: string | null;
  endsAt?: string | null;
} {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, [
    "title",
    "description",
    "goalCount",
    "rewardXp",
    "rewardPromoCoins",
    "rewardEnergy",
    "enabled",
    "sortOrder",
    "audience",
    "startsAt",
    "endsAt",
  ]);
  const audience = body.audience;
  if (audience !== undefined) {
    if (typeof audience !== "string" || !(MISSION_AUDIENCES as readonly string[]).includes(audience)) {
      throw new AppError("validation_error", "audience invalid", 400);
    }
  }
  return {
    title: parseOptionalText(body.title, "title", 200, false) ?? undefined,
    description: parseOptionalText(body.description, "description", 1000, true),
    goalCount: parseOptionalInt(body.goalCount, "goalCount", 1, 1_000_000),
    rewardXp: parseOptionalInt(body.rewardXp, "rewardXp", 0, XP_AMOUNT_MAX),
    rewardPromoCoins: parseOptionalInt(body.rewardPromoCoins, "rewardPromoCoins", 0, XP_AMOUNT_MAX),
    rewardEnergy: parseOptionalInt(body.rewardEnergy, "rewardEnergy", 0, XP_AMOUNT_MAX),
    enabled: parseOptionalBool(body.enabled, "enabled"),
    sortOrder: parseOptionalInt(body.sortOrder, "sortOrder", 0, 10_000),
    audience: audience as MissionAudience | undefined,
    startsAt: parseOptionalText(body.startsAt, "startsAt", 40, true),
    endsAt: parseOptionalText(body.endsAt, "endsAt", 40, true),
  };
}

export function parseDailyRewardPatch(body: unknown): AdminDailyReward {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, ["streakDay", "rewardXp", "rewardPromoCoins", "rewardLabel"]);
  const label = parseOptionalText(body.rewardLabel, "rewardLabel", 200, false);
  if (!label) throw new AppError("validation_error", "rewardLabel required", 400);
  return {
    streakDay: parseBoundedInt(body.streakDay, "streakDay", 1, 7),
    rewardXp: parseBoundedInt(body.rewardXp, "rewardXp", 0, XP_AMOUNT_MAX),
    rewardPromoCoins: parseBoundedInt(body.rewardPromoCoins, "rewardPromoCoins", 0, XP_AMOUNT_MAX),
    rewardLabel: label,
  };
}

export function parseDailyPolicyPatch(body: unknown): Partial<DailyRewardPolicy> {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, ["streakResetPolicy", "effectiveStart", "effectiveEnd", "active"]);
  const policy: Partial<DailyRewardPolicy> = {};
  if (body.streakResetPolicy !== undefined) {
    if (body.streakResetPolicy !== "miss_one_day" && body.streakResetPolicy !== "never") {
      throw new AppError("validation_error", "streakResetPolicy invalid", 400);
    }
    policy.streak_reset_policy = body.streakResetPolicy;
  }
  if (body.effectiveStart !== undefined) {
    policy.effective_start = parseOptionalText(body.effectiveStart, "effectiveStart", 40, true) ?? null;
  }
  if (body.effectiveEnd !== undefined) {
    policy.effective_end = parseOptionalText(body.effectiveEnd, "effectiveEnd", 40, true) ?? null;
  }
  if (body.active !== undefined) policy.active = parseOptionalBool(body.active, "active");
  return policy;
}

export function parseBattleEnergyCapsPatch(body: unknown): Partial<BattleEnergyCaps> {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, [
    "watchAmount",
    "commentAmount",
    "shareAmount",
    "watchCap",
    "commentCap",
    "shareCap",
    "storageCap",
    "sessionCap",
    "dailyCap",
    "minimumBoost",
    "allowedBoostValues",
    "fanEnergyThreshold",
    "scoreMultiplier",
    "boostDurationSec",
    "enabled",
  ]);
  const patch: Partial<BattleEnergyCaps> = {};
  const intFields = [
    ["watchAmount", "watch_amount", 0, 10_000],
    ["commentAmount", "comment_amount", 0, 10_000],
    ["shareAmount", "share_amount", 0, 10_000],
    ["watchCap", "watch_cap", 0, 1_000_000],
    ["commentCap", "comment_cap", 0, 1_000_000],
    ["shareCap", "share_cap", 0, 1_000_000],
    ["storageCap", "storage_cap", 0, 10_000_000],
    ["sessionCap", "session_cap", 0, 1_000_000],
    ["dailyCap", "daily_cap", 0, 10_000_000],
    ["minimumBoost", "minimum_boost", 1, 100],
    ["fanEnergyThreshold", "fan_energy_threshold", 1, 100_000_000],
    ["boostDurationSec", "boost_duration_sec", 1, 120],
  ] as const;
  for (const [jsonField, internal, min, max] of intFields) {
    if (body[jsonField] !== undefined) {
      (patch as Record<string, number>)[internal] = parseBoundedInt(body[jsonField], jsonField, min, max);
    }
  }
  if (body.scoreMultiplier !== undefined) {
    if (typeof body.scoreMultiplier !== "number" || !Number.isFinite(body.scoreMultiplier)) {
      throw new AppError("validation_error", "scoreMultiplier invalid", 400);
    }
    if (body.scoreMultiplier < 1 || body.scoreMultiplier > 5) {
      throw new AppError("validation_error", "scoreMultiplier invalid", 400);
    }
    patch.score_multiplier = body.scoreMultiplier;
  }
  if (body.allowedBoostValues !== undefined) {
    if (!Array.isArray(body.allowedBoostValues) || body.allowedBoostValues.length > 20) {
      throw new AppError("validation_error", "allowedBoostValues invalid", 400);
    }
    patch.allowed_boost_values = body.allowedBoostValues.map((value, index) =>
      parseBoundedInt(value, `allowedBoostValues.${index}`, 1, 100),
    );
  }
  if (body.enabled !== undefined) patch.enabled = parseOptionalBool(body.enabled, "enabled");
  return patch;
}

export function parseFeatureFlagPatch(body: unknown): {
  flags: Partial<EngagementFlags>;
  reason: string;
  confirm: boolean;
} {
  if (!isRecord(body)) throw new AppError("validation_error", "No fields to update", 400);
  rejectUnknownFields(body, [...ENGAGEMENT_FLAG_KEYS, "reason", "confirm"]);
  const flags: Partial<EngagementFlags> = {};
  for (const key of ENGAGEMENT_FLAG_KEYS) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") throw new AppError("validation_error", `${key} invalid`, 400);
      flags[key] = body[key];
    }
  }
  if (Object.keys(flags).length === 0) throw new AppError("validation_error", "At least one flag required", 400);
  const reason = parseOptionalText(body.reason, "reason", 500, true) ?? "";
  const confirm = body.confirm === true;
  const highImpact = HIGH_IMPACT_FLAG_KEYS.some((key) => typeof flags[key] === "boolean");
  if (highImpact && !confirm) {
    throw new AppError("validation_error", "CONFIRM_REQUIRED", 400);
  }
  return { flags, reason, confirm };
}

function defaultMissionMeta(): MissionAdminMeta {
  return { audience: "all_authenticated", starts_at: null, ends_at: null, archived: false };
}

function parseMissionMetaMap(raw: unknown): Record<string, MissionAdminMeta> {
  if (!isRecord(raw)) return {};
  const out: Record<string, MissionAdminMeta> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const audience =
      typeof value.audience === "string" && (MISSION_AUDIENCES as readonly string[]).includes(value.audience)
        ? (value.audience as MissionAudience)
        : "all_authenticated";
    out[id] = {
      audience,
      starts_at: typeof value.starts_at === "string" ? value.starts_at : null,
      ends_at: typeof value.ends_at === "string" ? value.ends_at : null,
      archived: value.archived === true,
    };
  }
  return out;
}

async function loadMissionMeta(client: PoolClient): Promise<Record<string, MissionAdminMeta>> {
  return parseMissionMetaMap(await readSetting(client, "mission_admin_meta"));
}

async function listXpConfig(): Promise<AdminXpConfig[]> {
  const { rows } = await getPool().query<{
    source: string;
    xp_amount: string;
    enabled: boolean;
    description: string;
  }>(
    `SELECT source, xp_amount::text AS xp_amount, enabled, description
     FROM xp_activity_config
     ORDER BY source ASC`,
  );
  return rows.map((row) => ({
    source: row.source,
    xpAmount: requiredCount(row.xp_amount, "XP amount"),
    enabled: row.enabled === true,
    description: row.description,
  }));
}

async function listLevels(): Promise<AdminLevelRow[]> {
  const { rows } = await getPool().query<{
    level: number;
    total_xp_required: string;
    title: string | null;
    badge_code: string | null;
  }>(
    `SELECT level, total_xp_required::text AS total_xp_required, title, badge_code
     FROM xp_level_requirements
     ORDER BY level ASC`,
  );
  return rows.map((row) => ({
    level: requiredCount(row.level, "level"),
    totalXpRequired: requiredCount(row.total_xp_required, "XP threshold"),
    title: row.title,
    badgeCode: row.badge_code,
  }));
}

async function listMissions(): Promise<AdminMissionRow[]> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      scope: string;
      title: string;
      description: string;
      goal_count: string;
      reward_xp: string;
      reward_promo_coins: string;
      reward_energy: string;
      metric_key: string;
      enabled: boolean;
      sort_order: number;
    }>(
      `SELECT id, scope, title, description, goal_count::text AS goal_count,
              reward_xp::text AS reward_xp, reward_promo_coins::text AS reward_promo_coins,
              reward_energy::text AS reward_energy, metric_key, enabled, sort_order
       FROM engagement_missions
       ORDER BY scope, sort_order, id`,
    );
    const meta = await loadMissionMeta(client);
    return rows.map((row) => {
      const extra = meta[row.id] || defaultMissionMeta();
      return {
        id: row.id,
        scope: row.scope,
        title: row.title,
        description: row.description,
        goalCount: requiredCount(row.goal_count, "goal"),
        rewardXp: requiredCount(row.reward_xp, "mission XP"),
        rewardPromoCoins: requiredCount(row.reward_promo_coins, "mission promo"),
        rewardEnergy: requiredCount(row.reward_energy, "mission energy"),
        metricKey: row.metric_key,
        enabled: row.enabled === true,
        sortOrder: requiredCount(row.sort_order, "sort_order"),
        audience: extra.audience,
        startsAt: extra.starts_at,
        endsAt: extra.ends_at,
        archived: extra.archived,
      };
    });
  });
}

async function listDailyRewards(): Promise<AdminDailyReward[]> {
  const { rows } = await getPool().query<{
    streak_day: number;
    reward_xp: string;
    reward_promo_coins: string;
    reward_label: string;
  }>(
    `SELECT streak_day, reward_xp::text AS reward_xp,
            reward_promo_coins::text AS reward_promo_coins, reward_label
     FROM daily_reward_config
     ORDER BY streak_day ASC`,
  );
  return rows.map((row) => ({
    streakDay: requiredCount(row.streak_day, "streak_day"),
    rewardXp: requiredCount(row.reward_xp, "daily XP"),
    rewardPromoCoins: requiredCount(row.reward_promo_coins, "daily promo"),
    rewardLabel: row.reward_label,
  }));
}

async function listAudit(limit: number): Promise<AdminAuditEntry[]> {
  const { rows } = await getPool().query<{
    id: string;
    admin_user_id: string;
    action: string;
    target: string;
    created_at: Date;
  }>(
    `SELECT id::text AS id, admin_user_id::text AS admin_user_id, action, target, created_at
     FROM engagement_admin_audit
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    target: row.target,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

async function snapshotUser(client: PoolClient, userId: string): Promise<AdminProgressionSnapshot> {
  const user = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (!user.rows[0]) throw new AppError("not_found", "USER_NOT_FOUND", 404);
  await client.query(`INSERT INTO user_engagement (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const wallet = await client.query<{ starter_coins: string }>(
    `SELECT starter_coins::text AS starter_coins FROM wallet_balances WHERE user_id = $1`,
    [userId],
  );
  if (!wallet.rows[0]) throw new AppError("unavailable", "Wallet not found", 503);
  const progress = await client.query<{ total_xp: string; fan_level: string }>(
    `SELECT total_xp::text AS total_xp, fan_level::text AS fan_level
     FROM user_engagement WHERE user_id = $1`,
    [userId],
  );
  if (!progress.rows[0]) throw new AppError("unavailable", "Progression not found", 503);
  return {
    starterCoinBalance: requiredCount(wallet.rows[0].starter_coins, "Starter"),
    totalXp: requiredCount(progress.rows[0].total_xp, "XP"),
    currentLevel: requiredCount(progress.rows[0].fan_level, "Level"),
  };
}

async function recomputeFanLevel(client: PoolClient, userId: string, totalXp: number): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM xp_level_requirements`);
  if (!rows[0] || rows[0].n <= 0) throw new AppError("unavailable", "Fan level config is unreadable", 503);
  const level = await client.query<{ level: string }>(
    `SELECT COALESCE(MAX(level), 0)::text AS level
     FROM xp_level_requirements
     WHERE total_xp_required <= $1`,
    [totalXp],
  );
  const fanLevel = requiredCount(level.rows[0]?.level ?? 0, "Fan level");
  await client.query(`UPDATE user_engagement SET fan_level = $2, updated_at = NOW() WHERE user_id = $1`, [
    userId,
    fanLevel,
  ]);
  return fanLevel;
}

export async function handleAdminProgressionConfig(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json({ config: await listXpConfig() });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression config load");
  }
}

export async function handleAdminProgressionPatchConfig(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseXpConfigPatch(req.body);
  try {
    const config = await withTransaction(async (client) => {
      const prev = await client.query<{
        source: string;
        xp_amount: string;
        enabled: boolean;
        description: string;
      }>(
        `SELECT source, xp_amount::text AS xp_amount, enabled, description
         FROM xp_activity_config WHERE source = $1 FOR UPDATE`,
        [patch.source],
      );
      if (!prev.rows[0]) throw new AppError("not_found", "SOURCE_NOT_FOUND", 404);
      const updated = await client.query<{
        source: string;
        xp_amount: string;
        enabled: boolean;
        description: string;
      }>(
        `UPDATE xp_activity_config
            SET xp_amount = $2, enabled = $3, updated_at = NOW()
          WHERE source = $1
          RETURNING source, xp_amount::text AS xp_amount, enabled, description`,
        [patch.source, patch.xpAmount, patch.enabled],
      );
      const next = updated.rows[0];
      if (!next) throw new AppError("unavailable", "CONFIG_UPDATE_FAILED", 500);
      await writeAudit(client, actorId, "xp_config_update", patch.source, prev.rows[0], next);
      return {
        source: next.source,
        xpAmount: requiredCount(next.xp_amount, "XP amount"),
        enabled: next.enabled === true,
        description: next.description,
      };
    });
    res.json({ config });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression config update");
  }
}

export async function handleAdminProgressionLevels(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json({ levels: await listLevels() });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression levels load");
  }
}

export async function handleAdminProgressionPutLevel(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseLevelPatch(req.body);
  try {
    const level = await withTransaction(async (client) => {
      await client.query(`LOCK TABLE xp_level_requirements IN SHARE ROW EXCLUSIVE MODE`);
      const existing = await client.query<{
        level: number;
        total_xp_required: string;
        title: string | null;
        badge_code: string | null;
      }>(
        `SELECT level, total_xp_required::text AS total_xp_required, title, badge_code
         FROM xp_level_requirements WHERE level = $1`,
        [patch.level],
      );
      if (!existing.rows[0]) throw new AppError("not_found", "LEVEL_NOT_FOUND", 404);
      const neighbors = await client.query<{ previous_xp: string | null; next_xp: string | null }>(
        `SELECT
           (SELECT MAX(total_xp_required)::text FROM xp_level_requirements WHERE level < $1) AS previous_xp,
           (SELECT MIN(total_xp_required)::text FROM xp_level_requirements WHERE level > $1) AS next_xp`,
        [patch.level],
      );
      const previousXp = neighbors.rows[0]?.previous_xp == null ? null : requiredCount(neighbors.rows[0].previous_xp, "previous XP");
      const nextXp = neighbors.rows[0]?.next_xp == null ? null : requiredCount(neighbors.rows[0].next_xp, "next XP");
      if ((previousXp != null && patch.totalXpRequired <= previousXp) || (nextXp != null && patch.totalXpRequired >= nextXp)) {
        throw new AppError(
          "validation_error",
          "Level XP must be greater than the previous level and lower than the next level.",
          400,
        );
      }
      const updated = await client.query<{
        level: number;
        total_xp_required: string;
        title: string | null;
        badge_code: string | null;
      }>(
        `UPDATE xp_level_requirements
            SET total_xp_required = $2, title = $3, badge_code = $4, updated_at = NOW()
          WHERE level = $1
          RETURNING level, total_xp_required::text AS total_xp_required, title, badge_code`,
        [patch.level, patch.totalXpRequired, patch.title, patch.badgeCode],
      );
      const next = updated.rows[0];
      if (!next) throw new AppError("unavailable", "LEVEL_UPDATE_FAILED", 500);
      await client.query(
        `UPDATE user_engagement ue
            SET fan_level = COALESCE(
                  (SELECT MAX(level) FROM xp_level_requirements WHERE total_xp_required <= ue.total_xp),
                  0
                ),
                updated_at = NOW()`,
      );
      await writeAudit(client, actorId, "level_update", `level_${patch.level}`, existing.rows[0], next);
      return {
        level: requiredCount(next.level, "level"),
        totalXpRequired: requiredCount(next.total_xp_required, "XP threshold"),
        title: next.title,
        badgeCode: next.badge_code,
      };
    });
    res.json({ level });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression level update");
  }
}

export async function handleAdminProgressionUser(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  const userId = parseUuid(req.params.userId, "userId");
  try {
    const result = await withTransaction(async (client) => {
      const progression = await snapshotUser(client, userId);
      const xp = await client.query<{
        id: string;
        xp_amount: string;
        source: string;
        created_at: Date;
      }>(
        `SELECT id::text AS id, xp_amount::text AS xp_amount, source, created_at
         FROM xp_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId],
      );
      const starter = await client.query<{
        id: string;
        amount_delta: string;
        kind: string;
        balance_after: string;
      }>(
        `SELECT id::text AS id, delta::text AS amount_delta, reason AS kind, balance_after::text AS balance_after
         FROM wallet_ledger
         WHERE user_id = $1 AND bucket = 'starter'
         ORDER BY created_at DESC
         LIMIT 200`,
        [userId],
      );
      return {
        progression,
        xpHistory: xp.rows.map((row) => {
          const amount = Number(row.xp_amount);
          if (!Number.isInteger(amount) || !Number.isSafeInteger(amount)) {
            throw new AppError("unavailable", "xpAmount is unreadable", 503);
          }
          return {
            id: row.id,
            xpAmount: amount,
            source: row.source,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          };
        }),
        starterHistory: starter.rows.map((row) => {
          const delta = Number(row.amount_delta);
          if (!Number.isInteger(delta) || !Number.isSafeInteger(delta)) {
            throw new AppError("unavailable", "amountDelta is unreadable", 503);
          }
          return {
            id: row.id,
            amountDelta: delta,
            kind: row.kind,
            balanceAfter: requiredCount(row.balance_after, "balanceAfter"),
          };
        }),
      };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression user load");
  }
}

export async function handleAdminProgressionXpAdjust(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseAdjustment(req.body);
  try {
    const progression = await withTransaction(async (client) => {
      const key = `admin-xp:${patch.idempotencyKey}`;
      const existing = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM xp_transactions WHERE idempotency_key = $1`,
        [key],
      );
      if (existing.rows[0]) return snapshotUser(client, patch.userId);
      await client.query(`INSERT INTO user_engagement (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [
        patch.userId,
      ]);
      const before = await client.query<{ total_xp: string }>(
        `SELECT total_xp::text AS total_xp FROM user_engagement WHERE user_id = $1 FOR UPDATE`,
        [patch.userId],
      );
      if (!before.rows[0]) throw new AppError("not_found", "USER_NOT_FOUND", 404);
      const oldXp = requiredCount(before.rows[0].total_xp, "XP");
      const applied = Math.max(-oldXp, patch.amountDelta);
      if (applied === 0) return snapshotUser(client, patch.userId);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO xp_transactions
           (user_id, xp_amount, source, related_activity_type, idempotency_key, admin_user_id, reason)
         VALUES ($1, $2, 'admin_adjustment', 'admin', $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id::text AS id`,
        [patch.userId, applied, key, actorId, patch.reason],
      );
      if (!inserted.rows[0]) return snapshotUser(client, patch.userId);
      const newXp = oldXp + applied;
      await client.query(`UPDATE user_engagement SET total_xp = $2, updated_at = NOW() WHERE user_id = $1`, [
        patch.userId,
        newXp,
      ]);
      await recomputeFanLevel(client, patch.userId, newXp);
      const next = await snapshotUser(client, patch.userId);
      await writeAudit(client, actorId, "xp_adjustment", patch.userId, { total_xp: oldXp }, {
        total_xp: next.totalXp,
        current_level: next.currentLevel,
        amount_delta: applied,
        reason: patch.reason,
        idempotency_key: key,
      });
      return next;
    });
    res.json({ progression });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin XP adjustment");
  }
}

export async function handleAdminProgressionStarterAdjust(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseAdjustment(req.body);
  try {
    const progression = await withTransaction(async (client) => {
      const key = `admin-starter:${patch.idempotencyKey}`;
      const existing = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM wallet_ledger WHERE idempotency_key = $1`,
        [key],
      );
      if (existing.rows[0]) return snapshotUser(client, patch.userId);
      const before = await snapshotUser(client, patch.userId);
      const applied = Math.max(-before.starterCoinBalance, patch.amountDelta);
      if (applied === 0) return before;
      await applyWalletDelta(client, {
        userId: patch.userId,
        bucket: "starter",
        delta: applied,
        reason: "admin_adjustment",
        idempotencyKey: key,
        refType: "admin_starter",
        refId: actorId,
      });
      const next = await snapshotUser(client, patch.userId);
      await writeAudit(client, actorId, "starter_adjustment", patch.userId, { starter_coin_balance: before.starterCoinBalance }, {
        starter_coin_balance: next.starterCoinBalance,
        amount_delta: applied,
        reason: patch.reason,
        idempotency_key: key,
      });
      return next;
    });
    res.json({ progression });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin starter adjustment");
  }
}

export async function handleAdminProgressionMissions(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json({ missions: await listMissions() });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin missions load");
  }
}

export async function handleAdminProgressionPatchMission(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const missionId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!missionId || missionId.length > 80) throw new AppError("validation_error", "mission id invalid", 400);
  const patch = parseMissionPatch(req.body);
  try {
    const mission = await withTransaction(async (client) => {
      const prev = await client.query<{
        id: string;
        scope: string;
        title: string;
        description: string;
        goal_count: string;
        reward_xp: string;
        reward_promo_coins: string;
        reward_energy: string;
        metric_key: string;
        enabled: boolean;
        sort_order: number;
      }>(
        `SELECT id, scope, title, description, goal_count::text AS goal_count,
                reward_xp::text AS reward_xp, reward_promo_coins::text AS reward_promo_coins,
                reward_energy::text AS reward_energy, metric_key, enabled, sort_order
         FROM engagement_missions WHERE id = $1 FOR UPDATE`,
        [missionId],
      );
      if (!prev.rows[0]) throw new AppError("not_found", "MISSION_NOT_FOUND", 404);
      const claimed = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM user_mission_progress WHERE mission_id = $1 AND claimed = TRUE`,
        [missionId],
      );
      const lockRewards = (claimed.rows[0]?.c || 0) > 0;
      const row = prev.rows[0];
      const nextGoal = lockRewards
        ? requiredCount(row.goal_count, "goal")
        : (patch.goalCount ?? requiredCount(row.goal_count, "goal"));
      const nextXp = lockRewards ? requiredCount(row.reward_xp, "mission XP") : (patch.rewardXp ?? requiredCount(row.reward_xp, "mission XP"));
      const nextPromo = lockRewards
        ? requiredCount(row.reward_promo_coins, "mission promo")
        : (patch.rewardPromoCoins ?? requiredCount(row.reward_promo_coins, "mission promo"));
      const nextEnergy = lockRewards
        ? requiredCount(row.reward_energy, "mission energy")
        : (patch.rewardEnergy ?? requiredCount(row.reward_energy, "mission energy"));
      const updated = await client.query<{
        id: string;
        scope: string;
        title: string;
        description: string;
        goal_count: string;
        reward_xp: string;
        reward_promo_coins: string;
        reward_energy: string;
        metric_key: string;
        enabled: boolean;
        sort_order: number;
      }>(
        `UPDATE engagement_missions
            SET title = $2,
                description = $3,
                goal_count = $4,
                reward_xp = $5,
                reward_promo_coins = $6,
                reward_energy = $7,
                enabled = $8,
                sort_order = $9
          WHERE id = $1
          RETURNING id, scope, title, description, goal_count::text AS goal_count,
                    reward_xp::text AS reward_xp, reward_promo_coins::text AS reward_promo_coins,
                    reward_energy::text AS reward_energy, metric_key, enabled, sort_order`,
        [
          missionId,
          patch.title ?? row.title,
          patch.description !== undefined ? patch.description ?? "" : row.description,
          nextGoal,
          nextXp,
          nextPromo,
          nextEnergy,
          patch.enabled ?? row.enabled,
          patch.sortOrder ?? requiredCount(row.sort_order, "sort_order"),
        ],
      );
      const next = updated.rows[0];
      if (!next) throw new AppError("unavailable", "MISSION_UPDATE_FAILED", 500);
      const allMeta = await loadMissionMeta(client);
      const prevMeta = allMeta[missionId] || defaultMissionMeta();
      const nextMeta: MissionAdminMeta = {
        audience: patch.audience ?? prevMeta.audience,
        starts_at: patch.startsAt !== undefined ? patch.startsAt : prevMeta.starts_at,
        ends_at: patch.endsAt !== undefined ? patch.endsAt : prevMeta.ends_at,
        archived: prevMeta.archived,
      };
      allMeta[missionId] = nextMeta;
      await upsertSetting(client, "mission_admin_meta", allMeta);
      await writeAudit(client, actorId, "mission_update", missionId, { ...row, meta: prevMeta }, { ...next, meta: nextMeta });
      return {
        id: next.id,
        scope: next.scope,
        title: next.title,
        description: next.description,
        goalCount: requiredCount(next.goal_count, "goal"),
        rewardXp: requiredCount(next.reward_xp, "mission XP"),
        rewardPromoCoins: requiredCount(next.reward_promo_coins, "mission promo"),
        rewardEnergy: requiredCount(next.reward_energy, "mission energy"),
        metricKey: next.metric_key,
        enabled: next.enabled === true,
        sortOrder: requiredCount(next.sort_order, "sort_order"),
        audience: nextMeta.audience,
        startsAt: nextMeta.starts_at,
        endsAt: nextMeta.ends_at,
        archived: nextMeta.archived,
      };
    });
    res.json({ mission });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin mission update");
  }
}

export async function handleAdminProgressionArchiveMission(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const missionId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!missionId) throw new AppError("validation_error", "mission id invalid", 400);
  try {
    const result = await withTransaction(async (client) => {
      const prev = await client.query<{ id: string; enabled: boolean }>(
        `SELECT id, enabled FROM engagement_missions WHERE id = $1 FOR UPDATE`,
        [missionId],
      );
      if (!prev.rows[0]) throw new AppError("not_found", "MISSION_NOT_FOUND", 404);
      const updated = await client.query<{ id: string; enabled: boolean }>(
        `UPDATE engagement_missions SET enabled = FALSE WHERE id = $1 RETURNING id, enabled`,
        [missionId],
      );
      const allMeta = await loadMissionMeta(client);
      const prevMeta = allMeta[missionId] || defaultMissionMeta();
      const nextMeta = { ...prevMeta, archived: true };
      allMeta[missionId] = nextMeta;
      await upsertSetting(client, "mission_admin_meta", allMeta);
      await writeAudit(client, actorId, "mission_archive", missionId, { ...prev.rows[0], meta: prevMeta }, {
        ...updated.rows[0],
        meta: nextMeta,
      });
      return { mission: updated.rows[0], claimedCount: 0 };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin mission archive");
  }
}

export async function handleAdminProgressionDailyRewards(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json({
      rewards: await listDailyRewards(),
      policy: toAdminPolicyJson(await resolveDailyRewardPolicy()),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin daily rewards load");
  }
}

export async function handleAdminProgressionPutDailyReward(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseDailyRewardPatch(req.body);
  try {
    const reward = await withTransaction(async (client) => {
      const prev = await client.query<{
        streak_day: number;
        reward_xp: string;
        reward_promo_coins: string;
        reward_label: string;
      }>(
        `SELECT streak_day, reward_xp::text AS reward_xp,
                reward_promo_coins::text AS reward_promo_coins, reward_label
         FROM daily_reward_config WHERE streak_day = $1 FOR UPDATE`,
        [patch.streakDay],
      );
      if (!prev.rows[0]) throw new AppError("validation_error", "INVALID_STREAK_DAY", 400);
      const updated = await client.query<{
        streak_day: number;
        reward_xp: string;
        reward_promo_coins: string;
        reward_label: string;
      }>(
        `UPDATE daily_reward_config
            SET reward_xp = $2, reward_promo_coins = $3, reward_label = $4
          WHERE streak_day = $1
          RETURNING streak_day, reward_xp::text AS reward_xp,
                    reward_promo_coins::text AS reward_promo_coins, reward_label`,
        [patch.streakDay, patch.rewardXp, patch.rewardPromoCoins, patch.rewardLabel],
      );
      const next = updated.rows[0];
      if (!next) throw new AppError("unavailable", "DAILY_REWARD_UPDATE_FAILED", 500);
      await writeAudit(client, actorId, "daily_reward_update", `day_${patch.streakDay}`, prev.rows[0], next);
      return {
        streakDay: requiredCount(next.streak_day, "streak_day"),
        rewardXp: requiredCount(next.reward_xp, "daily XP"),
        rewardPromoCoins: requiredCount(next.reward_promo_coins, "daily promo"),
        rewardLabel: next.reward_label,
      };
    });
    res.json({ reward });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin daily reward update");
  }
}

export async function handleAdminProgressionPutDailyPolicy(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseDailyPolicyPatch(req.body);
  try {
    const policy = await withTransaction(async (client) => {
      const prev = parseDailyRewardPolicy(await readSetting(client, "daily_reward_policy"));
      const next: DailyRewardPolicy = {
        streak_reset_policy: patch.streak_reset_policy ?? prev.streak_reset_policy,
        effective_start: patch.effective_start !== undefined ? patch.effective_start : prev.effective_start,
        effective_end: patch.effective_end !== undefined ? patch.effective_end : prev.effective_end,
        active: patch.active ?? prev.active,
      };
      if (!dailyPolicyAllowsClaim({ ...next, active: true }) && next.effective_start && next.effective_end) {
        const start = new Date(next.effective_start);
        const end = new Date(next.effective_end);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
          throw new AppError("validation_error", "effective window invalid", 400);
        }
      }
      await upsertSetting(client, "daily_reward_policy", next);
      await writeAudit(client, actorId, "daily_policy_update", "daily_reward_policy", prev, next);
      return next;
    });
    res.json({ policy: toAdminPolicyJson(policy) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin daily policy update");
  }
}

export async function handleAdminProgressionBattleCaps(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json({ caps: toAdminCapsJson(await resolveBattleEnergyCaps()) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin energy caps load");
  }
}

export async function handleAdminProgressionPutBattleCaps(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseBattleEnergyCapsPatch(req.body);
  try {
    const caps = await withTransaction(async (client) => {
      const prev = parseBattleEnergyCaps(await readSetting(client, "battle_energy_caps"));
      const next: BattleEnergyCaps = { ...DEFAULT_BATTLE_ENERGY_CAPS, ...prev, ...patch };
      if (!next.allowed_boost_values.length) next.allowed_boost_values = [...prev.allowed_boost_values];
      await upsertSetting(client, "battle_energy_caps", next);
      await writeAudit(client, actorId, "battle_energy_caps_update", "battle_energy_caps", prev, next);
      return next;
    });
    res.json({ caps: toAdminCapsJson(caps) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin energy caps update");
  }
}

export async function handleAdminProgressionFeatureFlags(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    res.json(toAdminFlagRowsJson(await listEngagementFlagDetail()));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin feature flags load");
  }
}

export async function handleAdminProgressionPatchFeatureFlags(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const patch = parseFeatureFlagPatch(req.body);
  try {
    const detail = await withTransaction(async (client) => {
      const prevOverrides = parseFlagOverrides(await readSetting(client, "feature_flags"));
      const nextOverrides = { ...prevOverrides, ...patch.flags };
      const metaRaw = await readSetting(client, "feature_flags_meta");
      const prevMeta = isRecord(metaRaw) ? { ...metaRaw } : {};
      const changedAt = new Date().toISOString();
      for (const key of Object.keys(patch.flags) as EngagementFlagKey[]) {
        prevMeta[key] = {
          last_changed_by: actorId,
          last_changed_at: changedAt,
          reason: patch.reason || null,
          admin_value: patch.flags[key],
        };
      }
      await upsertSetting(client, "feature_flags", nextOverrides);
      await upsertSetting(client, "feature_flags_meta", prevMeta);
      const envFlags = (await import("../engagement/settings.js")).getEngagementFlagsFromEnv();
      const prev = mergeEngagementFlags(envFlags, prevOverrides);
      const next = mergeEngagementFlags(envFlags, nextOverrides);
      await writeAudit(client, actorId, "feature_flags_update", "feature_flags", { flags: prev, reason: patch.reason || null }, {
        flags: next,
        reason: patch.reason || null,
      });
      return listEngagementFlagDetail(client);
    });
    res.json(toAdminFlagRowsJson(detail));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin feature flags update");
  }
}

export async function handleAdminProgressionAudit(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  const raw = Number(req.query.limit || 50);
  const limit = Number.isInteger(raw) ? Math.min(100, Math.max(1, raw)) : 50;
  try {
    res.json({ entries: await listAudit(limit) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin progression audit load");
  }
}

export { resolveEngagementFlags, resolveDailyRewardPolicy, dailyPolicyAllowsClaim };
