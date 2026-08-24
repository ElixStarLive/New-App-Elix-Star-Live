import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import type {
  RisingStarsBadge,
  RisingStarsCategory,
  RisingStarsChallenge,
  RisingStarsRegion,
  RisingStarsReward,
  RisingStarsSeason,
  RisingStarsStanding,
  RisingStarsTeam,
} from "../../../shared/contracts/risingStars.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SEASON_STATUSES = new Set(["draft", "active", "closed"]);
const CHALLENGE_STATUSES = new Set(["scheduled", "open", "voting", "qualified", "final", "closed"]);
const REWARD_KINDS = new Set([
  "badge",
  "cosmetic",
  "featured",
  "cash_off_platform",
  "creator_credit_manual",
  "none",
]);

export function isRisingStarsUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function requireRisingStarsUuid(value: string, label: string): string {
  const id = value.trim();
  if (!isRisingStarsUuid(id)) throw new AppError("validation_error", `${label} required`, 400);
  return id;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("unavailable", `${label} is unreadable`, 503);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new AppError("unavailable", "Rising Stars text is unreadable", 503);
  }
  return value;
}

function isoRequired(value: Date | string | null, label: string): string {
  if (value == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("unavailable", `${label} is unreadable`, 503);
  }
  return date.toISOString();
}

function intRequired(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return Math.trunc(n);
}

function countryCodes(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new AppError("unavailable", "Region codes are unreadable", 503);
  return value.map((item) => {
    if (typeof item !== "string") throw new AppError("unavailable", "Region codes are unreadable", 503);
    return item;
  });
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new AppError("unavailable", "Reward payload is unreadable", 503);
}

function mapSeason(row: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  created_by: string | null;
  created_at: Date;
}): RisingStarsSeason {
  const status = requiredText(row.status, "Season status");
  if (!SEASON_STATUSES.has(status)) {
    throw new AppError("unavailable", "Season status is unreadable", 503);
  }
  return {
    id: requiredText(row.id, "Season id"),
    slug: requiredText(row.slug, "Season slug"),
    title: typeof row.title === "string" ? row.title : "",
    description: optionalText(row.description),
    starts_at: isoRequired(row.starts_at, "Season start"),
    ends_at: isoRequired(row.ends_at, "Season end"),
    status: status as RisingStarsSeason["status"],
    created_by: optionalText(row.created_by),
    created_at: isoRequired(row.created_at, "Season created"),
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
  opens_at: Date;
  closes_at: Date;
  status: string;
  leaderboard_frozen: boolean;
}): RisingStarsChallenge {
  const status = requiredText(row.status, "Challenge status");
  if (!CHALLENGE_STATUSES.has(status)) {
    throw new AppError("unavailable", "Challenge status is unreadable", 503);
  }
  return {
    id: requiredText(row.id, "Challenge id"),
    season_id: requiredText(row.season_id, "Challenge season"),
    category_id: requiredText(row.category_id, "Challenge category"),
    region_id: optionalText(row.region_id),
    week_index: intRequired(row.week_index, "Challenge week"),
    title: typeof row.title === "string" ? row.title : "",
    description: optionalText(row.description),
    sound_track_id: typeof row.sound_track_id === "string" ? row.sound_track_id : "",
    opens_at: isoRequired(row.opens_at, "Challenge open"),
    closes_at: isoRequired(row.closes_at, "Challenge close"),
    status: status as RisingStarsChallenge["status"],
    leaderboard_frozen: Boolean(row.leaderboard_frozen),
  };
}

export function assignStandingRanks(
  rows: Array<Omit<RisingStarsStanding, "rank">>,
): RisingStarsStanding[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getCurrentRisingStarsSeason(): Promise<RisingStarsSeason | null> {
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
  }>(
    `SELECT id, slug, title, description, starts_at, ends_at, status, created_by, created_at
     FROM rs_seasons
     WHERE status = 'active'
     ORDER BY starts_at DESC
     LIMIT 1`,
  );
  return rows[0] ? mapSeason(rows[0]) : null;
}

