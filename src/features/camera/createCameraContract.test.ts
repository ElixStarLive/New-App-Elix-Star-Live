import { describe, expect, it } from "vitest";
import {
  capturedHandoffPayload,
  classifyCameraError,
  createPathWithSound,
  durationLimitMs,
  isCreateSoundPick,
  isSecureCameraContext,
  orientationFromSize,
  parseCreateSoundSelection,
  pickRecorderMime,
} from "./createCameraContract";

describe("PAGE-021 camera contract", () => {
  it("maps duration chrome to a real recorder limit", () => {
    expect(durationLimitMs("15s")).toBe(15_000);
    expect(durationLimitMs("60s")).toBe(60_000);
    expect(durationLimitMs("10m")).toBe(600_000);
    expect(durationLimitMs("PHOTO")).toBeNull();
    expect(durationLimitMs("TEXT")).toBeNull();
  });

  it("picks the first supported recorder MIME and does not invent one", () => {
    expect(pickRecorderMime(() => false)).toBeUndefined();
    expect(pickRecorderMime((type) => type === "video/webm")).toBe("video/webm");
  });

  it("classifies permission, busy, and missing-device failures honestly", () => {
    expect(classifyCameraError(Object.assign(new Error("denied"), { name: "NotAllowedError" })).kind).toBe(
      "permission",
    );
    expect(classifyCameraError(Object.assign(new Error("busy"), { name: "NotReadableError" })).kind).toBe("busy");
    expect(classifyCameraError(Object.assign(new Error("gone"), { name: "NotFoundError" })).kind).toBe("notfound");
  });

  it("keeps localhost as a secure camera context", () => {
    expect(isSecureCameraContext({ isSecureContext: false, protocol: "http:", hostname: "localhost" })).toBe(true);
    expect(isSecureCameraContext({ isSecureContext: false, protocol: "http:", hostname: "evil.example" })).toBe(false);
  });

  it("parses canonical soundId from query or state and rejects original", () => {
    expect(parseCreateSoundSelection("?soundId=track-9", null)).toEqual({ soundId: "track-9", title: "Sound" });
    expect(parseCreateSoundSelection("", { soundId: "track-9", soundTitle: "Night Drive" })).toEqual({
      soundId: "track-9",
      title: "Night Drive",
    });
    expect(parseCreateSoundSelection("?soundId=original", null)).toBeNull();
    expect(isCreateSoundPick({ returnTo: "/create", pickSound: true })).toBe(true);
    expect(isCreateSoundPick({ returnTo: "/feed", pickSound: true })).toBe(false);
    expect(createPathWithSound("track-9", "Night Drive").search).toBe("?soundId=track-9");
  });

  it("does not put blob bytes into the handoff summary", () => {
    const payload = capturedHandoffPayload({
      blob: new Blob(["x"], { type: "video/webm" }),
      objectUrl: "blob:test",
      mimeType: "video/webm",
      kind: "video",
      durationMs: 1200,
      width: 720,
      height: 1280,
      orientation: "portrait",
      facing: "user",
      soundId: "track-9",
      source: "camera",
      originalVolume: 1,
      musicVolume: 0.7,
    });
    expect(payload).toEqual({
      mimeType: "video/webm",
      kind: "video",
      durationMs: 1200,
      width: 720,
      height: 1280,
      orientation: "portrait",
      soundId: "track-9",
      source: "camera",
    });
    expect(orientationFromSize(1280, 720)).toBe("landscape");
  });
});
