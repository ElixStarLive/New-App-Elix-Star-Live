import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMusicTrackSaved, toggleSavedMusicTrack } from "./savedSounds";
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

describe("PAGE-016 saved sounds", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("toggles save and unsave on the same track", () => {
    expect(isMusicTrackSaved("t1")).toBe(false);
    expect(toggleSavedMusicTrack(track)).toBe(true);
    expect(isMusicTrackSaved("t1")).toBe(true);
    expect(toggleSavedMusicTrack(track)).toBe(false);
    expect(isMusicTrackSaved("t1")).toBe(false);
  });

  it("treats corrupt storage as unsaved instead of crashing", () => {
    localStorage.setItem("music_saved_v1", "{not-json");
    expect(isMusicTrackSaved("t1")).toBe(false);
  });
});
