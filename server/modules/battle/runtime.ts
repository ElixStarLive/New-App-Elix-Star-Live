import { getPool } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { requireValkey, valkeyPub } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";
import { applyScore, BATTLE_DURATION_MS, tick } from "./state.js";
import type { BattleSeat, BattleState } from "../../../shared/contracts/realtime.js";
import { valkeyDel, valkeyTrySetNx } from "../../infra/valkey.js";

function requireRealtime(): void {
  if (!env().valkeyUrl) {
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }
}

function battleKey(roomId: string): string {
  return `battle:${roomId}`;
}

export async function loadBattle(roomId: string): Promise<BattleState | null> {
  requireRealtime();
  const raw = await requireValkey().get(battleKey(roomId));
  return raw ? (JSON.parse(raw) as BattleState) : null;
}

export async function saveBattle(state: BattleState): Promise<void> {
  requireRealtime();
  await requireValkey().set(battleKey(state.roomId), JSON.stringify(state));
}

export async function publishRoom(roomId: string, event: string, data: unknown): Promise<void> {
  requireRealtime();
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  await valkeyPub().publish(`room:${roomId}`, payload);
}

export async function persistEndedBattle(state: BattleState): Promise<void> {
  if (state.status !== "ENDED" || !state.startedAt) return;
  const stream = await getPool().query<{ id: string }>(
    `SELECT id FROM live_streams WHERE room_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [state.roomId],
  );
  const streamId = stream.rows[0]?.id;
  if (!streamId) return;
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO battle_results (stream_id, battle_type, winner_team, team_a_score, team_b_score, started_at, ended_at)
     SELECT $1, $2, $3, $4, $5, $6::timestamptz, NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM battle_results WHERE stream_id = $1 AND started_at = $6::timestamptz
     )
     RETURNING id`,
    [
      streamId,
      state.type,
      state.teamAScore === state.teamBScore ? null : state.teamAScore > state.teamBScore ? "teamA" : "teamB",
      state.teamAScore,
      state.teamBScore,
      state.startedAt,
    ],
  );
  const battleId = inserted.rows[0]?.id;
  if (!battleId) return;
  const seats = Object.entries(state.seats) as Array<[BattleSeat, string | null]>;
  for (const [seat, userId] of seats) {
    if (!userId) continue;
    await getPool().query(
      `INSERT INTO battle_result_participants (battle_id, user_id, seat, team_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [battleId, userId, seat, seat === "host" || seat === "player3" ? "teamA" : "teamB"],
    );
  }
}

export async function tickAndStoreBattle(roomId: string): Promise<BattleState | null> {
  const current = await loadBattle(roomId);
  if (!current) return null;
  const next = tick(current);
  if (current.status === "ACTIVE" && next.status === "ENDED") {
    await persistEndedBattle(next);
  }
  await saveBattle(next);
  return next;
}

const BATTLE_VOTE_TTL_MS = BATTLE_DURATION_MS + 60_000;

function battleVoteOnceKey(roomId: string, userId: string): string {
  return `battle_vote_once:${roomId}:${userId}`;
}

const BATTLE_SEATS: BattleSeat[] = ["host", "opponent", "player3", "player4"];

export type BattleSpectatorTapResult =
  | { ok: true; points: number; state: BattleState }
  | {
      ok: false;
      reason: "no_battle" | "not_active" | "participant" | "invalid_seat" | "already_awarded" | "unavailable";
    };

/** +5 battle points once per unique viewer per battle. £0 — source `tap`. */
export async function applyBattleSpectatorTap(
  roomId: string,
  userId: string,
  seat: BattleSeat,
): Promise<BattleSpectatorTapResult> {
  requireRealtime();
  const current = await tickAndStoreBattle(roomId);
  if (!current) return { ok: false, reason: "no_battle" };
  if (current.status !== "ACTIVE") return { ok: false, reason: "not_active" };
  if (Object.values(current.seats).includes(userId)) return { ok: false, reason: "participant" };
  if (!current.seats[seat]) return { ok: false, reason: "invalid_seat" };

  const claimed = await valkeyTrySetNx(battleVoteOnceKey(roomId, userId), seat, BATTLE_VOTE_TTL_MS);
  if (!claimed) return { ok: false, reason: "already_awarded" };

  try {
    const next = applyScore(current, seat, 5);
    await saveBattle(next);
    await publishRoom(roomId, "battle_state_sync", next);
    return { ok: true, points: 5, state: next };
  } catch {
    await valkeyDel(battleVoteOnceKey(roomId, userId));
    return { ok: false, reason: "unavailable" };
  }
}

export function isBattleSeat(value: string): value is BattleSeat {
  return BATTLE_SEATS.includes(value as BattleSeat);
}

export async function applyGiftToBattle(roomId: string, recipientId: string, points: number): Promise<void> {
  const current = await tickAndStoreBattle(roomId);
  if (!current || current.status !== "ACTIVE" || points <= 0) return;
  const seat = (Object.entries(current.seats) as Array<[BattleSeat, string | null]>).find(
    ([, userId]) => userId === recipientId,
  )?.[0];
  if (!seat) return;
  const next = applyScore(current, seat, points);
  await saveBattle(next);
  await publishRoom(roomId, "battle_state_sync", next);
}

export async function scanAndTickBattles(): Promise<void> {
  if (!env().valkeyUrl) return;
  const redis = requireValkey();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "battle:*", "COUNT", 100);
    cursor = String(next);
    for (const key of keys) {
      const roomId = key.slice("battle:".length);
      const state = await tickAndStoreBattle(roomId);
      if (state) await publishRoom(roomId, "battle_state_sync", state);
    }
  } while (cursor !== "0");
}
