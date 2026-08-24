import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const musicApi = vi.hoisted(() => ({
  apiMusicTrackPreview: vi.fn(),
}));

vi.mock("./musicApi", () => musicApi);
vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ muteAllSounds: false }),
  },
}));

import { getMusicPreviewState, stopMusicPreview, toggleMusicPreview } from "./previewPlayer";
import type { MusicTrack } from "./musicApi";

const track: MusicTrack = {
  id: "t1",
  title: "Night Drive",
  artist: "ES",
  duration: "0:45",
  coverUrl: null,
  clipStartSeconds: 0,
  clipEndSeconds: 45,
};

describe("PAGE-016 music preview player", () => {
  beforeEach(() => {
    musicApi.apiMusicTrackPreview.mockReset();
    stopMusicPreview();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    stopMusicPreview();
  });

  it("plays then pauses the same track without a second Audio race", async () => {
    musicApi.apiMusicTrackPreview.mockResolvedValue({ url: "https://cdn.example/p.mp3", error: null });
    const first = await toggleMusicPreview(track);
    expect(first.error).toBeNull();
    expect(getMusicPreviewState().playingId).toBe("t1");
    const second = await toggleMusicPreview(track);
    expect(second.error).toBeNull();
    expect(getMusicPreviewState().playingId).toBeNull();
    expect(musicApi.apiMusicTrackPreview).toHaveBeenCalledTimes(1);
  });

  it("drops a stale preview when a second track starts first", async () => {
    let resolveFirst: (value: { url: string | null; error: string | null }) => void = () => undefined;
    musicApi.apiMusicTrackPreview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    musicApi.apiMusicTrackPreview.mockResolvedValueOnce({ url: "https://cdn.example/b.mp3", error: null });
    const firstPromise = toggleMusicPreview(track);
    const second = await toggleMusicPreview({ ...track, id: "t2", title: "Other" });
    expect(second.error).toBeNull();
    expect(getMusicPreviewState().playingId).toBe("t2");
    resolveFirst({ url: "https://cdn.example/a.mp3", error: null });
    await firstPromise;
    expect(getMusicPreviewState().playingId).toBe("t2");
  });

  it("stops audio on unmount cleanup", async () => {
    musicApi.apiMusicTrackPreview.mockResolvedValue({ url: "https://cdn.example/p.mp3", error: null });
    await toggleMusicPreview(track);
    stopMusicPreview();
    expect(getMusicPreviewState().playingId).toBeNull();
    expect(getMusicPreviewState().loadingId).toBeNull();
  });
});
