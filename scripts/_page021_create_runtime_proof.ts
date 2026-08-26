/**
 * PAGE-021 runtime proof — camera option contracts + Create ownership against NEW API.
 * Run: npx tsx scripts/_page021_create_runtime_proof.ts
 * Requires API :8080. Does not claim physical camera Device PASS.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function json(path: string) {
  const res = await fetch(`${base}${path}`);
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
  await requireValkey().ping();

  const filters = await json("/api/camera-filters");
  if (filters.status !== 200) throw new Error(`camera-filters ${filters.status}`);
  const filterData = asRecord(filters.body).data;
  if (!Array.isArray(filterData) || filterData.length < 2) throw new Error("camera-filters empty");
  if (!filterData.some((row) => String(asRecord(row).id) === "none")) throw new Error("Normal filter missing");

  const speeds = await json("/api/speed-options");
  if (speeds.status !== 200) throw new Error(`speed-options ${speeds.status}`);
  const speedData = asRecord(speeds.body).data;
  if (!Array.isArray(speedData) || !speedData.some((row) => Number(asRecord(row).value) === 1)) {
    throw new Error("1x speed missing");
  }

  const stickers = await json("/api/sticker-options");
  if (stickers.status !== 200) throw new Error(`sticker-options ${stickers.status}`);
  const stickerData = asRecord(stickers.body).data;
  if (!Array.isArray(stickerData) || stickerData.length < 5) throw new Error("sticker-options empty");

  const createSrc = readFileSync(resolve("src/pages/Create.tsx"), "utf8");
  if (!createSrc.includes("useCreateCameraSession")) throw new Error("Create missing session hook");
  if (!createSrc.includes("SoundMixPanel")) throw new Error("Create missing SoundMix");
  if (!createSrc.includes("/live/broadcast")) throw new Error("Create missing LIVE handoff");
  if (!createSrc.includes("setCapturedCreateMedia")) throw new Error("Create missing Upload cache");
  if (createSrc.includes("getUserMedia") || createSrc.includes("new MediaRecorder")) {
    throw new Error("Create must not own getUserMedia/MediaRecorder");
  }
  if (createSrc.includes("/api/uploads") || createSrc.includes("bunny")) {
    throw new Error("Create must not own Bunny upload");
  }

  const sessionSrc = readFileSync(resolve("src/features/camera/createCameraSession.ts"), "utf8");
  if (!sessionSrc.includes("video: true")) throw new Error("facingMode fallback missing");
  if (!sessionSrc.includes("onForeground")) throw new Error("foreground resume missing");

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-021",
        filters: filterData.length,
        speeds: speedData.length,
        stickers: stickerData.length,
        device: "FAIL",
        note: "No physical Android attached; camera/mic Device PASS deferred",
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err);
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
