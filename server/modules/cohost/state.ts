import { z } from "zod";

export const MAX_COHOST_SLOTS = 8;

export type CohostSeatStatus = "invited" | "accepted" | "live" | "pending_accept";

export type CohostSeat = {
  seatIndex: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: CohostSeatStatus;
};

export type CohostRoomState = {
  streamId: string;
  hostId: string;
  bigScreenUserId: string | null;
  seats: CohostSeat[];
  requests: Array<{ userId: string; displayName: string }>;
};

export function emptyCohostState(streamId: string, hostId: string): CohostRoomState {
  return { streamId, hostId, bigScreenUserId: null, seats: [], requests: [] };
}

export function requireCohostTarget(userId: string): string {
  const id = userId.trim();
  if (!id) throw new Error("cohost_target_required");
  return id;
}

export function markSeatLive(state: CohostRoomState, userId: string): CohostRoomState {
  const seated = state.seats.some((seat) => seat.userId === userId);
  if (!seated) throw new Error("not_invited");
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.userId === userId ? { ...seat, status: "live" } : seat)),
    requests: state.requests.filter((row) => row.userId !== userId),
  };
}

export function assignSeat(state: CohostRoomState, seat: Omit<CohostSeat, "seatIndex">): CohostRoomState {
  if (seat.userId === state.hostId) {
    throw new Error("host_cannot_occupy_cohost_seat");
  }
  if (state.seats.some((row) => row.userId === seat.userId)) {
    throw new Error("already_seated");
  }
  if (state.seats.length >= MAX_COHOST_SLOTS) {
    throw new Error("seats_full");
  }
  const used = new Set(state.seats.map((row) => row.seatIndex));
  let seatIndex = 0;
  while (used.has(seatIndex)) seatIndex += 1;
  return {
    ...state,
    seats: [...state.seats, { ...seat, seatIndex }],
    requests: state.requests.filter((row) => row.userId !== seat.userId),
  };
}

export function releaseSeat(state: CohostRoomState, userId: string): CohostRoomState {
  const seats = state.seats.filter((row) => row.userId !== userId);
  return {
    ...state,
    seats,
    bigScreenUserId: state.bigScreenUserId === userId ? null : state.bigScreenUserId,
  };
}

export function setBigScreen(state: CohostRoomState, userId: string | null): CohostRoomState {
  if (userId && userId !== state.hostId && !state.seats.some((row) => row.userId === userId)) {
    throw new Error("not_in_room");
  }
  return { ...state, bigScreenUserId: userId };
}

export const cohostPersistedSchema = z.object({
  streamId: z.string(),
  hostId: z.string(),
  bigScreenUserId: z.string().nullable(),
  seats: z.array(
    z.object({
      seatIndex: z.number().int().min(0).max(7),
      userId: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable(),
      status: z.enum(["invited", "accepted", "live", "pending_accept"]),
    }),
  ),
  requests: z.array(z.object({ userId: z.string(), displayName: z.string() })),
});