export async function getRisingStarsSeasonById(seasonId: string): Promise<RisingStarsSeason | null> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
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
  }>(
    `SELECT id, slug, title, description, starts_at, ends_at, status, created_by, created_at
     FROM rs_seasons
     WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapSeason(rows[0]) : null;
}

export async function listRisingStarsCategories(seasonId: string): Promise<RisingStarsCategory[]> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
  const { rows } = await getPool().query<{
    id: string;
    season_id: string;
    slug: string;
    title: string;
    sort_order: number;
    is_active: boolean;
  }>(
    `SELECT id, season_id, slug, title, sort_order, is_active
     FROM rs_categories
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, title ASC`,
    [id],
  );
  return rows.map((row) => ({
    id: requiredText(row.id, "Category id"),
    season_id: requiredText(row.season_id, "Category season"),
    slug: requiredText(row.slug, "Category slug"),
    title: typeof row.title === "string" ? row.title : "",
    sort_order: intRequired(row.sort_order, "Category order"),
    is_active: Boolean(row.is_active),
  }));
}

export async function listRisingStarsRegions(seasonId: string): Promise<RisingStarsRegion[]> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
  const { rows } = await getPool().query<{
    id: string;
    season_id: string;
    slug: string;
    title: string;
    country_codes: unknown;
    sort_order: number;
    is_active: boolean;
  }>(
    `SELECT id, season_id, slug, title, country_codes, sort_order, is_active
     FROM rs_regions
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, title ASC`,
    [id],
  );
  return rows.map((row) => ({
    id: requiredText(row.id, "Region id"),
    season_id: requiredText(row.season_id, "Region season"),
    slug: requiredText(row.slug, "Region slug"),
    title: typeof row.title === "string" ? row.title : "",
    country_codes: countryCodes(row.country_codes),
    sort_order: intRequired(row.sort_order, "Region order"),
    is_active: Boolean(row.is_active),
  }));
}

export async function listRisingStarsChallenges(input: {
  seasonId: string;
  categoryId?: string;
  regionId?: string;
  week?: number;
}): Promise<RisingStarsChallenge[]> {
  const seasonId = requireRisingStarsUuid(input.seasonId, "seasonId");
  const params: unknown[] = [seasonId];
  let sql = `SELECT id, season_id, category_id, region_id, week_index, title, description,
                    sound_track_id, opens_at, closes_at, status, leaderboard_frozen
             FROM rs_challenges
             WHERE season_id = $1`;
  if (input.categoryId) {
    params.push(requireRisingStarsUuid(input.categoryId, "categoryId"));
    sql += ` AND category_id = $${params.length}`;
  }
  if (input.regionId) {
    params.push(requireRisingStarsUuid(input.regionId, "regionId"));
    sql += ` AND region_id = $${params.length}`;
  }
  if (input.week != null && Number.isFinite(input.week)) {
    params.push(Math.trunc(input.week));
    sql += ` AND week_index = $${params.length}`;
  }
  sql += ` ORDER BY week_index ASC, opens_at ASC`;
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
  }>(sql, params);
  return rows.map((row) => mapChallenge(row));
}

export async function listRisingStarsStandings(seasonId: string): Promise<RisingStarsStanding[]> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
  const { rows } = await getPool().query<{
    creator_user_id: string;
    username: string;
    avatar_url: string | null;
    total_votes: number;
    entries: number;
  }>(
    `SELECT e.user_id AS creator_user_id,
            COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(u.display_name), ''), 'Creator') AS username,
            u.avatar_url,
            COALESCE(SUM(e.vote_count), 0)::int AS total_votes,
            COUNT(e.id)::int AS entries
     FROM rs_entries e
     JOIN rs_challenges c ON c.id = e.challenge_id
     JOIN users u ON u.id = e.user_id
     WHERE c.season_id = $1
       AND e.status IN ('active', 'advanced', 'eliminated')
     GROUP BY e.user_id, u.username, u.display_name, u.avatar_url
     ORDER BY total_votes DESC
     LIMIT 100`,
    [id],
  );
  return assignStandingRanks(
    rows.map((row) => ({
      creator_user_id: requiredText(row.creator_user_id, "Standing user"),
      username: typeof row.username === "string" && row.username.trim() ? row.username : "Creator",
      avatar_url: optionalText(row.avatar_url),
      total_votes: intRequired(row.total_votes, "Standing votes"),
      entries: intRequired(row.entries, "Standing entries"),
    })),
  );
}

export async function listRisingStarsTeams(seasonId: string, regionId?: string): Promise<RisingStarsTeam[]> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
  const params: unknown[] = [id];
  let sql = `SELECT t.id, t.season_id, t.region_id, t.name, t.slug, t.captain_user_id,
                    COALESCE(SUM(e.vote_count) FILTER (WHERE e.status IN ('active', 'advanced')), 0)::int AS team_votes,
                    COUNT(DISTINCT tm.user_id)::int AS member_count
             FROM rs_teams t
             LEFT JOIN rs_team_members tm ON tm.team_id = t.id
             LEFT JOIN rs_entries e ON e.team_id = t.id
             WHERE t.season_id = $1`;
  if (regionId) {
    params.push(requireRisingStarsUuid(regionId, "regionId"));
    sql += ` AND t.region_id = $${params.length}`;
  }
  sql += ` GROUP BY t.id ORDER BY team_votes DESC, t.name ASC`;
  const { rows } = await getPool().query<{
    id: string;
    season_id: string;
    region_id: string | null;
    name: string;
    slug: string;
    captain_user_id: string | null;
    team_votes: number;
    member_count: number;
  }>(sql, params);
  return rows.map((row) => ({
    id: requiredText(row.id, "Team id"),
    season_id: requiredText(row.season_id, "Team season"),
    region_id: optionalText(row.region_id),
    name: typeof row.name === "string" ? row.name : "",
    slug: requiredText(row.slug, "Team slug"),
    captain_user_id: optionalText(row.captain_user_id),
    team_votes: intRequired(row.team_votes, "Team votes"),
    member_count: intRequired(row.member_count, "Team members"),
  }));
}

export async function listRisingStarsRewards(seasonId: string): Promise<RisingStarsReward[]> {
  const id = requireRisingStarsUuid(seasonId, "seasonId");
  const { rows } = await getPool().query<{
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
    `SELECT id, season_id, place_from, place_to, category_id, region_id, reward_kind, payload, is_active
     FROM rs_reward_definitions
     WHERE season_id = $1 AND is_active = TRUE
     ORDER BY place_from ASC`,
    [id],
  );
  return rows.map((row) => {
    const kind = requiredText(row.reward_kind, "Reward kind");
    if (!REWARD_KINDS.has(kind)) throw new AppError("unavailable", "Reward kind is unreadable", 503);
    return {
      id: requiredText(row.id, "Reward id"),
      season_id: requiredText(row.season_id, "Reward season"),
      place_from: intRequired(row.place_from, "Reward place from"),
      place_to: intRequired(row.place_to, "Reward place to"),
      category_id: optionalText(row.category_id),
      region_id: optionalText(row.region_id),
      reward_kind: kind as RisingStarsReward["reward_kind"],
      payload: payloadRecord(row.payload),
      is_active: Boolean(row.is_active),
    };
  });
}

export async function listRisingStarsBadgesForUser(userId: string): Promise<RisingStarsBadge[]> {
  const id = requireRisingStarsUuid(userId, "userId");
  const { rows } = await getPool().query<{
    badge_id: string;
    season_id: string;
    code: string;
    title: string;
    image_url: string | null;
    kind: string;
    challenge_id: string | null;
    awarded_at: Date;
  }>(
    `SELECT b.id AS badge_id, b.season_id, b.code, b.title, b.image_url, b.kind,
            ub.challenge_id, ub.awarded_at
     FROM rs_user_badges ub
     JOIN rs_badges b ON b.id = ub.badge_id
     WHERE ub.user_id = $1
     ORDER BY ub.awarded_at DESC`,
    [id],
  );
  return rows.map((row) => ({
    badge_id: requiredText(row.badge_id, "Badge id"),
    season_id: requiredText(row.season_id, "Badge season"),
    code: requiredText(row.code, "Badge code"),
    title: typeof row.title === "string" ? row.title : "",
    image_url: optionalText(row.image_url),
    kind: requiredText(row.kind, "Badge kind"),
    challenge_id: optionalText(row.challenge_id),
    awarded_at: isoRequired(row.awarded_at, "Badge awarded"),
  }));
}
