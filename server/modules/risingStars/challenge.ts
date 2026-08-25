import type { PoolClient } from "pg";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import type {
  RisingStarsChallengeDetail,
  RisingStarsEntry,
  RisingStarsLeaderboardRow,
  RisingStarsTeam,
} from "../../../shared/contracts/risingStars.js";
import { requireRisingStarsUuid } from "./hub.js";

const CHALLENGE_STATUSES = new Set(["scheduled", "open", "voting", "qualified", "final", "closed"]);
const ENTRY_STATUSES = new Set(["pending", "active", "disqualified", "advanced", "eliminated", "withdrawn"]);
const ENTER_STATUSES = new Set(["open", "voting"]);
const VOTE_STATUSES = new Set(["open", "voting", "qualified", "final"]);
const ATTACH_STATUSES = new Set(["open", "voting", "qualified", "final"]);
const BOARD_LIMIT = 50;
const ENTRY_LIMIT = 500;

type ChallengeRow = {
  id: string;
  season_id: string;
  category_id: string;
  region_id: string | null;
  week_index: number;
  title: string;
  description: string | null;
  sound_track_id: string;
  sound_meta: unknown;
  opens_at: Date;
  closes_at: Date;
  status: string;
  leaderboard_frozen: boolean;
  live_qualifier_room_id: string | null;
  live_final_room_id: string | null;
};

type EntryRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  video_id: string | null;
  team_id: string | null;
  status: string;
  vote_count: number;
  created_at: Date;
  username: string | null;
  avatar_url: string | null;
};

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

function soundMeta(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new AppError("unavailable", "Sound metadata is unreadable", 503);
}

function pgCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
}

export function mapChallengeDetail(row: ChallengeRow): RisingStarsChallengeDetail {
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
    sound_meta: soundMeta(row.sound_meta),
    opens_at: isoRequired(row.opens_at, "Challenge open"),
    closes_at: isoRequired(row.closes_at, "Challenge close"),
    status: status as RisingStarsChallengeDetail["status"],
    leaderboard_frozen: Boolean(row.leaderboard_frozen),
    live_qualifier_room_id: optionalText(row.live_qualifier_room_id),
    live_final_room_id: optionalText(row.live_final_room_id),
  };
}

export function mapEntry(row: EntryRow): RisingStarsEntry {
  const status = requiredText(row.status, "Entry status");
  if (!ENTRY_STATUSES.has(status)) {
    throw new AppError("unavailable", "Entry status is unreadable", 503);
  }
  const voteCount = intRequired(row.vote_count, "Entry votes");
  if (voteCount < 0) throw new AppError("unavailable", "Entry votes are unreadable", 503);
  const username =
    typeof row.username === "string" && row.username.trim() ? row.username.trim() : "Creator";
  return {
    id: requiredText(row.id, "Entry id"),
    challenge_id: requiredText(row.challenge_id, "Entry challenge"),
    creator_user_id: requiredText(row.user_id, "Entry creator"),
    video_id: optionalText(row.video_id),
    team_id: optionalText(row.team_id),
    status: status as RisingStarsEntry["status"],
    vote_count: voteCount,
    created_at: isoRequired(row.created_at, "Entry created"),
    username,
    avatar_url: optionalText(row.avatar_url),
  };
}

export function assignChallengeRanks(rows: RisingStarsEntry[]): RisingStarsLeaderboardRow[] {
  return rows.map((entry, index) => ({
    rank: index + 1,
    entry_id: entry.id,
    creator_user_id: entry.creator_user_id,
    video_id: entry.video_id,
    team_id: entry.team_id,
    vote_count: entry.vote_count,
    status: entry.status,
    username: entry.username,
    avatar_url: entry.avatar_url,
  }));
}

const CHALLENGE_SELECT = `SELECT id, season_id, category_id, region_id, week_index, title, description,
                    sound_track_id, sound_meta, opens_at, closes_at, status, leaderboard_frozen,
                    live_qualifier_room_id, live_final_room_id
             FROM rs_challenges`;

