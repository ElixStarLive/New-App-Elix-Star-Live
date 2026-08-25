import { getPool } from "../../infra/postgres.js";
import { listAlerts } from "../notifications/query.js";

const ACTIVITY_LIMIT = 100;
const CIRCLE_LIMIT = 24;
const LIVE_SHARE_LIMIT = 80;
const NOTICE_LIMIT = 50;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionPattern(username: string): string | null {
  const handle = username.trim();
  if (handle.length < 2) return null;
  return `(^|[^[:alnum:]_])@${escapeRegex(handle)}([^[:alnum:]_]|$)`;
}

export type InboxThreadRow = {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  lastMessage: string;
  unread: boolean;
  unreadCount: number;
  updatedAt: string;
};

export async function listInboxThreads(viewerId: string): Promise<InboxThreadRow[]> {
  

  const { rows } = await getPool().query<{
    id: string;
    other_user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    last_message: string | null;
    updated_at: Date;
    unread: boolean;
    unread_count: string;
  }>(
    `SELECT t.id,
            o.id AS other_user_id,
            o.username,
            o.display_name,
            o.avatar_url,
            (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            COALESCE((SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id = t.id), t.created_at) AS updated_at,
            EXISTS(
              SELECT 1 FROM chat_messages m
              WHERE m.thread_id = t.id
                AND m.sender_id <> $1
                AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
            ) AS unread,
            (
              SELECT COUNT(*)::text FROM chat_messages m
              WHERE m.thread_id = t.id
                AND m.sender_id <> $1
                AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)
            ) AS unread_count
     FROM chat_threads t
     JOIN chat_thread_members mem ON mem.thread_id = t.id AND mem.user_id = $1
     JOIN chat_thread_members other ON other.thread_id = t.id AND other.user_id <> $1
     JOIN users o ON o.id = other.user_id
     WHERE o.deleted_at IS NULL
       AND (o.banned_until IS NULL OR o.banned_until <= NOW())
     ORDER BY updated_at DESC, t.id DESC`,
    [viewerId],
  );
  return rows.map((row) => ({
    id: row.id,
    otherUserId: row.other_user_id,
    otherUsername: row.username,
    otherDisplayName: row.display_name,
    otherAvatarUrl: row.avatar_url,
    lastMessage: row.last_message ?? "",
    unread: row.unread,
    unreadCount: Number(row.unread_count) || 0,
    updatedAt: row.updated_at.toISOString(),
  }));
}

export type InboxActivityRow = {
  id: string;
  kind: "like" | "comment" | "save" | "mention";
  videoId: string;
  actorUserId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  snippet: string | null;
  createdAt: string;
};

