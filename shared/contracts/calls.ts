import { z } from "zod";

export const callRejectReasonSchema = z.enum(["blocked", "declined", "busy", "forbidden"]);

export const callInviteEventSchema = z.object({
  callId: z.string().uuid(),
  callerId: z.string().uuid(),
  calleeId: z.string().uuid(),
  callerUsername: z.string(),
  callerAvatar: z.string(),
  threadId: z.string().uuid(),
  roomName: z.string().regex(/^call_[0-9a-f-]{36}$/i),
});

export const callAcceptedEventSchema = z.object({
  callId: z.string().uuid(),
  callerId: z.string().uuid(),
  calleeId: z.string().uuid(),
  threadId: z.string().uuid(),
  roomName: z.string().regex(/^call_[0-9a-f-]{36}$/i),
});

export const callRejectedEventSchema = z.object({
  callId: z.string().uuid().optional(),
  callerId: z.string().uuid().optional(),
  calleeId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  reason: callRejectReasonSchema,
});

export const callEndedEventSchema = z.object({
  callId: z.string().uuid(),
  userId: z.string().uuid(),
  remoteId: z.string().uuid(),
  threadId: z.string().uuid(),
});

export const callTokenResponseSchema = z.object({
  callId: z.string().uuid(),
  roomName: z.string().regex(/^call_[0-9a-f-]{36}$/i),
  token: z.string().min(1),
  url: z.string().min(1),
});

export type CallInviteEvent = z.infer<typeof callInviteEventSchema>;
export type CallAcceptedEvent = z.infer<typeof callAcceptedEventSchema>;
export type CallRejectedEvent = z.infer<typeof callRejectedEventSchema>;
export type CallEndedEvent = z.infer<typeof callEndedEventSchema>;
export type CallTokenResponse = z.infer<typeof callTokenResponseSchema>;
