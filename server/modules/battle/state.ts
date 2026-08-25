import type { BattleSeat, BattleState, BattleType } from "../../../shared/contracts/realtime.js";

export const BATTLE_DURATION_MS = 5 * 60 * 1000;

export const SEAT_TEAM: Record<BattleSeat, "teamA" | "teamB"> = {
  host: "teamA",
  player3: "teamA",
  opponent: "teamB",
  player4: "teamB",
};

export function emptyBattle(roomId: string, type: BattleType, hostId: string): BattleState {
  return {
    roomId,
    type,
    status: "WAITING",
    seats: { host: hostId, opponent: null, player3: null, player4: null },
    teamAScore: 0,
    teamBScore: 0,
    startedAt: null,
    endsAt: null,
    remainingMs: BATTLE_DURATION_MS,
  };
}

export function canStart(state: BattleState): boolean {
  if (state.type === "1x1") return Boolean(state.seats.host && state.seats.opponent);
  return Boolean(state.seats.host && state.seats.opponent && state.seats.player3 && state.seats.player4);
}

export function startBattle(state: BattleState, now = Date.now()): BattleState {
  if (!canStart(state)) throw new Error("incomplete_teams");
  return {
    ...state,
    status: "ACTIVE",
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + BATTLE_DURATION_MS).toISOString(),
    remainingMs: BATTLE_DURATION_MS,
  };
}

export function applyScore(
  state: BattleState,
  seat: BattleSeat,
  points: number,
): BattleState {
  if (state.status !== "ACTIVE") throw new Error("battle_not_active");
  if (points <= 0) throw new Error("invalid_points");
  if (!state.seats[seat]) throw new Error("empty_seat");
  const team = SEAT_TEAM[seat];
  return {
    ...state,
    teamAScore: state.teamAScore + (team === "teamA" ? points : 0),
    teamBScore: state.teamBScore + (team === "teamB" ? points : 0),
  };
}

export function tick(state: BattleState, now = Date.now()): BattleState {
  if (state.status !== "ACTIVE" || !state.endsAt) return state;
  const remainingMs = Math.max(0, Date.parse(state.endsAt) - now);
  if (remainingMs === 0) {
    return { ...state, status: "ENDED", remainingMs: 0 };
  }
  return { ...state, remainingMs };
}
