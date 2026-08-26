/**
 * PAGE-016 runtime proof — music status/catalog/preview against NEW Neon + Valkey.
 * Run: npx tsx scripts/_page016_music_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so elix:music:* cache paths stay honest.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { musicCacheKey, previewCacheKey } = await import("../server/modules/music/musicCache.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p16${Date.now().toString(36)}`;

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

try {
  const valkey = requireValkey();
  await valkey.ping();

  const status = await json("/api/music/status");
  if (status.status !== 200) throw new Error(`status ${status.status}`);
  const statusBody = asRecord(status.body);
  const configured = statusBody.configured === true;

  const global = await json("/api/music/global");
  const globalBody = asRecord(global.body);
  if (!configured) {
    if (global.status !== 200) throw new Error(`global ${global.status}`);
    if (globalBody.configured !== false) throw new Error("global configured mismatch vs status");
    if (globalBody.playlist != null) throw new Error("unconfigured global must not invent a playlist");
  } else if (global.status === 200) {
    if (globalBody.configured !== true) throw new Error("global configured mismatch");
  } else if (global.status === 502) {
    console.log("global provider unavailable (502) — accepted when configured");
  } else {
    throw new Error(`global unexpected ${global.status}`);
  }

  const playlists = await json("/api/music/playlists");
  const playlistsBody = asRecord(playlists.body);
  if (!configured) {
    if (playlists.status !== 200) throw new Error(`playlists ${playlists.status}`);
    if (playlistsBody.configured !== false) throw new Error("playlists configured mismatch");
    if (Array.isArray(playlistsBody.playlists) && playlistsBody.playlists.length > 0) {
      throw new Error("unconfigured playlists must be empty");
    }
  } else if (playlists.status === 200) {
    if (playlistsBody.configured !== true) throw new Error("playlists configured mismatch");
    if (!Array.isArray(playlistsBody.playlists)) throw new Error("playlists missing array");
  } else if (playlists.status === 502) {
    // Honest provider failure (e.g. Epidemic 429) — do not invent a catalog.
    console.log("playlists provider unavailable (502) — accepted when configured");
  } else {
    throw new Error(`playlists unexpected ${playlists.status}`);
  }

  const collections = await json("/api/music/collections");
  if (!configured) {
    if (collections.status !== 503) {
      throw new Error(`collections expected 503 when unconfigured, got ${collections.status}`);
    }
  } else if (collections.status !== 200 && collections.status !== 502 && collections.status !== 503) {
    throw new Error(`collections unexpected ${collections.status}`);
  }

  const soundId = `local-${unique}`;
  await getPool().query(
    `INSERT INTO sounds (id, title, artist, audio_url, cover_url, duration_ms, provider)
     VALUES ($1, $2, 'Proof Artist', $3, NULL, 12000, 'elix')
     ON CONFLICT (id) DO UPDATE SET audio_url = EXCLUDED.audio_url, title = EXCLUDED.title`,
    [soundId, `Studio ${unique}`, `https://cdn.example/${unique}.mp3`],
  );

  const emptySearch = await json("/api/music/search");
  if (emptySearch.status !== 200) throw new Error(`empty search ${emptySearch.status}`);
  const emptyTracks = asRecord(emptySearch.body).tracks;
  if (!Array.isArray(emptyTracks) || !emptyTracks.some((row) => asRecord(row).id === soundId)) {
    throw new Error("empty search missing local Neon sound");
  }

  const termSearch = await json(`/api/music/search?term=${encodeURIComponent(`Studio ${unique}`)}`);
  if (configured) {
    if (termSearch.status !== 200 && termSearch.status !== 502) {
      throw new Error(`term search unexpected ${termSearch.status}`);
    }
  } else if (termSearch.status !== 503) {
    throw new Error(`term search expected 503 when unconfigured, got ${termSearch.status}`);
  }

  // When Epidemic catalog is available, prove a licensed preview URL resolves.
  if (playlists.status === 200 && Array.isArray(playlistsBody.playlists)) {
    const firstPl = asRecord(playlistsBody.playlists[0]);
    const tracks = Array.isArray(firstPl.tracks) ? firstPl.tracks : [];
    const firstTrackId = String(asRecord(tracks[0]).id ?? "");
    if (firstTrackId) {
      const licensedPreview = await json(`/api/music/tracks/${encodeURIComponent(firstTrackId)}/preview`);
      if (licensedPreview.status === 200) {
        if (typeof asRecord(licensedPreview.body).url !== "string" || !asRecord(licensedPreview.body).url) {
          throw new Error("licensed preview missing url");
        }
        const licensedAgain = await json(`/api/music/tracks/${encodeURIComponent(firstTrackId)}/preview`);
        if (licensedAgain.status !== 200) throw new Error(`licensed preview reload ${licensedAgain.status}`);
        if (asRecord(licensedAgain.body).url !== asRecord(licensedPreview.body).url) {
          throw new Error("licensed preview identity changed across reload");
        }
      } else if (licensedPreview.status === 404 || licensedPreview.status === 502) {
        console.log(`licensed preview unavailable (${licensedPreview.status}) — local Neon preview still required`);
      } else {
        throw new Error(`licensed preview unexpected ${licensedPreview.status}`);
      }
    }
  }

  const preview = await json(`/api/music/tracks/${encodeURIComponent(soundId)}/preview`);
  if (preview.status !== 200) throw new Error(`preview ${preview.status}`);
  if (asRecord(preview.body).url !== `https://cdn.example/${unique}.mp3`) {
    throw new Error("preview url mismatch");
  }

  const missing = await json("/api/music/tracks/not-a-real-track-xyz/preview");
  if (missing.status !== 404) throw new Error(`missing preview expected 404 got ${missing.status}`);

  // Prove Valkey key helpers are the canonical elix:music:* owners (write/read round-trip).
  const probeKey = musicCacheKey("proof", unique);
  const previewKey = previewCacheKey(`proof-${unique}`);
  await valkey.set(probeKey, JSON.stringify({ ok: true }), "PX", 60_000);
  await valkey.set(previewKey, JSON.stringify({ url: "https://cdn.example/p.mp3", format: "mp3" }), "PX", 60_000);
  const probeRaw = await valkey.get(probeKey);
  const previewRaw = await valkey.get(previewKey);
  if (!probeRaw || !previewRaw) throw new Error("Valkey elix:music probe failed");
  if (!probeKey.startsWith("elix:music:") || !previewKey.startsWith("elix:music:preview:v2:")) {
    throw new Error("Valkey music key shape wrong");
  }
  await valkey.del(probeKey, previewKey);

  // Deep-link route is client-owned; prove API identity for a known local track remains stable.
  const again = await json(`/api/music/tracks/${encodeURIComponent(soundId)}/preview`);
  if (again.status !== 200 || asRecord(again.body).url !== `https://cdn.example/${unique}.mp3`) {
    throw new Error("reload preview identity failed");
  }

  console.log("PAGE-016 runtime proof PASS", {
    configured,
    soundId,
    provider: statusBody.provider,
    playlistsStatus: playlists.status,
    playlistCount:
      playlists.status === 200 && Array.isArray(playlistsBody.playlists) ? playlistsBody.playlists.length : null,
  });
} catch (err) {
  console.error("PAGE-016 runtime proof FAIL", err);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool().end();
  } catch {
    /* ignore */
  }
}
