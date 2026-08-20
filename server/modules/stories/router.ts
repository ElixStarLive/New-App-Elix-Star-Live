import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const router = Router();

router.get("/", async (_req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    media_url: string;
    thumbnail: string | null;
    created_at: Date;
  }>(
    `SELECT s.id, s.user_id, u.username, u.display_name, u.avatar_url, s.media_url, s.thumbnail, s.created_at
     FROM stories s
     JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > NOW() AND u.deleted_at IS NULL
     ORDER BY s.created_at DESC
     LIMIT 200`,
  );
  const grouped = new Map<
    string,
    {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      stories: Array<{ id: string; mediaUrl: string; thumbnailUrl: string | null; createdAt: string }>;
    }
  >();
  for (const row of rows) {
    const current = grouped.get(row.user_id) ?? {
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      stories: [],
    };
    current.stories.push({
      id: row.id,
      mediaUrl: row.media_url,
      thumbnailUrl: row.thumbnail,
      createdAt: row.created_at.toISOString(),
    });
    grouped.set(row.user_id, current);
  }
  res.json({ users: [...grouped.values()] });
});

export default router;
