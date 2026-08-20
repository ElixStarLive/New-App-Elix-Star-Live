import { z } from "zod";
import { userPublicSchema, usernameSchema } from "./auth.js";

export const profilePatchBodySchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  bio: z.string().max(160).optional(),
  username: usernameSchema.optional(),
});

export const followListResponseSchema = z.object({
  users: z.array(userPublicSchema),
});

export const feedItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["video", "live"]),
  userId: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  caption: z.string().optional(),
  mediaUrl: z.string().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  streamId: z.string().min(1).optional(),
  likeCount: z.number().int().nonnegative().optional(),
  commentCount: z.number().int().nonnegative().optional(),
  saveCount: z.number().int().nonnegative().optional(),
  viewCount: z.number().int().nonnegative().optional(),
  soundId: z.string().nullable().optional(),
  isLive: z.boolean().optional(),
  liked: z.boolean().optional(),
  saved: z.boolean().optional(),
  isFollowing: z.boolean().optional(),
  hashtags: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
});

export const feedPageSchema = z.object({
  items: z.array(feedItemSchema),
  nextCursor: z.string().nullable(),
});

export const trackViewBodySchema = z.object({
  videoId: z.string().uuid(),
  watchTime: z.number().nonnegative().optional(),
  videoDuration: z.number().nonnegative().optional(),
  completed: z.boolean().optional(),
});

export const trackInteractionBodySchema = z.object({
  videoId: z.string().uuid(),
  type: z.enum(["like", "comment", "share", "save"]),
});

export type FeedPage = z.infer<typeof feedPageSchema>;
export type FeedItem = z.infer<typeof feedItemSchema>;

export const reportBodySchema = z.object({
  targetKind: z.enum(["user", "video", "comment", "live", "message"]),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(80),
  details: z.string().max(1000).optional(),
});
