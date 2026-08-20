import { env } from "../../infra/env.js";
import { getPool } from "../../infra/postgres.js";
import { requireValkey, valkeyPub } from "../../infra/valkey.js";
import { applyScore, tick } from "./state.js";
import type { BattleSeat, BattleState } from "../../../shared/contracts/realtime.js";

const localBattles = new Map<string, BattleState>();

function battleKey(roomId: string): string {
  return `battle:${roomId}`;
}

export async function loadBattle(roomId: string): Promise<BattleState | null> {
  if (!env().valkeyUrl) return localBattles.get(roomId) ?? null;
  const raw = await requireValkey().get(battleKey(roomId));
  return raw ? (JSON.parse(raw) as BattleState) : null;
}

export async function saveBattle(state: BattleState): Promise<void> {
  if (!env().valkeyUrl) {
    localBattles.set(state.streamId, state);
    return;
  }
  await requireValkey().set(battleKey(state.streamId), JSON.stringify(state));
}

const localRoomHandlers = new Set<(roomId: string, payload: string) => void>();

export function onLocalRoom(handler: (roomId: string, payload: string) => void): () => void {
  localRoomHandlers.add(handler);
  return () => {
    localRoomHandlers.delete(handler);
  };
}

export async function publishRoom(roomId: string, event: string, data: unknown): Promise<void> {
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  if (env().valkeyUrl) {
    await valkeyPub().publish(`room:${roomId}`, payload);
    return;
  }
  for (const handler of localRoomHandlers) handler(roomId, payload);
}

export async function persistEndedBattle(state: BattleState): Promise<void> {
  if (state.status !== "ENDED" || !state.startedAt) return;
  const stream = await getPool().query<{ id: string }>(
    `SELECT id FROM live_streams WHERE room_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [state.streamId],
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
