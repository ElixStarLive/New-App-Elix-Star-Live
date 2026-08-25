import type { PoolClient } from "pg";
import type { Response } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]+$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

export const ADMIN_RS_SEASON_LIMIT = 200;
export const ADMIN_RS_CHALLENGE_LIMIT = 200;
export const ADMIN_RS_AUDIT_DEFAULT = 50;
export const ADMIN_RS_AUDIT_MAX = 100;
export const ADMIN_RS_ADVANCE_MAX = 100;

export const ADMIN_RS_SEASON_STATUSES = ["draft", "active", "closed"] as const;
export const ADMIN_RS_CHALLENGE_STATUSES = [
  "scheduled",
  "open",
  "voting",
  "qualified",
  "final",
  "closed",
] as const;
export const ADMIN_RS_SNAPSHOT_PHASES = ["qualifier", "final"] as const;
export const ADMIN_RS_BADGE_KINDS = [
  "participation",
  "top10",
  "finalist",
  "winner",
  "region",
  "team",
  "season",
] as const;
export const ADMIN_RS_REWARD_KINDS = [
  "badge",
  "cosmetic",
  "featured",
  "cash_off_platform",
  "creator_credit_manual",
  "none",
] as const;
export const ADMIN_RS_GRANT_STATUSES = ["pending", "granted", "rejected"] as const;

export type AdminRsSeasonStatus = (typeof ADMIN_RS_SEASON_STATUSES)[number];
export type AdminRsChallengeStatus = (typeof ADMIN_RS_CHALLENGE_STATUSES)[number];
export type AdminRsSnapshotPhase = (typeof ADMIN_RS_SNAPSHOT_PHASES)[number];
export type AdminRsBadgeKind = (typeof ADMIN_RS_BADGE_KINDS)[number];
export type AdminRsRewardKind = (typeof ADMIN_RS_REWARD_KINDS)[number];
export type AdminRsGrantStatus = (typeof ADMIN_RS_GRANT_STATUSES)[number];

export type AdminRsSeason = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: AdminRsSeasonStatus;
  createdBy: string | null;
  createdAt: string;
};

export type AdminRsCategory = {
  id: string;
  seasonId: string;
  slug: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminRsRegion = {
  id: string;
  seasonId: string;
  slug: string;
  title: string;
  countryCodes: string[];
  sortOrder: number;
  isActive: boolean;
};

export type AdminRsChallenge = {
  id: string;
  seasonId: string;
  categoryId: string;
  regionId: string | null;
  weekIndex: number;
  title: string;
  description: string | null;
  soundTrackId: string;
  opensAt: string;
  closesAt: string;
  status: AdminRsChallengeStatus;
  leaderboardFrozen: boolean;
};

export type AdminRsEntry = {
  id: string;
  challengeId: string;
  creatorUserId: string;
  status: string;
};

export type AdminRsAudit = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

export type AdminRsBadge = {
  id: string;
  seasonId: string;
  code: string;
  title: string;
  imageUrl: string | null;
  kind: AdminRsBadgeKind;
};

export type AdminRsRewardDefinition = {
  id: string;
  seasonId: string;
  placeFrom: number;
  placeTo: number;
  categoryId: string | null;
  regionId: string | null;
  rewardKind: AdminRsRewardKind;
  payload: Record<string, unknown>;
  isActive: boolean;
};

export type AdminRsRewardGrant = {
  id: string;
  definitionId: string;
  userId: string;
  challengeId: string | null;
  status: AdminRsGrantStatus;
  notes: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function postgresCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string): void {
  const code = postgresCode(error);
  if (code === "23505") {
    res.status(409).json({ error: "CONFLICT" });
    return;
  }
  logger.error({ err: error }, label);
  if (code === "42P01" || code === "42703") {
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  if (code === "23503") {
    res.status(400).json({ error: "INVALID_REFERENCE" });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

function asIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requireActor(req: AuthedRequest): string {
  if (!req.userId) throw new AppError("unauthenticated", "Sign in required", 401);
  return req.userId;
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
}

export function isAdminRisingStarsId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseAdminRisingStarsId(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !isAdminRisingStarsId(raw)) {
    throw new AppError("validation_error", `${label} required`, 400);
  }
  return raw.trim();
}

export function parseAdminRisingStarsSlug(raw: unknown, min: number, max: number): string {
  if (typeof raw !== "string") throw new AppError("validation_error", "slug required", 400);
  const slug = raw.trim();
  if (slug.length < min || slug.length > max || !SLUG_RE.test(slug)) {
    throw new AppError("validation_error", "Invalid slug", 400);
  }
  return slug;
}

export function parseAdminRisingStarsTitle(raw: unknown, min: number, max: number): string {
  if (typeof raw !== "string") throw new AppError("validation_error", "title required", 400);
  const title = raw.trim();
  if (title.length < min || title.length > max) {
    throw new AppError("validation_error", "Invalid title", 400);
  }
  return title;
}

export function parseAdminRisingStarsDescription(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid description", 400);
  const description = raw.trim();
  if (description.length > 2000) throw new AppError("validation_error", "description too long", 400);
  return description || null;
}

export function parseAdminRisingStarsIsoDate(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError("validation_error", `${label} required`, 400);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("validation_error", `${label} invalid`, 400);
  }
  return date.toISOString();
}

export function assertAdminRisingStarsDateOrder(startIso: string, endIso: string): void {
  if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
    throw new AppError("validation_error", "start must be before end", 400);
  }
}

export function parseAdminRisingStarsSeasonStatus(raw: unknown): AdminRsSeasonStatus {
  const status = raw == null || raw === "" ? "draft" : raw;
  if (typeof status !== "string" || !(ADMIN_RS_SEASON_STATUSES as readonly string[]).includes(status)) {
    throw new AppError("validation_error", "Invalid season status", 400);
  }
  return status as AdminRsSeasonStatus;
}

export function parseAdminRisingStarsChallengeStatus(raw: unknown, optional: boolean): AdminRsChallengeStatus {
  if ((raw == null || raw === "") && optional) return "scheduled";
  if (typeof raw !== "string" || !(ADMIN_RS_CHALLENGE_STATUSES as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid challenge status", 400);
  }
  return raw as AdminRsChallengeStatus;
}

export function parseAdminRisingStarsWeekIndex(raw: unknown): number {
  if (raw == null || raw === "") return 1;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 520) {
    throw new AppError("validation_error", "Invalid weekIndex", 400);
  }
  return raw;
}

export function parseAdminRisingStarsSortOrder(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 10_000) {
    throw new AppError("validation_error", "Invalid sortOrder", 400);
  }
  return raw;
}

