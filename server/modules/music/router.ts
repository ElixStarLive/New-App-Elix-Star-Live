import { Router } from "express";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import {
  queryLocalSounds,
  queryMusicCollections,
  queryMusicGlobal,
  queryMusicPlaylists,
  queryMusicPreview,
  queryMusicSearch,
  queryMusicStatus,
} from "./query.js";

const router = Router();

router.get("/status", async (_req, res) => {
  res.json(await queryMusicStatus());
});

router.get("/global", async (_req, res) => {
  const body = await queryMusicGlobal();
  if (body.configured) {
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  }
  res.json(body);
});

router.get("/playlists", async (req, res) => {
  const limit = Number(req.query.limit);
  const perPlaylist = Number(req.query.perPlaylist);
  const body = await queryMusicPlaylists({
    limit: Number.isFinite(limit) ? limit : undefined,
    perPlaylist: Number.isFinite(perPlaylist) ? perPlaylist : undefined,
  });
  if (body.configured) {
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  }
  res.json(body);
});

router.get("/collections", async (req, res) => {
  const limitRaw = parseInt(String(req.query.limit ?? "10"), 10);
  const offsetRaw = parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Math.min(20, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10));
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
  const body = await queryMusicCollections(limit, offset);
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  res.json(body);
});

router.get("/search", async (req, res) => {
  const term = typeof req.query.term === "string" ? req.query.term : "";
  const trimmed = term.trim();
  if (!trimmed) {
    const sounds = await queryLocalSounds("");
    const status = await queryMusicStatus();
    const tracks = sounds.map((row) => ({
      id: row.id,
      title: row.title || "Sound",
      artist: row.artist || "",
      duration: "",
      coverUrl: row.cover_url,
      clipStartSeconds: 0,
      clipEndSeconds: 60,
    }));
    res.json({ configured: status.configured, tracks });
    return;
  }
  const body = await queryMusicSearch(trimmed);
  res.json(body);
});

router.get("/tracks/:id/preview", async (req, res) => {
  const id = routeParam(req, "id").trim();
  if (!id) throw new AppError("invalid_argument", "trackId is required", 400);
  const body = await queryMusicPreview(id);
  res.json(body);
});

export default router;
