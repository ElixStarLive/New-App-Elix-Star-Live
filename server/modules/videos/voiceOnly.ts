import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const VOICE_ONLY_FFMPEG_ARGS = ["-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy"] as const;
const MAX_BYTES = 500 * 1024 * 1024;

function configuredCdnHosts(): Set<string> {
  const raw = process.env.BUNNY_CDN_HOSTNAME ?? "";
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? "";
  return host ? new Set([host]) : new Set();
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertDownloadableMediaUrl(sourceUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (parsed.protocol !== "https:") throw new Error("URL_SCHEME_NOT_ALLOWED");
  if (parsed.username || parsed.password) throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
  const host = parsed.hostname.toLowerCase();
  if (isPrivateHostname(host)) throw new Error("URL_HOST_PRIVATE");
  const allow = configuredCdnHosts();
  const bunny =
    allow.has(host) ||
    host.endsWith(".b-cdn.net") ||
    host === "storage.bunnycdn.com" ||
    host.endsWith(".storage.bunnycdn.com");
  if (!bunny) throw new Error("URL_HOST_NOT_ALLOWED");
  return parsed;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-400) || `ffmpeg exit ${code}`));
    });
  });
}

async function ffmpegAvailable(): Promise<boolean> {
  return await new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/** Keep the first video stream and first audio stream (mic). Drop extra soundtrack streams. */
export async function keepPrimaryVideoAndAudio(input: Buffer): Promise<Buffer> {
  if (!(await ffmpegAvailable())) return input;
  const id = randomUUID();
  const inPath = join(tmpdir(), `elix-voice-in-${id}.mp4`);
  const outPath = join(tmpdir(), `elix-voice-out-${id}.mp4`);
  try {
    await writeFile(inPath, input);
    await runFfmpeg(["-i", inPath, ...VOICE_ONLY_FFMPEG_ARGS, outPath]);
    return await readFile(outPath);
  } catch {
    return input;
  } finally {
    await unlink(inPath).catch(() => undefined);
    await unlink(outPath).catch(() => undefined);
  }
}

export async function fetchVoiceOnlyMp4(sourceUrl: string): Promise<Buffer> {
  assertDownloadableMediaUrl(sourceUrl);
  const res = await fetch(sourceUrl, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new Error(`SOURCE_REDIRECT_${res.status}`);
  if (!res.ok) throw new Error(`SOURCE_FETCH_${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new Error("SOURCE_TOO_LARGE");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("SOURCE_TOO_LARGE");
  return keepPrimaryVideoAndAudio(bytes);
}