export function parseAdminRisingStarsCountryCodes(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new AppError("validation_error", "Invalid countryCodes", 400);
  if (raw.length > 20) throw new AppError("validation_error", "Invalid countryCodes", 400);
  return raw.map((item) => {
    if (typeof item !== "string" || !COUNTRY_RE.test(item.trim().toUpperCase())) {
      throw new AppError("validation_error", "Invalid countryCodes", 400);
    }
    return item.trim().toUpperCase();
  });
}

export function parseAdminRisingStarsSnapshotPhase(raw: unknown): AdminRsSnapshotPhase {
  if (typeof raw !== "string" || !(ADMIN_RS_SNAPSHOT_PHASES as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid phase", 400);
  }
  return raw as AdminRsSnapshotPhase;
}

export function parseAdminRisingStarsAdvanceTopN(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > ADMIN_RS_ADVANCE_MAX) {
    throw new AppError("validation_error", "Invalid advanceTopN", 400);
  }
  return raw;
}

export function parseAdminRisingStarsFrozen(raw: unknown): boolean {
  if (typeof raw !== "boolean") throw new AppError("validation_error", "frozen required", 400);
  return raw;
}

export function parseAdminRisingStarsBadgeKind(raw: unknown): AdminRsBadgeKind {
  if (typeof raw !== "string" || !(ADMIN_RS_BADGE_KINDS as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid badge kind", 400);
  }
  return raw as AdminRsBadgeKind;
}

export function parseAdminRisingStarsRewardKind(raw: unknown): AdminRsRewardKind {
  if (typeof raw !== "string" || !(ADMIN_RS_REWARD_KINDS as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid rewardKind", 400);
  }
  return raw as AdminRsRewardKind;
}

export function parseAdminRisingStarsGrantStatus(raw: unknown): AdminRsGrantStatus {
  if (raw == null || raw === "") return "pending";
  if (typeof raw !== "string" || !(ADMIN_RS_GRANT_STATUSES as readonly string[]).includes(raw)) {
    throw new AppError("validation_error", "Invalid grant status", 400);
  }
  return raw as AdminRsGrantStatus;
}

export function parseAdminRisingStarsOptionalUrl(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid imageUrl", 400);
  const url = raw.trim();
  if (url.length > 500 || !/^https?:\/\//i.test(url)) {
    throw new AppError("validation_error", "Invalid imageUrl", 400);
  }
  return url;
}

export function parseAdminRisingStarsPayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (!isRecord(raw)) throw new AppError("validation_error", "Invalid payload", 400);
  if ("client_secret" in raw || "password_hash" in raw || "DATABASE_URL" in raw) {
    throw new AppError("validation_error", "Invalid payload", 400);
  }
  return raw;
}

export function parseAdminRisingStarsAuditLimit(raw: unknown): number {
  if (raw == null || raw === "") return ADMIN_RS_AUDIT_DEFAULT;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) throw new AppError("validation_error", "Invalid limit", 400);
  return Math.min(ADMIN_RS_AUDIT_MAX, Math.trunc(n));
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new AppError("validation_error", "UNKNOWN_FIELD", 400);
    }
  }
}

