import { z } from "zod";

export const wsEventNameSchema = z.enum([
  "connected",
  "pong",
  "error",
  "force_disconnect",
  "ping",
  "chat_message",
  "heart_sent",
  "gift_sent",
  "viewer_count",
  "user_joined",
  "user_left",
  "stream_start",
  "stream_end",
  "stream_started",
  "stream_ended",
  "room_state",
  "cohost_invite_send",
  "cohost_invite_accept",
  "cohost_invite_decline",
  "cohost_request_send",
  "cohost_request_accept",
  "cohost_request_decline",
  "cohost_layout_sync",
  "cohost_seat_release",
  "cohost_seat_leave",
  "cohost_seats_clear",
  "cohost_invite",
  "cohost_request",
  "cohost_seat_released",
  "battle_invite_send",
  "battle_invite_accept",
  "battle_invite_decline",
  "battle_create",
  "battle_join",
  "battle_end",
  "battle_get_state",
  "battle_invite",
  "battle_state_sync",
  "battle_tick",
  "battle_score",
  "battle_ended",
  "dm_message",
  "dm_thread_updated",
  "call_invite",
  "call_accepted",
  "call_rejected",
  "call_ended",
  "gift_goal_set",
  "gift_goal_clear",
  "gift_goal_sync",
  "live_share",
]);

export type WsEventName = z.infer<typeof wsEventNameSchema>;

export const wsEnvelopeSchema = z.object({
  event: wsEventNameSchema,
  data: z.unknown(),
  timestamp: z.string(),
});

export const chatMessageDataSchema = z.object({
  streamId: z.string(),
  userId: z.string().uuid(),
  displayName: z.string(),
  body: z.string().min(1).max(280),
});

export const heartSentDataSchema = z.object({
  streamId: z.string(),
  userId: z.string().uuid(),
});

export const giftSentDataSchema = z.object({
  streamId: z.string(),
  senderId: z.string().uuid(),
  recipientId: z.string().uuid(),
  giftId: z.string(),
  transactionId: z.string(),
  coinCost: z.number().int().positive(),
});

export const viewerCountDataSchema = z.object({
  streamId: z.string(),
  count: z.number().int().nonnegative(),
});

export const cohostSeatSchema = z.object({
  seatIndex: z.number().int().min(0).max(7),
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(["invited", "accepted", "live", "pending_accept"]),
});

export const cohostLayoutSchema = z.object({
  streamId: z.string(),
  bigScreenUserId: z.string().uuid().nullable(),
  seats: z.array(cohostSeatSchema).max(8),
});

export const battleSeatSchema = z.enum(["host", "opponent", "player3", "player4"]);
export const battleTypeSchema = z.enum(["1x1", "2x2"]);
export const battleTeamSchema = z.enum(["teamA", "teamB"]);

export const battleStateSchema = z.object({
  streamId: z.string(),
  type: battleTypeSchema,
  status: z.enum(["WAITING", "ACTIVE", "ENDED"]),
  seats: z.record(battleSeatSchema, z.string().uuid().nullable()),
  teamAScore: z.number().int().nonnegative(),
  teamBScore: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  remainingMs: z.number().int().nonnegative(),
});

export const giftGoalSchema = z.object({
  giftId: z.string(),
  giftName: z.string(),
  giftIcon: z.string(),
  targetCount: z.number().int().positive(),
  currentCount: z.number().int().nonnegative(),
});

export type GiftGoal = z.infer<typeof giftGoalSchema>;
export type CohostSeat = z.infer<typeof cohostSeatSchema>;
export type CohostLayout = z.infer<typeof cohostLayoutSchema>;
export type BattleSeat = z.infer<typeof battleSeatSchema>;
export type BattleType = z.infer<typeof battleTypeSchema>;
export type BattleState = z.infer<typeof battleStateSchema>;
