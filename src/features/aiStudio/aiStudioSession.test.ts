import { describe, expect, it } from "vitest";
import { createAiStudioSession } from "./aiStudioSession";
import { combineLooks, enhanceToCss, isImageFile, isVideoFile, scaleFilterCss } from "./looks";
import { suggestCaptions, suggestHashtags } from "./suggestCaptions";
import { DEFAULT_ENHANCE } from "./catalog";
import { speechRecognitionSupported } from "./speechCapture";

describe("PAGE-023 AI Studio session", () => {
  it("rejects non-video import and accepts a video blob URL", () => {
    const session = createAiStudioSession();
    expect(session.importVideo(new File(["x"], "note.txt", { type: "text/plain" })).ok).toBe(false);
    const video = new File(["clip"], "clip.webm", { type: "video/webm" });
    const created: string[] = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => {
      const url = `blob:ai-${created.length}`;
      created.push(url);
      void blob;
      return url;
    };
    try {
      expect(session.importVideo(video).ok).toBe(true);
      expect(session.getSnapshot().videoUrl).toBe("blob:ai-0");
      session.dispose();
      expect(session.getSnapshot().videoUrl).toBeNull();
    } finally {
      URL.createObjectURL = orig;
    }
  });

  it("rejects non-image backgrounds", () => {
    const session = createAiStudioSession();
    expect(session.importBackground(new File(["x"], "clip.webm", { type: "video/webm" })).ok).toBe(false);
    session.dispose();
  });

  it("exports fail without a loaded video", async () => {
    const session = createAiStudioSession();
    const result = await session.exportFrame();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-video");
    session.dispose();
  });

  it("replaces video blob URL and revokes the previous one", () => {
    const session = createAiStudioSession();
    const revoked: string[] = [];
    const created: string[] = [];
    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => {
      void blob;
      const url = `blob:ai-${created.length}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    try {
      expect(session.importVideo(new File(["a"], "a.webm", { type: "video/webm" })).ok).toBe(true);
      expect(session.importVideo(new File(["b"], "b.webm", { type: "video/webm" })).ok).toBe(true);
      expect(revoked).toContain("blob:ai-0");
      expect(session.getSnapshot().videoUrl).toBe("blob:ai-1");
      session.dispose();
      expect(revoked).toContain("blob:ai-1");
      expect(session.getSnapshot().videoUrl).toBeNull();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it("resetLooks clears filter and enhance CSS", () => {
    const session = createAiStudioSession();
    session.setFilterCss("sepia(0.2)");
    session.setEnhanceCss("brightness(1.1)");
    expect(session.getSnapshot().combinedFilter).toBe("sepia(0.2) brightness(1.1)");
    session.resetLooks();
    expect(session.getSnapshot().combinedFilter).toBeUndefined();
    session.dispose();
  });
});

describe("PAGE-023 local looks and captions", () => {
  it("scales filter intensity without inventing a server job", () => {
    expect(scaleFilterCss("none", 50)).toBe("none");
    expect(scaleFilterCss("brightness(1.2) contrast(1.1)", 50)).toContain("brightness(");
  });

  it("maps enhance sliders to CSS and empty enhance to none", () => {
    expect(enhanceToCss(DEFAULT_ENHANCE)).toBe("none");
    expect(enhanceToCss({ ...DEFAULT_ENHANCE, brightness: 20 })).toBe("brightness(1.2)");
    expect(combineLooks("none", "none")).toBeUndefined();
  });

  it("validates video and image files locally", () => {
    expect(isVideoFile(new File(["a"], "a.mp4", { type: "video/mp4" }))).toBe(true);
    expect(isVideoFile(new File(["a"], "a.jpg", { type: "image/jpeg" }))).toBe(false);
    expect(isImageFile(new File(["a"], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isImageFile(new File([], "empty.jpg", { type: "image/jpeg" }))).toBe(false);
  });

  it("suggests captions locally with deterministic scores (no fetch)", () => {
    const a = suggestCaptions("dance video with friends");
    const b = suggestCaptions("dance video with friends");
    expect(a.map((s) => s.caption)).toEqual(b.map((s) => s.caption));
    expect(a[0]?.hashtags.length).toBeGreaterThan(0);
    expect(suggestHashtags("music song", 5).length).toBeGreaterThan(0);
    expect(suggestCaptions("").some((s) => s.caption.length > 0)).toBe(true);
    expect(suggestCaptions("dans 💃 video").some((s) => s.caption.includes("💃"))).toBe(true);
  });

  it("does not claim speech support without a browser API", () => {
    expect(speechRecognitionSupported()).toBe(false);
  });
});
