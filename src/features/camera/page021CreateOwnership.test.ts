import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const createPage = readFileSync(resolve(root, "../../pages/Create.tsx"), "utf8");
const layout = readFileSync(resolve(root, "../../components/ElixCameraLayout.tsx"), "utf8");
const session = readFileSync(resolve(root, "./createCameraSession.ts"), "utf8");
const hook = readFileSync(resolve(root, "./useCreateCameraSession.ts"), "utf8");
const optionsApi = readFileSync(resolve(root, "./cameraOptionsApi.ts"), "utf8");
const soundMix = readFileSync(resolve(root, "../../components/SoundMixPanel.tsx"), "utf8");
const cameraOpts = readFileSync(resolve(root, "../../../server/modules/camera/options.ts"), "utf8");
const serverIndex = readFileSync(resolve(root, "../../../server/index.ts"), "utf8");

describe("PAGE-021 create camera ownership", () => {
  it("keeps a single session owner for getUserMedia and MediaRecorder", () => {
    expect(createPage).not.toMatch(/getUserMedia/);
    expect(createPage).not.toMatch(/new MediaRecorder/);
    expect(createPage).not.toMatch(/apiUploadVideo|apiUploadForm/);
    expect(createPage).toContain("useCreateCameraSession");
    expect(createPage).toContain("setCapturedCreateMedia");
    expect(createPage).toContain("SoundMixPanel");
    expect(createPage).toContain("viewerId");
    expect(createPage).toContain("discardCapturedCreateMedia");
    expect(layout).not.toMatch(/getUserMedia/);
    expect(layout).not.toMatch(/MediaRecorder/);
    expect(hook).toContain("createCameraSession");
    expect(hook).toContain("session.release");
    expect(hook).toContain("onForeground");
    const getUserMediaOwners = session.match(/getUserMedia/g) ?? [];
    expect(getUserMediaOwners.length).toBeGreaterThan(0);
    expect(session).toContain("createRecorder");
    expect(session).toContain("video: true");
    expect(session).toContain("onForeground");
    expect(session).not.toMatch(/setTimeoutFn\(\(\) => \{\s*patch\(\{ recording: true \}/);
    expect(session).not.toMatch(/window\.location\.reload/);
    expect(optionsApi).toMatch(/\/api\/camera-filters/);
    expect(optionsApi).toMatch(/\/api\/speed-options/);
    expect(optionsApi).toMatch(/\/api\/sticker-options/);
    expect(cameraOpts).toMatch(/CAMERA_FILTER_OPTIONS/);
    expect(serverIndex).toMatch(/cameraOptionsRouter/);
    expect(soundMix).toMatch(/Original video/);
  });

  it("does not keep leftover Create variants or Bunny upload on Create", () => {
    expect(createPage).not.toMatch(/CreateOld|CreateNew|CreateFixed|CameraV2/);
    expect(createPage).not.toMatch(/\/api\/uploads|bunny|setCachedCameraStream/);
    expect(session).not.toMatch(/blob:https:\/\/www\.elixstarlive/);
  });
});
