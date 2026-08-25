import { getPool } from "../../infra/postgres.js";

const ALERT_LIMIT = 50;

const LIVE_STILL_LIVE_NEW = `
  EXISTS (
    SELECT 1 FROM live_streams s
    WHERE s.status = 'live'
      AND (
        s.room_id = COALESCE(NULLIF(n.payload->>'roomId', ''), NULLIF(n.payload->>'streamKey', ''))
        OR s.host_id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'hostId', ''))
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
                  s.room_id = COALESCE(NULLIF(n.payload->>'roomId', ''), NULLIF(n.payload->>'streamKey', ''))
                  OR s.host_id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'hostId', ''))
                )
              ORDER BY s.started_at DESC
              LIMIT 1
            ) AS live_room_id,
            (
              SELECT u.avatar_url
              FROM users u
              WHERE u.deleted_at IS NULL
                AND u.id::text = COALESCE(NULLIF(n.payload->>'hostUserId', ''), NULLIF(n.payload->>'hostId', ''))
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
      payloadString(payload, ["imageUrl"]) || row.host_avatar_url || null;
    const actionUrl = row.live_room_id
      ? `/watch/${encodeURIComponent(row.live_room_id)}`
      : internalPath(payloadString(payload, ["actionUrl"]));
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
  
  await getPool().query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [viewerId, ids],
  );
}
