import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";

const router = Router();

function configured(): boolean {
  return Boolean(process.env.EPIDEMIC_SOUND_API_KEY?.trim());
}

router.get("/status", (_req, res) => {
  res.json({ configured: configured() });
});

router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!configured()) {
    const local = await getPool().query<{ id: string; title: string; artist: string; audio_url: string }>(
      `SELECT id, title, artist, audio_url FROM sounds
       WHERE ($1 = '' OR title ILIKE $2 OR artist ILIKE $2)
       ORDER BY created_at DESC LIMIT 40`,
      [q, `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`],
    );
    res.json({ configured: false, items: local.rows });
    return;
  }
  const key = process.env.EPIDEMIC_SOUND_API_KEY as string;
  const url = new URL("https://api.epidemicsound.com/v2/tracks");
  if (q) url.searchParams.set("term", q);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) {
    throw new AppError("unavailable", "Music catalog is unavailable", 502);
  }
  const body = (await response.json()) as { tracks?: Array<{ id?: string; title?: string; artist?: string }> };
  res.json({
    configured: true,
    items: (body.tracks ?? []).map((track) => ({
      id: String(track.id ?? ""),
      title: String(track.title ?? ""),
      artist: String(track.artist ?? ""),
    })),
  });
});

router.get("/playlists", async (_req, res) => {
  if (!configured()) {
    res.json({ configured: false, items: [] });
    return;
  }
  const key = process.env.EPIDEMIC_SOUND_API_KEY as string;
  const response = await fetch("https://api.epidemicsound.com/v2/playlists", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new AppError("unavailable", "Music playlists are unavailable", 502);
  }
  const body = (await response.json()) as { playlists?: Array<{ id?: string; name?: string }> };
  res.json({
    configured: true,
    items: (body.playlists ?? []).map((row) => ({ id: String(row.id ?? ""), title: String(row.name ?? "") })),
  });
});

router.get("/tracks/:id/preview", async (req, res) => {
  const id = routeParam(req, "id");
  const local = await getPool().query<{ audio_url: string }>(`SELECT audio_url FROM sounds WHERE id = $1`, [id]);
  if (local.rows[0]) {
    res.json({ url: local.rows[0].audio_url, configured: true });
    return;
  }
  if (!configured()) {
    throw new AppError("not_found", "Track not found", 404);
  }
  const key = process.env.EPIDEMIC_SOUND_API_KEY as string;
  const response = await fetch(`https://api.epidemicsound.com/v2/tracks/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new AppError("not_found", "Track not found", 404);
  const body = (await response.json()) as { preview_url?: string; previewUrl?: string };
  const url = body.preview_url || body.previewUrl;
  if (!url) throw new AppError("not_found", "Preview is not available", 404);
  res.json({ url, configured: true });
});

router.get("/videos/:soundId", async (req, res) => {
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.sound_id = $1`,
      extraParams: [routeParam(req, "soundId")],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

export default router;