export async function listInboxActivity(viewerId: string): Promise<{ items: InboxActivityRow[]; total: number }> {
  
  const profile = await getPool().query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [viewerId]);
  const pattern = mentionPattern(profile.rows[0]?.username ?? "");
  const params: string[] = [viewerId];
  const mentionBodyCol = "c_m.body";
  const mentionUnion = pattern
    ? `
         UNION ALL
         SELECT 'mention'::text AS kind,
                c_m.video_id::text AS video_id,
                c_m.user_id::text AS actor_user_id,
                c_m.created_at AS at,
                LEFT(${mentionBodyCol}, 140) AS snippet,
                c_m.id::text AS event_id
         FROM comments c_m
         INNER JOIN videos v_m ON v_m.id = c_m.video_id
         WHERE c_m.user_id <> $1
           ${"AND c_m.deleted_at IS NULL"}
           ${"AND v_m.deleted_at IS NULL"}
           AND v_m.user_id <> $1
           AND ${mentionBodyCol} ~* $2`
    : "";
  if (pattern) params.push(pattern);

  const { rows } = await getPool().query<{
    kind: string;
    video_id: string;
    actor_user_id: string;
    at: Date;
    snippet: string | null;
    event_id: string;
    actor_username: string;
    actor_display_name: string;
    actor_avatar_url: string | null;
    total: string;
  }>(
    `SELECT sub.kind, sub.video_id, sub.actor_user_id, sub.at, sub.snippet, sub.event_id,
            COALESCE(u.username, '') AS actor_username,
            COALESCE(u.display_name, '') AS actor_display_name,
            u.avatar_url AS actor_avatar_url,
            COUNT(*) OVER()::text AS total
     FROM (
         SELECT 'like'::text AS kind, l.video_id::text AS video_id, l.user_id::text AS actor_user_id,
                l.created_at AS at, NULL::text AS snippet, (l.user_id::text || ':' || l.video_id::text) AS event_id
         FROM video_likes l
         INNER JOIN videos v ON v.id = l.video_id
         WHERE v.user_id = $1 AND l.user_id <> $1 AND v.deleted_at IS NULL
         UNION ALL
         SELECT 'comment', c.video_id::text, c.user_id::text, c.created_at,
                LEFT(c.body, 140), c.id::text
         FROM comments c
         INNER JOIN videos v ON v.id = c.video_id
         WHERE v.user_id = $1 AND c.user_id <> $1 AND c.deleted_at IS NULL AND v.deleted_at IS NULL
         UNION ALL
         SELECT 'save', s.video_id::text, s.user_id::text, s.created_at, NULL::text,
                (s.user_id::text || ':' || s.video_id::text)
         FROM video_saves s
         INNER JOIN videos v ON v.id = s.video_id
         WHERE v.user_id = $1 AND s.user_id <> $1 AND v.deleted_at IS NULL
         ${mentionUnion}
     ) sub
     LEFT JOIN users u ON u.id = sub.actor_user_id::uuid
     ORDER BY sub.at DESC, sub.event_id DESC
     LIMIT ${ACTIVITY_LIMIT}`,
    params,
  );

  const total = rows.length > 0 ? Number(rows[0].total) || rows.length : 0;
  return {
    total,
    items: rows.map((row) => {
      const kind = row.kind === "comment" || row.kind === "save" || row.kind === "mention" ? row.kind : "like";
      const actorName = row.actor_display_name.trim() || null;
      return {
        id: `${kind}_${row.event_id}`,
        kind,
        videoId: row.video_id,
        actorUserId: row.actor_user_id,
        actorUsername: row.actor_username.trim(),
        actorDisplayName: actorName,
        actorAvatarUrl: row.actor_avatar_url,
        snippet: row.snippet,
        createdAt: row.at.toISOString(),
      };
    }),
  };
}

export type InboxCircleRow = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLive: boolean;
  roomId: string | null;
};