const ENTRY_SELECT = `SELECT e.id, e.challenge_id, e.user_id, e.video_id, e.team_id, e.status, e.vote_count, e.created_at,
            COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(u.display_name), ''), 'Creator') AS username,
            u.avatar_url
     FROM rs_entries e
     JOIN users u ON u.id = e.user_id`;

async function loadChallengeRow(challengeId: string): Promise<ChallengeRow> {
  const id = requireRisingStarsUuid(challengeId, "challengeId");
  const { rows } = await getPool().query<ChallengeRow>(`${CHALLENGE_SELECT} WHERE id = $1`, [id]);
  if (!rows[0]) throw new AppError("not_found", "CHALLENGE_NOT_FOUND", 404);
  return rows[0];
}

async function loadEntryByUser(challengeId: string, userId: string): Promise<RisingStarsEntry | null> {
  const { rows } = await getPool().query<EntryRow>(
    `${ENTRY_SELECT} WHERE e.challenge_id = $1 AND e.user_id = $2 LIMIT 1`,
    [challengeId, userId],
  );
  return rows[0] ? mapEntry(rows[0]) : null;
}

async function loadTeamIdsForUser(seasonId: string, userId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ team_id: string }>(
    `SELECT tm.team_id
     FROM rs_team_members tm
     JOIN rs_teams t ON t.id = tm.team_id
     WHERE t.season_id = $1 AND tm.user_id = $2
     ORDER BY tm.joined_at ASC`,
    [seasonId, userId],
  );
  return rows.map((row) => requiredText(row.team_id, "Team id"));
}

async function hasVotedToday(challengeId: string, userId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: number }>(
    `SELECT 1 AS ok FROM rs_votes
     WHERE user_id = $1 AND challenge_id = $2 AND vote_day = CURRENT_DATE
     LIMIT 1`,
    [userId, challengeId],
  );
  return Boolean(rows[0]);
}

export async function getRisingStarsChallengeDetail(
  challengeId: string,
  viewerId: string | null,
): Promise<{
  challenge: RisingStarsChallengeDetail;
  voted_today: boolean;
  my_entry: RisingStarsEntry | null;
  my_team_ids: string[];
}> {
  const row = await loadChallengeRow(challengeId);
  const challenge = mapChallengeDetail(row);
  if (!viewerId) {
    return { challenge, voted_today: false, my_entry: null, my_team_ids: [] };
  }
  const userId = requireRisingStarsUuid(viewerId, "userId");
  const [votedToday, myEntry, myTeamIds] = await Promise.all([
    hasVotedToday(challenge.id, userId),
    loadEntryByUser(challenge.id, userId),
    loadTeamIdsForUser(challenge.season_id, userId),
  ]);
  return {
    challenge,
    voted_today: votedToday,
    my_entry: myEntry,
    my_team_ids: myTeamIds,
  };
}

