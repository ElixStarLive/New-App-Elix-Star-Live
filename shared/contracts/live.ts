import { z } from "zod";

export const liveStartBodySchema = z.object({
  title: z.string().max(80).optional(),
});

export const liveStartResponseSchema = z.object({
  streamId: z.string().uuid(),
  roomId: z.string(),
  livekitToken: z.string(),
  livekitUrl: z.string(),
});

export const liveTokenQuerySchema = z.object({
  roomId: z.string().min(1),
  role: z.enum(["host", "spectator", "cohost"]).default("spectator"),
});

export const liveTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
  roomId: z.string(),
  hostId: z.string().uuid(),
  displayName: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  canPublish: z.boolean(),
  streamId: z.string().uuid(),
});

export const liveStreamCardSchema = z.object({
  streamId: z.string().uuid(),
  roomId: z.string(),
  hostId: z.string().uuid(),
  displayName: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  title: z.string(),
  viewerCount: z.number().int().nonnegative(),
  startedAt: z.string(),
});

export const liveStreamsResponseSchema = z.object({
  streams: z.array(liveStreamCardSchema),
});

export type LiveStartResponse = z.infer<typeof liveStartResponseSchema>;
export type LiveTokenResponse = z.infer<typeof liveTokenResponseSchema>;
export type LiveStreamCard = z.infer<typeof liveStreamCardSchema>;