function mapSeason(row: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}): AdminRsSeason {
  const starts = asIso(row.starts_at);
  const ends = asIso(row.ends_at);
  const created = asIso(row.created_at);
  if (!starts || !ends || !created) throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  if (!(ADMIN_RS_SEASON_STATUSES as readonly string[]).includes(row.status)) {
    throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    startsAt: starts,
    endsAt: ends,
    status: row.status as AdminRsSeasonStatus,
    createdBy: row.created_by,
    createdAt: created,
  };
}

function mapCategory(row: {
  id: string;
  season_id: string;
  slug: string;
  title: string;
  sort_order: number;
  is_active: boolean;
}): AdminRsCategory {
  return {
    id: row.id,
    seasonId: row.season_id,
    slug: row.slug,
    title: row.title,
    sortOrder: Number(row.sort_order) || 0,
    isActive: Boolean(row.is_active),
  };
}

function mapRegion(row: {
  id: string;
  season_id: string;
  slug: string;
  title: string;
  country_codes: unknown;
  sort_order: number;
  is_active: boolean;
}): AdminRsRegion {
  const codes = Array.isArray(row.country_codes) ? row.country_codes.map(String) : [];
  return {
    id: row.id,
    seasonId: row.season_id,
    slug: row.slug,
    title: row.title,
    countryCodes: codes,
    sortOrder: Number(row.sort_order) || 0,
    isActive: Boolean(row.is_active),
  };
}

function mapChallenge(row: {
  id: string;
  season_id: string;
  category_id: string;
  region_id: string | null;
  week_index: number;
  title: string;
  description: string | null;
  sound_track_id: string;
  opens_at: Date | string;
  closes_at: Date | string;
  status: string;
  leaderboard_frozen: boolean;
}): AdminRsChallenge {
  const opens = asIso(row.opens_at);
  const closes = asIso(row.closes_at);
  if (!opens || !closes) throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  if (!(ADMIN_RS_CHALLENGE_STATUSES as readonly string[]).includes(row.status)) {
    throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
  }
  return {
    id: row.id,
    seasonId: row.season_id,
    categoryId: row.category_id,
    regionId: row.region_id,
    weekIndex: Number(row.week_index) || 1,
    title: row.title,
    description: row.description,
    soundTrackId: row.sound_track_id,
    opensAt: opens,
    closesAt: closes,
    status: row.status as AdminRsChallengeStatus,
    leaderboardFrozen: Boolean(row.leaderboard_frozen),
  };
}

async function writeRsAudit(
  client: PoolClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO rs_admin_audit (admin_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, entityType, entityId, JSON.stringify(details)],
  );
}

async function requireSeason(client: PoolClient, seasonId: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(`SELECT id::text AS id FROM rs_seasons WHERE id = $1`, [
    seasonId,
  ]);
  if (!rows[0]) throw new AppError("not_found", "Season not found", 404);
}

async function requireCategoryInSeason(client: PoolClient, categoryId: string, seasonId: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM rs_categories WHERE id = $1 AND season_id = $2`,
    [categoryId, seasonId],
  );
  if (!rows[0]) throw new AppError("validation_error", "category_id does not belong to season", 400);
}

async function requireRegionInSeason(client: PoolClient, regionId: string, seasonId: string): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM rs_regions WHERE id = $1 AND season_id = $2`,
    [regionId, seasonId],
  );
  if (!rows[0]) throw new AppError("validation_error", "region_id does not belong to season", 400);
}

const SEASON_SELECT = `SELECT id::text AS id, slug, title, description, starts_at, ends_at, status,
                              created_by::text AS created_by, created_at
                       FROM rs_seasons`;

const CHALLENGE_SELECT = `SELECT id::text AS id, season_id::text AS season_id, category_id::text AS category_id,
                                 region_id::text AS region_id, week_index, title, description, sound_track_id,
                                 opens_at, closes_at, status, leaderboard_frozen
                          FROM rs_challenges`;