export async function listRisingStarsChallengeEntries(challengeId: string): Promise<RisingStarsEntry[]> {
  const id = requireRisingStarsUuid(challengeId, "challengeId");
  await loadChallengeRow(id);
  const { rows } = await getPool().query<EntryRow>(
    `${ENTRY_SELECT}
     WHERE e.challenge_id = $1
       AND e.status IN ('active', 'advanced', 'eliminated')
     ORDER BY e.vote_count DESC, e.created_at ASC
     LIMIT $2`,
    [id, ENTRY_LIMIT],
  );
  const seen = new Set<string>();
  const entries: RisingStarsEntry[] = [];
  for (const row of rows) {
    const entry = mapEntry(row);
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

export async function listRisingStarsChallengeLeaderboard(
  challengeId: string,
): Promise<RisingStarsLeaderboardRow[]> {
  const entries = await listRisingStarsChallengeEntries(challengeId);
  return assignChallengeRanks(entries.slice(0, BOARD_LIMIT));
}

export async function getRisingStarsChallengeLive(challengeId: string): Promise<{
  qualifier_room_id: string | null;
  final_room_id: string | null;
  status: RisingStarsChallengeDetail["status"];
}> {
  const challenge = mapChallengeDetail(await loadChallengeRow(challengeId));
  return {
    qualifier_room_id: challenge.live_qualifier_room_id,
    final_room_id: challenge.live_final_room_id,
    status: challenge.status,
  };
}

async function loadOwnedVideo(
  client: PoolClient,
  videoId: string,
  userId: string,
): Promise<{ id: string; sound_id: string | null }> {
  const id = requireRisingStarsUuid(videoId, "videoId");
  const { rows } = await client.query<{ id: string; user_id: string; sound_id: string | null; deleted_at: Date | null }>(
    `SELECT id, user_id, sound_id, deleted_at FROM videos WHERE id = $1`,
    [id],
  );
  const video = rows[0];
  if (!video || video.deleted_at) throw new AppError("not_found", "VIDEO_NOT_FOUND", 404);
  if (video.user_id !== userId) throw new AppError("forbidden", "VIDEO_NOT_OWNED", 403);
  return { id: video.id, sound_id: video.sound_id };
}

export async function enterRisingStarsChallenge(input: {
  challengeId: string;
  userId: string;
  videoId: string;
  teamId?: string | null;
}): Promise<RisingStarsEntry> {
  const challengeId = requireRisingStarsUuid(input.challengeId, "challengeId");
  const userId = requireRisingStarsUuid(input.userId, "userId");
  const videoId = requireRisingStarsUuid(input.videoId, "videoId");
  const teamId = input.teamId ? requireRisingStarsUuid(input.teamId, "teamId") : null;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<ChallengeRow>(`${CHALLENGE_SELECT} WHERE id = $1 FOR UPDATE`, [challengeId]);
    if (!locked.rows[0]) {
      await client.query("ROLLBACK");
      throw new AppError("not_found", "CHALLENGE_NOT_FOUND", 404);
    }
    const challenge = mapChallengeDetail(locked.rows[0]);
    if (!ENTER_STATUSES.has(challenge.status)) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "CHALLENGE_CLOSED", 409);
    }
    if (challenge.leaderboard_frozen) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "LEADERBOARD_FROZEN", 409);
    }
    const window = await client.query<{ open: boolean }>(
      `SELECT (opens_at <= NOW() AND closes_at >= NOW()) AS open
       FROM rs_challenges WHERE id = $1`,
      [challengeId],
    );
    if (!window.rows[0]?.open) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "OUTSIDE_ENTRY_WINDOW", 409);
    }
    const video = await loadOwnedVideo(client, videoId, userId);
    if (challenge.sound_track_id && video.sound_id !== challenge.sound_track_id) {
      await client.query("ROLLBACK");
      throw new AppError("validation_error", "SOUND_MISMATCH", 400);
    }
    if (teamId) {
      const member = await client.query(
        `SELECT 1 FROM rs_team_members WHERE team_id = $1 AND user_id = $2`,
        [teamId, userId],
      );
      if (!member.rows[0]) {
        await client.query("ROLLBACK");
        throw new AppError("forbidden", "NOT_TEAM_MEMBER", 403);
      }
    }
    await client.query(
      `INSERT INTO rs_entries (challenge_id, user_id, video_id, team_id, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (challenge_id, user_id) DO NOTHING`,
      [challengeId, userId, video.id, teamId],
    );
    const existing = await client.query<EntryRow>(
      `${ENTRY_SELECT} WHERE e.challenge_id = $1 AND e.user_id = $2 LIMIT 1`,
      [challengeId, userId],
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "ALREADY_ENTERED", 409);
    }
    await client.query("COMMIT");
    return mapEntry(existing.rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (error instanceof AppError) throw error;
    if (pgCode(error) === "23505") throw new AppError("conflict", "ALREADY_ENTERED", 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function withdrawRisingStarsEntry(entryId: string, userId: string): Promise<void> {
  const id = requireRisingStarsUuid(entryId, "entryId");
  const ownerId = requireRisingStarsUuid(userId, "userId");
  const { rows } = await getPool().query<{ id: string }>(
    `UPDATE rs_entries e
     SET status = 'withdrawn'
     FROM rs_challenges c
     WHERE e.id = $1
       AND e.user_id = $2
       AND e.challenge_id = c.id
       AND e.status IN ('pending', 'active')
       AND c.status IN ('open', 'voting')
       AND c.leaderboard_frozen = FALSE
     RETURNING e.id`,
    [id, ownerId],
  );
  if (!rows[0]) throw new AppError("conflict", "WITHDRAW_DENIED", 409);
}

export async function voteRisingStarsEntry(
  entryId: string,
  userId: string,
): Promise<{ entry_id: string; challenge_id: string; vote_count: number }> {
  const id = requireRisingStarsUuid(entryId, "entryId");
  const voterId = requireRisingStarsUuid(userId, "userId");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<
      EntryRow & { challenge_status: string; leaderboard_frozen: boolean }
    >(
      `SELECT e.id, e.challenge_id, e.user_id, e.video_id, e.team_id, e.status, e.vote_count, e.created_at,
              c.status AS challenge_status, c.leaderboard_frozen
       FROM rs_entries e
       JOIN rs_challenges c ON c.id = e.challenge_id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [id],
    );
    const entry = locked.rows[0];
    if (!entry) {
      await client.query("ROLLBACK");
      throw new AppError("not_found", "ENTRY_NOT_FOUND", 404);
    }
    if (entry.user_id === voterId) {
      await client.query("ROLLBACK");
      throw new AppError("validation_error", "CANNOT_VOTE_SELF", 400);
    }
    if (!["active", "advanced"].includes(entry.status)) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "ENTRY_NOT_VOTABLE", 409);
    }
    if (!VOTE_STATUSES.has(entry.challenge_status)) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "VOTING_CLOSED", 409);
    }
    if (entry.leaderboard_frozen) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "LEADERBOARD_FROZEN", 409);
    }
    const voteIns = await client.query<{ vote_day: string }>(
      `INSERT INTO rs_votes (user_id, challenge_id, entry_id, vote_day)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (user_id, challenge_id, vote_day) DO NOTHING
       RETURNING vote_day`,
      [voterId, entry.challenge_id, entry.id],
    );
    if (!voteIns.rows[0]) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "ALREADY_VOTED_TODAY", 409);
    }
    const updated = await client.query<{ vote_count: number }>(
      `UPDATE rs_entries SET vote_count = vote_count + 1 WHERE id = $1 RETURNING vote_count`,
      [entry.id],
    );
    const voteCount = intRequired(updated.rows[0]?.vote_count, "Vote count");
    if (voteCount < 0) {
      await client.query("ROLLBACK");
      throw new AppError("unavailable", "Vote count is unreadable", 503);
    }
    await client.query("COMMIT");
    return {
      entry_id: entry.id,
      challenge_id: entry.challenge_id,
      vote_count: voteCount,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (error instanceof AppError) throw error;
    if (pgCode(error) === "23505") throw new AppError("conflict", "ALREADY_VOTED_TODAY", 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function createRisingStarsTeam(input: {
  seasonId: string;
  regionId?: string | null;
  name: string;
  slug: string;
  captainUserId: string;
}): Promise<RisingStarsTeam> {
  const seasonId = requireRisingStarsUuid(input.seasonId, "seasonId");
  const captainUserId = requireRisingStarsUuid(input.captainUserId, "userId");
  const regionId = input.regionId ? requireRisingStarsUuid(input.regionId, "regionId") : null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{
      id: string;
      season_id: string;
      region_id: string | null;
      name: string;
      slug: string;
      captain_user_id: string | null;
    }>(
      `INSERT INTO rs_teams (season_id, region_id, name, slug, captain_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, season_id, region_id, name, slug, captain_user_id`,
      [seasonId, regionId, input.name, input.slug, captainUserId],
    );
    const team = inserted.rows[0];
    if (!team) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "TEAM_CREATE_FAILED", 409);
    }
    await client.query(
      `INSERT INTO rs_team_members (team_id, user_id, role)
       VALUES ($1, $2, 'captain')
       ON CONFLICT DO NOTHING`,
      [team.id, captainUserId],
    );
    await client.query("COMMIT");
    return {
      id: requiredText(team.id, "Team id"),
      season_id: requiredText(team.season_id, "Team season"),
      region_id: optionalText(team.region_id),
      name: typeof team.name === "string" ? team.name : "",
      slug: requiredText(team.slug, "Team slug"),
      captain_user_id: optionalText(team.captain_user_id),
      team_votes: 0,
      member_count: 1,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (error instanceof AppError) throw error;
    if (pgCode(error) === "23505") throw new AppError("conflict", "TEAM_CREATE_FAILED", 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function joinRisingStarsTeam(teamId: string, userId: string): Promise<void> {
  const id = requireRisingStarsUuid(teamId, "teamId");
  const memberId = requireRisingStarsUuid(userId, "userId");
  const team = await getPool().query<{ id: string }>(`SELECT id FROM rs_teams WHERE id = $1`, [id]);
  if (!team.rows[0]) throw new AppError("not_found", "TEAM_NOT_FOUND", 404);
  try {
    await getPool().query(
      `INSERT INTO rs_team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [id, memberId],
    );
  } catch (error) {
    if (pgCode(error) === "23503") throw new AppError("not_found", "TEAM_NOT_FOUND", 404);
    throw error;
  }
}

export async function attachRisingStarsLive(input: {
  challengeId: string;
  userId: string;
  phase: "qualifier" | "final";
  roomId: string;
}): Promise<RisingStarsChallengeDetail> {
  const challengeId = requireRisingStarsUuid(input.challengeId, "challengeId");
  const userId = requireRisingStarsUuid(input.userId, "userId");
  const roomId = input.roomId.trim();
  if (!roomId) throw new AppError("validation_error", "roomId required", 400);
  const live = await getPool().query<{ room_id: string; host_id: string; status: string }>(
        `SELECT room_id, host_id, status
           FROM live_streams
          WHERE room_id = $1
          LIMIT 1`,
        [roomId],
      );
  const stream = live.rows[0];
  if (!stream) throw new AppError("not_found", "LIVE_NOT_FOUND", 404);
  if (stream.host_id !== userId) throw new AppError("forbidden", "ROOM_NOT_OWNED", 403);
  if (stream.status !== "live") throw new AppError("conflict", "LIVE_NOT_ACTIVE", 409);
  if (stream.room_id !== roomId) throw new AppError("forbidden", "ROOM_NOT_OWNED", 403);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<ChallengeRow>(`${CHALLENGE_SELECT} WHERE id = $1 FOR UPDATE`, [challengeId]);
    if (!locked.rows[0]) {
      await client.query("ROLLBACK");
      throw new AppError("not_found", "CHALLENGE_NOT_FOUND", 404);
    }
    const challenge = mapChallengeDetail(locked.rows[0]);
    if (!ATTACH_STATUSES.has(challenge.status)) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "CHALLENGE_CLOSED", 409);
    }
    if (challenge.leaderboard_frozen) {
      await client.query("ROLLBACK");
      throw new AppError("conflict", "LEADERBOARD_FROZEN", 409);
    }
    const entry = await client.query<{ id: string }>(
      `SELECT id FROM rs_entries
       WHERE challenge_id = $1 AND user_id = $2 AND status IN ('pending', 'active', 'advanced')
       LIMIT 1`,
      [challengeId, userId],
    );
    if (!entry.rows[0]) {
      await client.query("ROLLBACK");
      throw new AppError("forbidden", "NOT_PARTICIPANT", 403);
    }
    const column = input.phase === "qualifier" ? "live_qualifier_room_id" : "live_final_room_id";
    const updated = await client.query<ChallengeRow>(
      `UPDATE rs_challenges
       SET ${column} = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, season_id, category_id, region_id, week_index, title, description,
                 sound_track_id, sound_meta, opens_at, closes_at, status, leaderboard_frozen,
                 live_qualifier_room_id, live_final_room_id`,
      [challengeId, stream.room_id],
    );
    await client.query("COMMIT");
    if (!updated.rows[0]) throw new AppError("not_found", "CHALLENGE_NOT_FOUND", 404);
    return mapChallengeDetail(updated.rows[0]);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}
