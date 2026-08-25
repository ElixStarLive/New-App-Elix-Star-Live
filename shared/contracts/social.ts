import { z } from "zod";
import { userPublicSchema } from "./auth.js";

/** PAGE-026 edit username. Register keeps `usernameSchema`. */
export const profileEditUsernameSchema = z
  .string()
  .transform((value) => value.trim().replace(/^@+/, "").replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .regex(/^[a-zA-Z0-9._]{3,30}$/, "Username: 3–30 letters, numbers, . or _"),
  );

export const profilePatchBodySchema = z
  .object({
    displayName: z.string().max(50).optional(),
    bio: z.string().max(150).optional(),
    username: profileEditUsernameSchema.optional(),
    website: z.string().max(100).optional(),
    instagram: z.string().max(50).optional(),
    youtube: z.string().max(50).optional(),
    tiktok: z.string().max(50).optional(),
  })
  .strict();

export const profileEditUserSchema = userPublicSchema.extend({
  website: z.string(),
  instagram: z.string(),
  youtube: z.string(),
  tiktok: z.string(),
});

export type ProfileEditUser = z.infer<typeof profileEditUserSchema>;
export type ProfilePatchBody = z.infer<typeof profilePatchBodySchema>;

export const followListResponseSchema = z.object({
  users: z.array(userPublicSchema),
});

/** Frozen OLD production For You / relation feed video row (formatVideoForClient). */
export const feedMusicSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    artist: z.string(),
    duration: z.string(),
    previewUrl: z.string().optional(),
    provider: z.unknown().optional(),
    clipStartSeconds: z.number().optional(),
    clipEndSeconds: z.number().optional(),
    duetWithVideoId: z.string().optional(),
    duetLayout: z.enum(["overlay", "split"]).optional(),
  })
  .nullable();

export const feedVideoSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  thumbnail: z.string(),
  duration: z.string(),
  user: z.object({
    id: z.string().min(1),
    username: z.string(),
    name: z.string(),
    avatar: z.string(),
    level: z.number(),
    isVerified: z.boolean(),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
  }),
  description: z.string(),
  hashtags: z.array(z.string()),
  music: feedMusicSchema,
  stats: z.object({
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative(),
    saves: z.number().int().nonnegative(),
  }),
  createdAt: z.string().nullable(),
  location: z.string(),
  isLiked: z.boolean(),
  isSaved: z.boolean(),
  isFollowing: z.boolean(),
  comments: z.array(z.unknown()),
  quality: z.string(),
  privacy: z.string(),
  engagementScore: z.number(),
  duetWithVideoId: z.string().optional(),
  duetLayout: z.enum(["overlay", "split"]).optional(),
});

/** Frozen OLD GET /api/feed/foryou response. */
export const forYouFeedResponseSchema = z.object({
  videos: z.array(feedVideoSchema),
  mutualUserIds: z.array(z.string()),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative(),
  source: z.string(),
});

/** Frozen OLD GET /api/feed/following|friends response. */
export const relationFeedResponseSchema = z.object({
  videos: z.array(feedVideoSchema),
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

export type FeedVideo = z.infer<typeof feedVideoSchema>;
export type ForYouFeedResponse = z.infer<typeof forYouFeedResponseSchema>;
export type RelationFeedResponse = z.infer<typeof relationFeedResponseSchema>;
export type FeedMusic = z.infer<typeof feedMusicSchema>;

export const reportTargetTypeSchema = z.enum(["video", "user", "comment", "live", "message", "support"]);

export const reportReasonSchema = z.enum([
  "spam",
  "harassment",
  "hate_speech",
  "hate",
  "violence",
  "sexual_content",
  "child_safety",
  "copyright",
  "impersonation",
  "underage",
  "nudity",
  "other",
]);

export const reportBodySchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.string().min(1).max(200),
  reason: reportReasonSchema,
  details: z.string().max(500).optional().default(""),
});

export const reportResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
});

export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const unblockUserBodySchema = z.object({
  blockedUserId: z.string().uuid(),
});

export const blockedUserRowSchema = z.object({
  blockedUserId: z.string().uuid(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export const blockedUsersResponseSchema = z.object({
  data: z.array(blockedUserRowSchema),
});

export const unblockUserResponseSchema = z.object({
  success: z.literal(true),
});

/** Slim directory row for GET /api/profiles (STEM/Following strips) — UserPublic field names. */
export const profilesDirectoryRowSchema = userPublicSchema.pick({
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
});

export const profilesDirectoryResponseSchema = z.object({
  profiles: z.array(profilesDirectoryRowSchema),
});

export type BlockedUserRow = z.infer<typeof blockedUserRowSchema>;
export type ProfilesDirectoryRow = z.infer<typeof profilesDirectoryRowSchema>;
export type ProfilesDirectoryResponse = z.infer<typeof profilesDirectoryResponseSchema>;