export async function listInboxCircles(viewerId: string): Promise<InboxCircleRow[]> {
  

  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_live: boolean;
    room_id: string | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = u.id AND s.status = 'live') AS is_live,
            (SELECT s.room_id FROM live_streams s WHERE s.host_id = u.id AND s.status = 'live' ORDER BY s.started_at DESC LIMIT 1) AS room_id
     FROM users u
     WHERE u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until <= NOW())
       AND u.id <> $1
       AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.followee_id = $1 AND f.follower_id = u.id)
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
       )
     ORDER BY is_live DESC, u.created_at DESC, u.id ASC
     LIMIT ${CIRCLE_LIMIT}`,
    [viewerId],
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isLive: row.is_live,
    roomId: row.room_id,
  }));
}

export type InboxNoticeRow = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionUrl: string | null;
  createdAt: string;
};

export async function listInboxNotices(viewerId: string): Promise<{
  gifts: InboxNoticeRow[];
  giftCount: number;
  shop: InboxNoticeRow[];
  alerts: InboxNoticeRow[];
  alertCount: number;
  unreadIds: string[];
}> {
  

  const giftsQuery = getPool().query<{
        id: string;
        created_at: Date;
        sender_name: string;
        sender_avatar: string | null;
        gift_name: string;
        room_id: string | null;
        sender_id: string;
      }>(
        `SELECT gt.id, gt.created_at, gt.sender_id,
            COALESCE(NULLIF(s.display_name, ''), s.username, 'Someone') AS sender_name,
            s.avatar_url AS sender_avatar,
            g.name AS gift_name,
            ls.room_id
     FROM gift_transactions gt
     JOIN users s ON s.id = gt.sender_id
     JOIN gifts g ON g.id = gt.gift_id
     LEFT JOIN live_streams ls ON ls.id = gt.stream_id
     WHERE gt.recipient_id = $1
       AND gt.bucket <> 'test'
       AND s.deleted_at IS NULL
     ORDER BY gt.created_at DESC
     LIMIT ${NOTICE_LIMIT}`,
        [viewerId],
      );

  const shopQuery = getPool().query<{
        id: string;
        kind: string;
        payload: Record<string, unknown>;
        created_at: Date;
        read_at: Date | null;
      }>(
        `SELECT n.id, n.kind, n.payload, n.created_at, n.read_at
     FROM notifications n
     WHERE n.user_id = $1 AND n.kind = 'shop'
     ORDER BY n.created_at DESC
     LIMIT ${NOTICE_LIMIT}`,
        [viewerId],
      );

  const [giftsRes, shopRes, alertsRes] = await Promise.all([giftsQuery, shopQuery, listAlerts(viewerId)]);

  const gifts: InboxNoticeRow[] = (giftsRes.rows as Array<{
        id: string;
        created_at: Date;
        sender_name: string;
        sender_avatar: string | null;
        gift_name: string;
        room_id: string | null;
      }>).map((row) => ({
        id: row.id,
        title: `${row.sender_name} sent you a gift`,
        body: row.gift_name,
        imageUrl: row.sender_avatar,
        actionUrl: row.room_id ? `/watch/${encodeURIComponent(row.room_id)}` : null,
        createdAt: row.created_at.toISOString(),
      }));

  const shop: InboxNoticeRow[] = [];
  const unreadIds: string[] = [...alertsRes.unreadIds];

  for (const row of shopRes.rows as Array<{
      id: string;
      kind: string;
      payload: Record<string, unknown>;
      created_at: Date;
      read_at: Date | null;
    }>) {
      if (!row.read_at) unreadIds.push(row.id);
      const payload = row.payload ?? {};
      const title = typeof payload.title === "string" ? payload.title : row.kind;
      const body = typeof payload.body === "string" ? payload.body : "";
      const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl : null;
      const actionUrl = typeof payload.actionUrl === "string" ? payload.actionUrl : null;
      shop.push({
        id: row.id,
        title,
        body,
        imageUrl,
        actionUrl,
        createdAt: row.created_at.toISOString(),
      });
    }

  const alerts: InboxNoticeRow[] = alertsRes.items.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: row.imageUrl,
    actionUrl: row.actionUrl,
    createdAt: row.createdAt,
  }));

  const giftCountRes = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
     FROM gift_transactions gt
     JOIN users s ON s.id = gt.sender_id
     WHERE gt.recipient_id = $1
       AND gt.bucket <> 'test'
       AND s.deleted_at IS NULL`,
        [viewerId],
      );

  return {
    gifts,
    giftCount: Number(giftCountRes.rows[0]?.n) || gifts.length,
    shop,
    alerts,
    alertCount: alertsRes.total,
    unreadIds: unreadIds.slice(0, 100),
  };
}

export type InboxLiveShareRow = {
  sharerId: string;
  roomId: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
  sharerName: string;
  sharerAvatar: string;
  createdAt: string;
};

export async function listLiveShareRequests(viewerId: string): Promise<InboxLiveShareRow[]> {
  

  const { rows } = await getPool().query<{
    sharer_id: string;
    stream_key: string;
    host_user_id: string;
    host_name: string;
    host_avatar: string;
    sharer_name: string;
    sharer_avatar: string;
    created_at: Date;
  }>(
    `SELECT l.sharer_id, l.stream_key, l.host_user_id,
            COALESCE(NULLIF(h.display_name, ''), h.username, l.host_name, '') AS host_name,
            COALESCE(h.avatar_url, l.host_avatar, '') AS host_avatar,
            COALESCE(NULLIF(s.display_name, ''), s.username, l.sharer_name, '') AS sharer_name,
            COALESCE(s.avatar_url, l.sharer_avatar, '') AS sharer_avatar,
            l.created_at
     FROM live_share_inbox l
     LEFT JOIN users s ON s.id = l.sharer_id AND s.deleted_at IS NULL
     LEFT JOIN users h ON h.id = l.host_user_id AND h.deleted_at IS NULL
     WHERE l.recipient_id = $1
       AND l.sharer_id <> $1
       AND NOT EXISTS (
         SELECT 1 FROM follows f
         WHERE f.follower_id = $1 AND f.followee_id = l.sharer_id
       )
     ORDER BY l.created_at DESC
     LIMIT ${LIVE_SHARE_LIMIT}`,
    [viewerId],
  );
  return rows.map((row) => ({
    sharerId: row.sharer_id,
    roomId: row.stream_key,
    hostUserId: row.host_user_id,
    hostName: row.host_name,
    hostAvatar: row.host_avatar,
    sharerName: row.sharer_name,
    sharerAvatar: row.sharer_avatar,
    createdAt: row.created_at.toISOString(),
  }));
}
