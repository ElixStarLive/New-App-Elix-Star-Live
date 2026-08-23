import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MusicFeed from "./MusicFeed";

const musicApi = vi.hoisted(() => ({
  apiFetchMusicPlaylists: vi.fn(),
  apiSearchMusicTracks: vi.fn(),
  apiMusicTrackPreview: vi.fn(),
}));

const preview = vi.hoisted(() => {
  const previewState = { playingId: null as string | null, loadingId: null as string | null };
  return {
    subscribeMusicPreview: (listener: () => void) => {
      void listener;
      return () => undefined;
    },
    getMusicPreviewState: () => previewState,
    attachMusicPreviewLifecycle: () => () => undefined,
    stopMusicPreview: vi.fn(),
    toggleMusicPreview: vi.fn(async () => ({ error: null })),
  };
});

vi.mock("@/features/music/musicApi", () => musicApi);
vi.mock("@/features/music/previewPlayer", () => preview);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

import { showToast } from "@/lib/toast";

function CreateFromMusic() {
  const [params] = useSearchParams();
  return <div>{`CREATE PAGE ${params.get("soundId") || ""}`}</div>;
}

const track = {
  id: "epidemic-1",
  title: "Night Drive",
  artist: "ES Artist",
  duration: "0:45",
  coverUrl: null,
  clipStartSeconds: 0,
  clipEndSeconds: 45,
};

function renderMusic(entry: string | { pathname: string; state?: unknown } = "/music") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/music" element={<MusicFeed />} />
          <Route path="/music/:songId" element={<MusicFeed />} />
          <Route path="/search" element={<div>SEARCH PAGE</div>} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
          <Route path="/create" element={<CreateFromMusic />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PAGE-016 Music / Sound", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    musicApi.apiFetchMusicPlaylists.mockReset();
    musicApi.apiSearchMusicTracks.mockReset();
    musicApi.apiSearchMusicTracks.mockResolvedValue({ tracks: [], error: null });
    preview.stopMusicPreview.mockReset();
    preview.toggleMusicPreview.mockReset();
    preview.toggleMusicPreview.mockResolvedValue({ error: null });
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the Sound library from playlists, not a video snap feed", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(musicApi.apiFetchMusicPlaylists).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sound");
    expect(container.textContent).toContain("Night Drive");
    expect(container.textContent).toContain("ES Artist");
    expect(container.textContent).not.toContain("No music videos yet");
  });

  it("shows licensed-unavailable copy when Epidemic is not configured", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({ playlists: [], configured: false, error: null });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Licensed playlists unavailable");
  });

  it("shows no-tracks copy for a configured empty catalog", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({ playlists: [], configured: true, error: null });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No tracks found");
  });

  it("highlights /music/:songId without fetching a videos-by-sound feed", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic("/music/epidemic-1");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.querySelector(".bg-white\\/5, [class*='bg-white/5']")).toBeTruthy();
    expect(musicApi.apiSearchMusicTracks).not.toHaveBeenCalled();
  });

  it("keeps the library visible for an unknown songId instead of a not-found dead end", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic("/music/missing-id");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Night Drive");
    expect(container.textContent).not.toContain("not found");
  });

  it("opens a track on /music/:id from the catalog row", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const row = Array.from(container.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Night Drive"),
    ) as HTMLButtonElement;
    await act(async () => {
      row.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[class*='bg-white/5']")).toBeTruthy();
  });

  it("plays preview from the disc, not a second player", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const play = container.querySelector('button[aria-label="Play"]') as HTMLButtonElement;
    await act(async () => {
      play.click();
      await Promise.resolve();
    });
    expect(preview.toggleMusicPreview).toHaveBeenCalledTimes(1);
    expect(preview.toggleMusicPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "epidemic-1" }));
  });

  it("stops preview on back and returns to For You", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
      await Promise.resolve();
    });
    expect(preview.stopMusicPreview).toHaveBeenCalled();
    expect(container.textContent).toContain("FEED PAGE");
  });

  it("sends header search to PAGE-012 Search with returnTo Music", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic("/music/epidemic-1");
    root = mounted.root;
    container = mounted.container;
    await flush();
    const search = container.querySelector('button[aria-label="Search"]') as HTMLButtonElement;
    await act(async () => {
      search.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("SEARCH PAGE");
  });

  it("does not fall back to a generic catalog scan when playlists fail", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [],
      configured: false,
      error: "Music playlists are unavailable",
      status: 502,
    });
    const mounted = renderMusic();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(musicApi.apiSearchMusicTracks).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });

  it("returns a canonical soundId to PAGE-021 from Use this sound", async () => {
    musicApi.apiFetchMusicPlaylists.mockResolvedValue({
      playlists: [{ id: "pl-1", name: "For You", coverUrl: null, tracks: [track] }],
      configured: true,
      error: null,
    });
    const mounted = renderMusic({ pathname: "/music", state: { returnTo: "/create", pickSound: true } });
    root = mounted.root;
    container = mounted.container;
    await flush();
    const useSound = Array.from(container.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Use this sound"),
    ) as HTMLButtonElement;
    expect(useSound).toBeTruthy();
    await act(async () => {
      useSound.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("CREATE PAGE epidemic-1");
    expect(preview.stopMusicPreview).toHaveBeenCalled();
  });
});
