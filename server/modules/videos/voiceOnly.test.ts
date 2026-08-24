import { spawn } from "node:child_process";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDownloadableMediaUrl, keepPrimaryVideoAndAudio, VOICE_ONLY_FFMPEG_ARGS } from "./voiceOnly.js";

function ffmpegVersion(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

describe("PAGE-007 voice-only download contract", () => {
  it("maps only the first video stream and first audio stream", () => {
    expect([...VOICE_ONLY_FFMPEG_ARGS]).toEqual(["-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy"]);
  });

  it("allows Bunny CDN https URLs", () => {
    const url = assertDownloadableMediaUrl("https://vz-example.b-cdn.net/clip.mp4");
    expect(url.hostname).toBe("vz-example.b-cdn.net");
  });

  it("rejects non-CDN and local sources", () => {
    expect(() => assertDownloadableMediaUrl("http://vz-example.b-cdn.net/clip.mp4")).toThrow("URL_SCHEME_NOT_ALLOWED");
    expect(() => assertDownloadableMediaUrl("https://cdn.example/clip.mp4")).toThrow("URL_HOST_NOT_ALLOWED");
    expect(() => assertDownloadableMediaUrl("https://127.0.0.1/clip.mp4")).toThrow("URL_HOST_PRIVATE");
  });

  it("removes extra audio streams from a dual-audio MP4 when ffmpeg is installed", async () => {
    if (!(await ffmpegVersion())) return;
    const dir = await mkdtemp(join(tmpdir(), "elix-voice-"));
    const dual = join(dir, "dual.mp4");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=16x16:d=0.2",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=0.2",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=880:duration=0.2",
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-map",
          "2:a:0",
          "-c:v",
          "mpeg4",
          "-c:a",
          "aac",
          dual,
        ],
        { stdio: "ignore" },
      );
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg make dual exit ${code}`))));
    });
    const stripped = await keepPrimaryVideoAndAudio(await readFile(dual));
    const out = join(dir, "voice.mp4");
    await writeFile(out, stripped);
    const probe = await new Promise<string>((resolve, reject) => {
      const proc = spawn("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      proc.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error("ffprobe failed"))));
    });
    const types = probe
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    expect(types.filter((row) => row === "video")).toHaveLength(1);
    expect(types.filter((row) => row === "audio")).toHaveLength(1);
    await unlink(dual).catch(() => undefined);
    await unlink(out).catch(() => undefined);
  }, 30_000);

  it("keeps bytes when ffmpeg is missing, and remuxes when ffmpeg is present", async () => {
    const source = Buffer.from("not-a-real-mp4");
    if (!(await ffmpegVersion())) {
      const out = await keepPrimaryVideoAndAudio(source);
      expect(out.equals(source)).toBe(true);
      return;
    }
    const out = await keepPrimaryVideoAndAudio(source);
    expect(Buffer.isBuffer(out)).toBe(true);
  });
});
