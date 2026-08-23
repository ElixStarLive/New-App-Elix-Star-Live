import { z } from "zod";

export const inboxThreadSchema = z.object({
  id: z.string().min(1),
  otherUserId: z.string().min(1),
  otherUsername: z.string(),
  otherDisplayName: z.string(),
  otherAvatarUrl: z.string().nullable(),
  lastMessage: z.string(),
  unread: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

export const inboxThreadsResponseSchema = z.object({
  threads: z.array(inboxThreadSchema),
});

export const inboxActivityKindSchema = z.enum(["like", "comment", "save", "mention"]);

export const inboxActivityItemSchema = z.object({
  id: z.string().min(1),
  kind: inboxActivityKindSchema,
  videoId: z.string().min(1),
  actorUserId: z.string().min(1),
  actorUsername: z.string(),
  actorDisplayName: z.string().nullable(),
  actorAvatarUrl: z.string().nullable(),
  snippet: z.string().nullable(),
  createdAt: z.string(),
});

export const inboxActivityResponseSchema = z.object({
  items: z.array(inboxActivityItemSchema),
  total: z.number().int().nonnegative(),
});

export const inboxCircleSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isLive: z.boolean(),
  roomId: z.string().nullable(),
});

export const inboxCirclesResponseSchema = z.object({
  users: z.array(inboxCircleSchema),
});

export const inboxNoticeSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  actionUrl: z.string().nullable(),
  createdAt: z.string(),
});

export const inboxNoticesResponseSchema = z.object({
  gifts: z.array(inboxNoticeSchema),
  giftCount: z.number().int().nonnegative(),
  shop: z.array(inboxNoticeSchema),
  alerts: z.array(inboxNoticeSchema),
  alertCount: z.number().int().nonnegative(),
  unreadIds: z.array(z.string()),
});

export const inboxLiveShareSchema = z.object({
  sharerId: z.string().min(1),
  streamKey: z.string(),
  hostUserId: z.string(),
  hostName: z.string(),
  hostAvatar: z.string(),
  sharerName: z.string(),
  sharerAvatar: z.string(),
  createdAt: z.string(),
});

export const inboxLiveShareResponseSchema = z.object({
  items: z.array(inboxLiveShareSchema),
});

export const inboxMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  senderId: z.string().min(1),
  body: z.string(),
  createdAt: z.string(),
});

export const inboxMessagesResponseSchema = z.object({
  messages: z.array(inboxMessageSchema),
});

export const inboxThreadDetailSchema = z.object({
  id: z.string().min(1),
  otherUserId: z.string().min(1).nullable(),
  otherUsername: z.string(),
  otherDisplayName: z.string(),
  otherAvatarUrl: z.string().nullable(),
  otherLevel: z.number().int().positive(),
  blocked: z.boolean(),
  otherUnavailable: z.boolean(),
  canSend: z.boolean(),
});

export const inboxThreadDetailResponseSchema = z.object({
  thread: inboxThreadDetailSchema,
});

export const sendInboxMessageBodySchema = z.object({
  body: z.string(),
  clientRequestId: z.string().min(1).max(80).optional(),
});

export const inboxMessageEventSchema = z.object({
  threadId: z.string().min(1),
  message: inboxMessageSchema,
});

export const inboxThreadUpdatedEventSchema = z.object({
  threadId: z.string().min(1),
  lastMessage: z.string(),
  updatedAt: z.string(),
  senderId: z.string().min(1),
});

export type InboxThread = z.infer<typeof inboxThreadSchema>;
export type InboxActivityItem = z.infer<typeof inboxActivityItemSchema>;
export type InboxCircle = z.infer<typeof inboxCircleSchema>;
export type InboxNotice = z.infer<typeof inboxNoticeSchema>;
export type InboxLiveShare = z.infer<typeof inboxLiveShareSchema>;
export type InboxMessage = z.infer<typeof inboxMessageSchema>;
export type InboxThreadDetail = z.infer<typeof inboxThreadDetailSchema>;

