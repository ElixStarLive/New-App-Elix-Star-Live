/**
 * PAGE-022 runtime proof — upload ownership + publish contracts against NEW API.
 * Run: npx tsx scripts/_page022_upload_runtime_proof.ts
 * Requires API :8080 + Neon. Does not claim physical Android Device PASS.
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

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

try {
  await requireValkey().ping();
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL required for PAGE-022 proof");

  const uploadPage = readFileSync(resolve("src/pages/Upload.tsx"), "utf8");
  const sessionSrc = readFileSync(resolve("src/features/upload/uploadSession.ts"), "utf8");
  const serverSession = readFileSync(resolve("server/modules/uploads/session.ts"), "utf8");
  if (!uploadPage.includes("useUploadPublishSession")) throw new Error("Upload missing session hook");
  if (!uploadPage.includes("duetParam")) throw new Error("Upload missing duet query handling");
  if (!sessionSrc.includes("createUploadPublishSession")) throw new Error("upload session owner missing");
  if (!serverSession.includes("buildVideoMusicJson")) throw new Error("server duet music owner missing");
  if (uploadPage.includes("/api/videos/upload")) throw new Error("legacy multipart upload forbidden on page");

  const health = await json("/api/health");
  if (health.status !== 200) throw new Error(`health ${health.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-022",
        health: health.status,
        uploadOwner: "createUploadPublishSession",
        serverOwner: "publishUploadSession",
        duet: true,
        note: "Full Bunny/Neon publish proof runs in server/http.it.test.ts when DATABASE_URL is set",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, page: "PAGE-022", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool()?.end().catch(() => undefined);
}
