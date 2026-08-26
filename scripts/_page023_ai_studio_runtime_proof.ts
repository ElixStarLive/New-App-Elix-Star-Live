/**
 * PAGE-023 runtime proof — local AI Studio ownership (no server AI jobs).
 * Run: npx tsx scripts/_page023_ai_studio_runtime_proof.ts
 * Does not claim physical Android Device PASS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAiStudioSession } from "../src/features/aiStudio/aiStudioSession.ts";
import { AI_FILTER_PRESETS, BACKGROUND_OPTIONS } from "../src/features/aiStudio/catalog.ts";

const page = readFileSync(resolve("src/pages/AIStudio.tsx"), "utf8");
const sessionSrc = readFileSync(resolve("src/features/aiStudio/aiStudioSession.ts"), "utf8");
const sheet = readFileSync(resolve("src/components/AiStudioToolsSheet.tsx"), "utf8");
const app = readFileSync(resolve("src/App.tsx"), "utf8");
const shell = readFileSync(resolve("src/lib/appShell.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  assert(app.includes('path="/ai-studio"'), "route /ai-studio missing");
  assert(shell.includes("/ai-studio"), "bottom nav hide missing for /ai-studio");
  assert(page.includes("createAiStudioSession") || page.includes("useAiStudioSession"), "session hook missing");
  assert(page.includes("AI_STUDIO_EXIT_TO"), "named exit missing");
  assert(!page.includes("/api/ai"), "fake AI API on page");
  assert(!sessionSrc.includes("/api/ai"), "fake AI API in session");
  assert(!sheet.includes("fetch("), "tools sheet must not fetch");
  assert(!page.includes("createUploadPublishSession"), "must not own PAGE-022 upload");
  assert(!page.includes("getUserMedia"), "must not own camera");
  assert(sheet.includes("Filters") && sheet.includes("Enhance") && sheet.includes("Captions"), "tools tabs incomplete");
  assert(sheet.includes("Thumbnail") && sheet.includes("Voice FX") && sheet.includes("Subtitles"), "tools tabs incomplete");
  assert(AI_FILTER_PRESETS.some((f) => f.id === "none"), "Original filter missing");
  assert(AI_FILTER_PRESETS.length >= 24, "filter catalog too small");
  assert(BACKGROUND_OPTIONS.length >= 12, "background catalog too small");

  const revoked: string[] = [];
  const created: string[] = [];
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = () => {
    const url = `blob:proof-${created.length}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };

  const session = createAiStudioSession();
  assert(session.importVideo(new File(["x"], "bad.txt", { type: "text/plain" })).ok === false, "invalid video accepted");
  assert(session.importVideo(new File(["clip"], "a.webm", { type: "video/webm" })).ok === true, "video import failed");
  assert(session.getSnapshot().videoUrl === "blob:proof-0", "video url missing");
  session.setFilterCss("sepia(0.2)");
  session.setEnhanceCss("brightness(1.1)");
  assert(session.getSnapshot().combinedFilter?.includes("sepia") === true, "combined filter missing");
  session.resetLooks();
  assert(session.getSnapshot().combinedFilter === undefined, "reset failed");
  assert(session.importBackground(new File(["img"], "b.jpg", { type: "image/jpeg" })).ok === true, "bg import failed");
  session.dispose();
  assert(revoked.includes("blob:proof-0"), "video url not revoked");
  assert(session.getSnapshot().videoUrl === null, "dispose left video");

  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-023",
        filters: AI_FILTER_PRESETS.length,
        backgrounds: BACKGROUND_OPTIONS.length,
        route: "/ai-studio",
        serverAi: false,
        note: "Local session/object-URL proof only — physical device media UI not claimed",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      page: "PAGE-023",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}
