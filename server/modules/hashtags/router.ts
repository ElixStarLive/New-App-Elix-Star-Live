import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";
import { normalizeHashtag } from "../../lib/hashtags.js";
import { routeParam } from "../../http/param.js";

const router = Router();

router.get("/:tag/videos", async (req, res) => {
  const tag = normalizeHashtag(routeParam(req, "tag"));
  if (!tag) {
    res.json({ items: [], nextCursor: null });
    return;
  }
  res.json(
    await queryVideoPage({
      extraWhere: `AND $1 = ANY(v.hashtags)`,
      extraParams: [tag],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.get("/:tag", async (req, res) => {
  const tag = normalizeHashtag(routeParam(req, "tag"));
  const count = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM videos WHERE deleted_at IS NULL AND privacy = 'public' AND $1 = ANY(hashtags)`,
    [tag],
  );
  res.json({ tag, videoCount: Number(count.rows[0]?.c ?? 0) });
});

export default router;