export async function handleAdminRisingStarsSeasons(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  try {
    const { rows } = await getPool().query<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      starts_at: Date;
      ends_at: Date;
      status: string;
      created_by: string | null;
      created_at: Date;
    }>(`${SEASON_SELECT} ORDER BY starts_at DESC LIMIT ${ADMIN_RS_SEASON_LIMIT}`);
    res.json({ seasons: rows.map(mapSeason) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars seasons");
  }
}

export async function handleAdminRisingStarsCreateSeason(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["slug", "title", "description", "startsAt", "endsAt", "status"]);
  const slug = parseAdminRisingStarsSlug(req.body.slug, 2, 80);
  const title = parseAdminRisingStarsTitle(req.body.title, 2, 120);
  const description = parseAdminRisingStarsDescription(req.body.description);
  const startsAt = parseAdminRisingStarsIsoDate(req.body.startsAt, "startsAt");
  const endsAt = parseAdminRisingStarsIsoDate(req.body.endsAt, "endsAt");
  assertAdminRisingStarsDateOrder(startsAt, endsAt);
  const status = parseAdminRisingStarsSeasonStatus(req.body.status);
  try {
    const season = await withTransaction(async (client) => {
      const inserted = await client.query<{
        id: string;
        slug: string;
        title: string;
        description: string | null;
        starts_at: Date;
        ends_at: Date;
        status: string;
        created_by: string | null;
        created_at: Date;
      }>(
        `INSERT INTO rs_seasons (slug, title, description, starts_at, ends_at, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text AS id, slug, title, description, starts_at, ends_at, status,
                   created_by::text AS created_by, created_at`,
        [slug, title, description, startsAt, endsAt, status, actorId],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      const mapped = mapSeason(row);
      await writeRsAudit(client, actorId, "create_season", "season", mapped.id, { slug: mapped.slug });
      return mapped;
    });
    res.status(201).json({ season });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create season");
  }
}

export async function handleAdminRisingStarsCreateCategory(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["seasonId", "slug", "title", "sortOrder"]);
  const seasonId = parseAdminRisingStarsId(req.body.seasonId, "seasonId");
  const slug = parseAdminRisingStarsSlug(req.body.slug, 2, 60);
  const title = parseAdminRisingStarsTitle(req.body.title, 2, 80);
  const sortOrder = parseAdminRisingStarsSortOrder(req.body.sortOrder);
  try {
    const category = await withTransaction(async (client) => {
      await requireSeason(client, seasonId);
      const inserted = await client.query<{
        id: string;
        season_id: string;
        slug: string;
        title: string;
        sort_order: number;
        is_active: boolean;
      }>(
        `INSERT INTO rs_categories (season_id, slug, title, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text AS id, season_id::text AS season_id, slug, title, sort_order, is_active`,
        [seasonId, slug, title, sortOrder],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      const mapped = mapCategory(row);
      await writeRsAudit(client, actorId, "create_category", "category", mapped.id, { season_id: seasonId });
      return mapped;
    });
    res.status(201).json({ category });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create category");
  }
}

export async function handleAdminRisingStarsCreateRegion(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["seasonId", "slug", "title", "countryCodes", "sortOrder"]);
  const seasonId = parseAdminRisingStarsId(req.body.seasonId, "seasonId");
  const slug = parseAdminRisingStarsSlug(req.body.slug, 2, 60);
  const title = parseAdminRisingStarsTitle(req.body.title, 2, 80);
  const countryCodes = parseAdminRisingStarsCountryCodes(req.body.countryCodes);
  const sortOrder = parseAdminRisingStarsSortOrder(req.body.sortOrder);
  try {
    const region = await withTransaction(async (client) => {
      await requireSeason(client, seasonId);
      const inserted = await client.query<{
        id: string;
        season_id: string;
        slug: string;
        title: string;
        country_codes: unknown;
        sort_order: number;
        is_active: boolean;
      }>(
        `INSERT INTO rs_regions (season_id, slug, title, country_codes, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id::text AS id, season_id::text AS season_id, slug, title, country_codes, sort_order, is_active`,
        [seasonId, slug, title, JSON.stringify(countryCodes), sortOrder],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      const mapped = mapRegion(row);
      await writeRsAudit(client, actorId, "create_region", "region", mapped.id, { season_id: seasonId });
      return mapped;
    });
    res.status(201).json({ region });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create region");
  }
}

export async function handleAdminRisingStarsChallenges(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  const seasonId = parseAdminRisingStarsId(req.query.seasonId, "seasonId");
  try {
    const { rows } = await getPool().query<{
      id: string;
      season_id: string;
      category_id: string;
      region_id: string | null;
      week_index: number;
      title: string;
      description: string | null;
      sound_track_id: string;
      opens_at: Date;
      closes_at: Date;
      status: string;
      leaderboard_frozen: boolean;
    }>(
      `${CHALLENGE_SELECT}
       WHERE season_id = $1
       ORDER BY week_index ASC, opens_at ASC
       LIMIT ${ADMIN_RS_CHALLENGE_LIMIT}`,
      [seasonId],
    );
    res.json({ challenges: rows.map(mapChallenge) });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars challenges");
  }
}

export async function handleAdminRisingStarsCreateChallenge(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, [
    "seasonId",
    "categoryId",
    "regionId",
    "weekIndex",
    "title",
    "description",
    "soundTrackId",
    "soundMeta",
    "opensAt",
    "closesAt",
    "exclusiveUntil",
    "status",
  ]);
  const seasonId = parseAdminRisingStarsId(req.body.seasonId, "seasonId");
  const categoryId = parseAdminRisingStarsId(req.body.categoryId, "categoryId");
  const regionId =
    req.body.regionId == null || req.body.regionId === ""
      ? null
      : parseAdminRisingStarsId(req.body.regionId, "regionId");
  const weekIndex = parseAdminRisingStarsWeekIndex(req.body.weekIndex);
  const title = parseAdminRisingStarsTitle(req.body.title, 2, 120);
  const description = parseAdminRisingStarsDescription(req.body.description);
  if (typeof req.body.soundTrackId !== "string" || !req.body.soundTrackId.trim()) {
    throw new AppError("validation_error", "soundTrackId required", 400);
  }
  const soundTrackId = req.body.soundTrackId.trim();
  if (soundTrackId.length > 200) throw new AppError("validation_error", "soundTrackId too long", 400);
  const soundMeta = parseAdminRisingStarsPayload(req.body.soundMeta);
  const opensAt = parseAdminRisingStarsIsoDate(req.body.opensAt, "opensAt");
  const closesAt = parseAdminRisingStarsIsoDate(req.body.closesAt, "closesAt");
  assertAdminRisingStarsDateOrder(opensAt, closesAt);
  const exclusiveUntil =
    req.body.exclusiveUntil == null || req.body.exclusiveUntil === ""
      ? null
      : parseAdminRisingStarsIsoDate(req.body.exclusiveUntil, "exclusiveUntil");
  const status = parseAdminRisingStarsChallengeStatus(req.body.status, true);
  try {
    const challenge = await withTransaction(async (client) => {
      await requireSeason(client, seasonId);
      await requireCategoryInSeason(client, categoryId, seasonId);
      if (regionId) await requireRegionInSeason(client, regionId, seasonId);
      const inserted = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(
        `INSERT INTO rs_challenges (
           season_id, category_id, region_id, week_index, title, description,
           sound_track_id, sound_meta, opens_at, closes_at, exclusive_until, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
         RETURNING id::text AS id, season_id::text AS season_id, category_id::text AS category_id,
                   region_id::text AS region_id, week_index, title, description, sound_track_id,
                   opens_at, closes_at, status, leaderboard_frozen`,
        [
          seasonId,
          categoryId,
          regionId,
          weekIndex,
          title,
          description,
          soundTrackId,
          JSON.stringify(soundMeta),
          opensAt,
          closesAt,
          exclusiveUntil,
          status,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      const mapped = mapChallenge(row);
      await writeRsAudit(client, actorId, "create_challenge", "challenge", mapped.id, {
        soundTrackId: mapped.soundTrackId,
      });
      return mapped;
    });
    res.status(201).json({ challenge });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create challenge");
  }
}

export async function handleAdminRisingStarsSetChallengeStatus(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const challengeId = parseAdminRisingStarsId(req.params.id, "id");
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["status"]);
  const nextStatus = parseAdminRisingStarsChallengeStatus(req.body.status, false);
  try {
    const challenge = await withTransaction(async (client) => {
      const locked = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(`${CHALLENGE_SELECT} WHERE id = $1 FOR UPDATE`, [challengeId]);
      if (!locked.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const current = mapChallenge(locked.rows[0]);
      if (current.status === nextStatus) return current;
      const updated = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(
        `UPDATE rs_challenges SET status = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id::text AS id, season_id::text AS season_id, category_id::text AS category_id,
                   region_id::text AS region_id, week_index, title, description, sound_track_id,
                   opens_at, closes_at, status, leaderboard_frozen`,
        [challengeId, nextStatus],
      );
      const mapped = mapChallenge(updated.rows[0]);
      await writeRsAudit(client, actorId, "set_challenge_status", "challenge", mapped.id, {
        previous: current.status,
        status: mapped.status,
      });
      return mapped;
    });
    res.json({ challenge });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars challenge status");
  }
}

export async function handleAdminRisingStarsFreeze(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const challengeId = parseAdminRisingStarsId(req.params.id, "id");
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["frozen"]);
  const frozen = parseAdminRisingStarsFrozen(req.body.frozen);
  try {
    const challenge = await withTransaction(async (client) => {
      const locked = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(`${CHALLENGE_SELECT} WHERE id = $1 FOR UPDATE`, [challengeId]);
      if (!locked.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const current = mapChallenge(locked.rows[0]);
      if (current.leaderboardFrozen === frozen) return current;
      const updated = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(
        `UPDATE rs_challenges SET leaderboard_frozen = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id::text AS id, season_id::text AS season_id, category_id::text AS category_id,
                   region_id::text AS region_id, week_index, title, description, sound_track_id,
                   opens_at, closes_at, status, leaderboard_frozen`,
        [challengeId, frozen],
      );
      const mapped = mapChallenge(updated.rows[0]);
      await writeRsAudit(client, actorId, "freeze_leaderboard", "challenge", mapped.id, {
        previous: current.leaderboardFrozen,
        frozen: mapped.leaderboardFrozen,
      });
      return mapped;
    });
    res.json({ challenge });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars freeze");
  }
}

export async function handleAdminRisingStarsSnapshot(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const challengeId = parseAdminRisingStarsId(req.params.id, "id");
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["phase", "advanceTopN"]);
  const phase = parseAdminRisingStarsSnapshotPhase(req.body.phase);
  const advanceTopN = parseAdminRisingStarsAdvanceTopN(req.body.advanceTopN);
  try {
    const result = await withTransaction(async (client) => {
      const locked = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(`${CHALLENGE_SELECT} WHERE id = $1 FOR UPDATE`, [challengeId]);
      if (!locked.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const board = await client.query<{ id: string; vote_count: number }>(
        `SELECT id::text AS id, vote_count
         FROM rs_entries
         WHERE challenge_id = $1 AND status IN ('active', 'advanced')
         ORDER BY vote_count DESC, created_at ASC
         FOR UPDATE`,
        [challengeId],
      );
      await client.query(`DELETE FROM rs_phase_results WHERE challenge_id = $1 AND phase = $2`, [challengeId, phase]);
      let rank = 0;
      for (const row of board.rows) {
        rank += 1;
        await client.query(
          `INSERT INTO rs_phase_results
             (challenge_id, phase, entry_id, rank, vote_count_snapshot, live_score_snapshot)
           VALUES ($1, $2, $3, $4, $5, 0)`,
          [challengeId, phase, row.id, rank, Number(row.vote_count) || 0],
        );
      }
      if (phase === "qualifier" && advanceTopN > 0) {
        const advanced = board.rows.slice(0, advanceTopN).map((row) => row.id);
        const eliminated = board.rows.slice(advanceTopN).map((row) => row.id);
        if (advanced.length) {
          await client.query(
            `UPDATE rs_entries SET status = 'advanced'
             WHERE id = ANY($1::uuid[])`,
            [advanced],
          );
        }
        if (eliminated.length) {
          await client.query(
            `UPDATE rs_entries SET status = 'eliminated'
             WHERE id = ANY($1::uuid[])`,
            [eliminated],
          );
        }
        await client.query(
          `UPDATE rs_challenges
           SET status = 'qualified', leaderboard_frozen = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [challengeId],
        );
      } else if (phase === "final") {
        await client.query(
          `UPDATE rs_challenges
           SET status = 'closed', leaderboard_frozen = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [challengeId],
        );
      }
      const after = await client.query<{
        id: string;
        season_id: string;
        category_id: string;
        region_id: string | null;
        week_index: number;
        title: string;
        description: string | null;
        sound_track_id: string;
        opens_at: Date;
        closes_at: Date;
        status: string;
        leaderboard_frozen: boolean;
      }>(`${CHALLENGE_SELECT} WHERE id = $1`, [challengeId]);
      const challenge = mapChallenge(after.rows[0]);
      await writeRsAudit(client, actorId, "snapshot_phase", "challenge", challengeId, {
        phase,
        advanceTopN,
        results: board.rows.length,
      });
      return { results: board.rows.length, challenge };
    });
    res.json({ ok: true, results: result.results, challenge: result.challenge });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars snapshot");
  }
}

export async function handleAdminRisingStarsDisqualify(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  const entryId = parseAdminRisingStarsId(req.params.id, "id");
  if (req.body != null && isRecord(req.body)) {
    rejectUnknownFields(req.body, []);
  }
  try {
    const entry = await withTransaction(async (client) => {
      const locked = await client.query<{
        id: string;
        challenge_id: string;
        user_id: string;
        status: string;
      }>(
        `SELECT id::text AS id, challenge_id::text AS challenge_id, user_id::text AS user_id, status
         FROM rs_entries
         WHERE id = $1
         FOR UPDATE`,
        [entryId],
      );
      if (!locked.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const current = locked.rows[0];
      const mapped: AdminRsEntry = {
        id: current.id,
        challengeId: current.challenge_id,
        creatorUserId: current.user_id,
        status: current.status,
      };
      if (current.status === "disqualified") return mapped;
      const updated = await client.query<{
        id: string;
        challenge_id: string;
        user_id: string;
        status: string;
      }>(
        `UPDATE rs_entries SET status = 'disqualified'
         WHERE id = $1
         RETURNING id::text AS id, challenge_id::text AS challenge_id, user_id::text AS user_id, status`,
        [entryId],
      );
      const next = updated.rows[0];
      await writeRsAudit(client, actorId, "disqualify_entry", "entry", next.id, {
        previous: current.status,
        challengeId: next.challenge_id,
      });
      return {
        id: next.id,
        challengeId: next.challenge_id,
        creatorUserId: next.user_id,
        status: next.status,
      };
    });
    res.json({ entry });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars disqualify");
  }
}

export async function handleAdminRisingStarsCreateBadge(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["seasonId", "code", "title", "imageUrl", "kind"]);
  const seasonId = parseAdminRisingStarsId(req.body.seasonId, "seasonId");
  const code = parseAdminRisingStarsSlug(req.body.code, 2, 60);
  const title = parseAdminRisingStarsTitle(req.body.title, 2, 120);
  const imageUrl = parseAdminRisingStarsOptionalUrl(req.body.imageUrl);
  const kind = parseAdminRisingStarsBadgeKind(req.body.kind);
  try {
    const badge = await withTransaction(async (client) => {
      await requireSeason(client, seasonId);
      const inserted = await client.query<{
        id: string;
        season_id: string;
        code: string;
        title: string;
        image_url: string | null;
        kind: string;
      }>(
        `INSERT INTO rs_badges (season_id, code, title, image_url, kind)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::text AS id, season_id::text AS season_id, code, title, image_url, kind`,
        [seasonId, code, title, imageUrl, kind],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      if (!(ADMIN_RS_BADGE_KINDS as readonly string[]).includes(row.kind)) {
        throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
      }
      const mapped: AdminRsBadge = {
        id: row.id,
        seasonId: row.season_id,
        code: row.code,
        title: row.title,
        imageUrl: row.image_url,
        kind: row.kind as AdminRsBadgeKind,
      };
      await writeRsAudit(client, actorId, "create_badge", "badge", mapped.id, { code: mapped.code });
      return mapped;
    });
    res.status(201).json({ badge });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create badge");
  }
}

export async function handleAdminRisingStarsAwardBadge(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["userId", "badgeId", "challengeId"]);
  const userId = parseAdminRisingStarsId(req.body.userId, "userId");
  const badgeId = parseAdminRisingStarsId(req.body.badgeId, "badgeId");
  const challengeId =
    req.body.challengeId == null || req.body.challengeId === ""
      ? null
      : parseAdminRisingStarsId(req.body.challengeId, "challengeId");
  try {
    const result = await withTransaction(async (client) => {
      const badge = await client.query<{ id: string }>(`SELECT id::text AS id FROM rs_badges WHERE id = $1`, [badgeId]);
      if (!badge.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const user = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!user.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const inserted = await client.query<{ user_id: string }>(
        `INSERT INTO rs_user_badges (user_id, badge_id, challenge_id, awarded_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, badge_id) DO NOTHING
         RETURNING user_id::text AS user_id`,
        [userId, badgeId, challengeId, actorId],
      );
      const created = Boolean(inserted.rows[0]);
      if (created) {
        await writeRsAudit(client, actorId, "award_badge", "badge", badgeId, { userId, created: true });
      }
      return { created };
    });
    res.json({ ok: true, created: result.created });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars award badge");
  }
}

export async function handleAdminRisingStarsCreateRewardDefinition(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, [
    "seasonId",
    "placeFrom",
    "placeTo",
    "categoryId",
    "regionId",
    "rewardKind",
    "payload",
  ]);
  const seasonId = parseAdminRisingStarsId(req.body.seasonId, "seasonId");
  if (typeof req.body.placeFrom !== "number" || !Number.isInteger(req.body.placeFrom) || req.body.placeFrom < 1) {
    throw new AppError("validation_error", "Invalid placeFrom", 400);
  }
  if (typeof req.body.placeTo !== "number" || !Number.isInteger(req.body.placeTo) || req.body.placeTo < 1) {
    throw new AppError("validation_error", "Invalid placeTo", 400);
  }
  if (req.body.placeTo < req.body.placeFrom) {
    throw new AppError("validation_error", "placeTo must be >= placeFrom", 400);
  }
  const categoryId =
    req.body.categoryId == null || req.body.categoryId === ""
      ? null
      : parseAdminRisingStarsId(req.body.categoryId, "categoryId");
  const regionId =
    req.body.regionId == null || req.body.regionId === ""
      ? null
      : parseAdminRisingStarsId(req.body.regionId, "regionId");
  const rewardKind = parseAdminRisingStarsRewardKind(req.body.rewardKind);
  const payload = parseAdminRisingStarsPayload(req.body.payload);
  try {
    const reward = await withTransaction(async (client) => {
      await requireSeason(client, seasonId);
      if (categoryId) await requireCategoryInSeason(client, categoryId, seasonId);
      if (regionId) await requireRegionInSeason(client, regionId, seasonId);
      const inserted = await client.query<{
        id: string;
        season_id: string;
        place_from: number;
        place_to: number;
        category_id: string | null;
        region_id: string | null;
        reward_kind: string;
        payload: unknown;
        is_active: boolean;
      }>(
        `INSERT INTO rs_reward_definitions
           (season_id, place_from, place_to, category_id, region_id, reward_kind, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING id::text AS id, season_id::text AS season_id, place_from, place_to,
                   category_id::text AS category_id, region_id::text AS region_id,
                   reward_kind, payload, is_active`,
        [seasonId, req.body.placeFrom, req.body.placeTo, categoryId, regionId, rewardKind, JSON.stringify(payload)],
      );
      const row = inserted.rows[0];
      if (!row) throw new AppError("unavailable", "CREATE_FAILED", 500);
      if (!(ADMIN_RS_REWARD_KINDS as readonly string[]).includes(row.reward_kind)) {
        throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
      }
      const mapped: AdminRsRewardDefinition = {
        id: row.id,
        seasonId: row.season_id,
        placeFrom: Number(row.place_from),
        placeTo: Number(row.place_to),
        categoryId: row.category_id,
        regionId: row.region_id,
        rewardKind: row.reward_kind as AdminRsRewardKind,
        payload: parseAdminRisingStarsPayload(row.payload),
        isActive: Boolean(row.is_active),
      };
      await writeRsAudit(client, actorId, "create_reward_definition", "reward_definition", mapped.id, {
        rewardKind: mapped.rewardKind,
      });
      return mapped;
    });
    res.status(201).json({ reward });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars create reward");
  }
}

export async function handleAdminRisingStarsGrantReward(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  const actorId = requireActor(req);
  if (!isRecord(req.body)) throw new AppError("validation_error", "Invalid body", 400);
  rejectUnknownFields(req.body, ["definitionId", "userId", "challengeId", "status", "notes"]);
  const definitionId = parseAdminRisingStarsId(req.body.definitionId, "definitionId");
  const userId = parseAdminRisingStarsId(req.body.userId, "userId");
  const challengeId =
    req.body.challengeId == null || req.body.challengeId === ""
      ? null
      : parseAdminRisingStarsId(req.body.challengeId, "challengeId");
  const status = parseAdminRisingStarsGrantStatus(req.body.status);
  let notes: string | null = null;
  if (req.body.notes != null && req.body.notes !== "") {
    if (typeof req.body.notes !== "string") throw new AppError("validation_error", "Invalid notes", 400);
    notes = req.body.notes.trim();
    if (notes.length > 2000) throw new AppError("validation_error", "notes too long", 400);
  }
  try {
    const grant = await withTransaction(async (client) => {
      const definition = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM rs_reward_definitions WHERE id = $1`,
        [definitionId],
      );
      if (!definition.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const user = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!user.rows[0]) throw new AppError("not_found", "NOT_FOUND", 404);
      const inserted = await client.query<{
        id: string;
        definition_id: string;
        user_id: string;
        challenge_id: string | null;
        status: string;
        notes: string | null;
      }>(
        `INSERT INTO rs_reward_grants
           (definition_id, user_id, challenge_id, status, granted_by, granted_at, notes)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'granted' THEN NOW() ELSE NULL END, $6)
         ON CONFLICT (definition_id, user_id, challenge_id) DO NOTHING
         RETURNING id::text AS id, definition_id::text AS definition_id, user_id::text AS user_id,
                   challenge_id::text AS challenge_id, status, notes`,
        [definitionId, userId, challengeId, status, actorId, notes],
      );
      const row =
        inserted.rows[0] ??
        (
          await client.query<{
            id: string;
            definition_id: string;
            user_id: string;
            challenge_id: string | null;
            status: string;
            notes: string | null;
          }>(
            `SELECT id::text AS id, definition_id::text AS definition_id, user_id::text AS user_id,
                    challenge_id::text AS challenge_id, status, notes
             FROM rs_reward_grants
             WHERE definition_id = $1 AND user_id = $2
               AND (($3::uuid IS NULL AND challenge_id IS NULL) OR challenge_id = $3)
             LIMIT 1`,
            [definitionId, userId, challengeId],
          )
        ).rows[0];
      if (!row) throw new AppError("unavailable", "GRANT_FAILED", 500);
      if (!(ADMIN_RS_GRANT_STATUSES as readonly string[]).includes(row.status)) {
        throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
      }
      const mapped: AdminRsRewardGrant = {
        id: row.id,
        definitionId: row.definition_id,
        userId: row.user_id,
        challengeId: row.challenge_id,
        status: row.status as AdminRsGrantStatus,
        notes: row.notes,
      };
      if (inserted.rows[0]) {
        await writeRsAudit(client, actorId, "grant_reward", "reward_grant", mapped.id, {
          status: mapped.status,
          userId,
        });
      }
      return mapped;
    });
    res.json({ grant });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars grant reward");
  }
}

export async function handleAdminRisingStarsAudit(req: AuthedRequest, res: Response): Promise<void> {
  noStore(res);
  requireActor(req);
  const limit = parseAdminRisingStarsAuditLimit(req.query.limit);
  try {
    const { rows } = await getPool().query<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      created_at: Date;
    }>(
      `SELECT id::text AS id, action, entity_type, entity_id, created_at
       FROM rs_admin_audit
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    const audit: AdminRsAudit[] = rows.map((row) => {
      const created = asIso(row.created_at);
      if (!created) throw new AppError("unavailable", "SCHEMA_UNAVAILABLE", 503);
      return {
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: created,
      };
    });
    res.json({ audit });
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin rising stars audit");
  }
}
