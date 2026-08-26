import { describe, expect, it } from "vitest";
import { discardCapturedCreateMedia, peekCapturedCreateMedia, setCapturedCreateMedia, takeCapturedCreateMedia } from "./capturedMediaCache";
import type { CapturedCreateMedia } from "./createCameraContract";

function media(id: string): CapturedCreateMedia {
  return {
    blob: new Blob([id], { type: "video/webm" }),
    objectUrl: `blob:${id}`,
    mimeType: "video/webm",
    kind: "video",
    durationMs: 800,
    width: 720,
    height: 1280,
    orientation: "portrait",
    facing: "user",
    soundId: null,
    source: "camera",
    originalVolume: 1,
    musicVolume: 0.7,
  };
}

describe("PAGE-021 captured media cache", () => {
  it("hands the blob to PAGE-022 once", () => {
    discardCapturedCreateMedia();
    const clip = media("a");
    setCapturedCreateMedia(clip);
    expect(peekCapturedCreateMedia()).toBe(clip);
    expect(takeCapturedCreateMedia()).toBe(clip);
    expect(takeCapturedCreateMedia()).toBeNull();
  });
});
