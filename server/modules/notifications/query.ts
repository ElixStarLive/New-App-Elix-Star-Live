import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";

const ALERT_LIMIT = 50;

const LIVE_STILL_LIVE_NEW = `
  EXISTS (
    SELECT 1 FROM live_streams s
    WHERE s.status = 'live'
      AND (
        s.room_id = COALESCE(NULLIF(n.payload->>'roomId', ''), NULLIF(n.payload->>'room_id', ''), NULLIF(n.payload->>'streamKey', ''))
        OR s.host_id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'host_user_id', ''), NULLIF(n.payload->>'hostId', ''))
      )
  )
`;

const LIVE_STILL_LIVE_LIVE = `
  EXISTS (
    SELECT 1 FROM live_streams s
    WHERE s.is_live = TRUE
      AND s.ended_at IS NULL
      AND (
        n.action_url LIKE '%/' || s.stream_key
        OR n.action_url LIKE '%/' || s.stream_key || '?%'
        OR n.action_url LIKE '%/' || s.user_id::text
        OR n.action_url LIKE '%/' || s.user_id::text || '?%'
      )
  )
`;

export type AlertRow = {
  id: string;
  kind: "system" | "live_started";
  title: string;
  body: string;
  imageUrl: string | null;
  actionUrl: string | null;
  createdAt: string;
};

function payloadString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function internalPath(raw: string | null): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  path = path.split("#")[0] || "";
  path = path.split("?")[0] || "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export async function listAlerts(viewerId: string): Promise<{ items: AlertRow[]; total: number; unreadIds: string[] }> {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query<{
      id: string;
      kind: string;
      title: string;
      body: string;
      action_url: string | null;
      created_at: Date;
      read: boolean;
      total: string;
      live_room_id: string | null;
      host_avatar_url: string | null;
    }>(
      `SELECT n.id, n.type AS kind, n.title, n.body, n.action_url, n.created_at,
              COALESCE(n.read, FALSE) AS read,
              COUNT(*) OVER()::text AS total,
              (
                SELECT s.stream_key
                FROM live_streams s
                WHERE s.is_live = TRUE
                  AND s.ended_at IS NULL
                  AND (
                    n.action_url LIKE '%/' || s.stream_key
                    OR n.action_url LIKE '%/' || s.stream_key || '?%'
                    OR n.action_url LIKE '%/' || s.user_id::text
                    OR n.action_url LIKE '%/' || s.user_id::text || '?%'
                  )
                ORDER BY s.started_at DESC
                LIMIT 1
              ) AS live_room_id,
              (
                SELECT COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url)
                FROM live_streams s
                JOIN elix_auth_users u ON u.id = s.user_id
                LEFT JOIN profiles p ON p.user_id = s.user_id
                WHERE s.is_live = TRUE
                  AND s.ended_at IS NULL
                  AND (
                    n.action_url LIKE '%/' || s.stream_key
                    OR n.action_url LIKE '%/' || s.stream_key || '?%'
                    OR n.action_url LIKE '%/' || s.user_id::text
                    OR n.action_url LIKE '%/' || s.user_id::text || '?%'
                  )
                ORDER BY s.started_at DESC
                LIMIT 1
              ) AS host_avatar_url
       FROM elix_notifications n
       WHERE n.user_id = $1
         AND n.type IN ('system', 'live_started')
         AND (n.type <> 'live_started' OR ${LIVE_STILL_LIVE_LIVE})
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ${ALERT_LIMIT}`,
      [viewerId],
    );

    const total = rows.length > 0 ? Number(rows[0].total) || rows.length : 0;
    const unreadIds: string[] = [];
    const items = rows.map((row) => {
      const kind: AlertRow["kind"] = row.kind === "live_started" ? "live_started" : "system";
      const actionUrl = row.live_room_id
        ? `/watch/${encodeURIComponent(row.live_room_id)}`
        : internalPath(row.action_url);
      if (!row.read) unreadIds.push(row.id);
      return {
        id: row.id,
        kind,
        title: row.title || "",
        body: row.body || "",
        imageUrl: row.host_avatar_url || null,
        actionUrl,
        createdAt: row.created_at.toISOString(),
      };
    });
    return { items, total, unreadIds };
  }

  const { rows } = await getPool().query<{
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    created_at: Date;
    read_at: Date | null;
    total: string;
    live_room_id: string | null;
    host_avatar_url: string | null;
  }>(
    `SELECT n.id, n.kind, n.payload, n.created_at, n.read_at,
            COUNT(*) OVER()::text AS total,
            (
              SELECT s.room_id
              FROM live_streams s
              WHERE s.status = 'live'
                AND (
                  s.room_id = COALESCE(NULLIF(n.payload->>'roomId', ''), NULLIF(n.payload->>'room_id', ''), NULLIF(n.payload->>'streamKey', ''))
                  OR s.host_id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'host_user_id', ''), NULLIF(n.payload->>'hostId', ''))
                )
              ORDER BY s.started_at DESC
              LIMIT 1
            ) AS live_room_id,
            (
              SELECT u.avatar_url
              FROM users u
              WHERE u.deleted_at IS NULL
                AND u.id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'host_user_id', ''), NULLIF(n.payload->>'hostId', ''))
              LIMIT 1
            ) AS host_avatar_url
     FROM notifications n
     WHERE n.user_id = $1
       AND n.kind IN ('system', 'live_started')
       AND (n.kind <> 'live_started' OR ${LIVE_STILL_LIVE_NEW})
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ${ALERT_LIMIT}`,
    [viewerId],
  );

  const total = rows.length > 0 ? Number(rows[0].total) || rows.length : 0;
  const unreadIds: string[] = [];
  const items = rows.map((row) => {
    const payload = row.payload ?? {};
    const kind: AlertRow["kind"] = row.kind === "live_started" ? "live_started" : "system";
    const title = payloadString(payload, ["title"]) || "";
    const body = payloadString(payload, ["body"]) || "";
    const imageUrl =
      payloadString(payload, ["imageUrl", "image_url", "avatar_url"]) || row.host_avatar_url || null;
    const actionUrl = row.live_room_id
      ? `/watch/${encodeURIComponent(row.live_room_id)}`
      : internalPath(payloadString(payload, ["actionUrl", "action_url"]));
    if (!row.read_at) unreadIds.push(row.id);
    return {
      id: row.id,
      kind,
      title,
      body,
      imageUrl,
      actionUrl,
      createdAt: row.created_at.toISOString(),
    };
  });

  return { items, total, unreadIds };
}

export async function markAlertsRead(viewerId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (await isLiveNeonSchema()) {
    await getPool().query(
      `UPDATE elix_notifications SET read = TRUE
       WHERE user_id = $1 AND id = ANY($2::text[]) AND COALESCE(read, FALSE) = FALSE`,
      [viewerId, ids],
    );
    return;
  }
  await getPool().query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [viewerId, ids],
  );
}
