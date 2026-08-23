import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoView from "./VideoView";

const feedApi = vi.hoisted(() => ({
  apiFetchVideoById: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/components/ForYouPlayer", () => ({
  ForYouPlayer: ({ item }: { item: { id: string; username: string } }) => (
    <div>
      PLAYER {item.id} @{item.username}
    </div>
  ),
}));

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "video" as const,
  userId: "22222222-2222-4222-8222-222222222222",
  username: "creator",
  displayName: "Creator",
  avatarUrl: null,
  caption: "hello #car",
  mediaUrl: "https://cdn.example/v.mp4",
  liked: false,
  saved: false,
  isFollowing: false,
};

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/video/:videoId" element={<VideoView />} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
          <Route path="/hashtag/:tag" element={<div>HASHTAG PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-014 Video View", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    feedApi.apiFetchVideoById.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("loads the authoritative video and mounts one player", async () => {
    feedApi.apiFetchVideoById.mockResolvedValue({ video: item, error: null });
    const rendered = renderAt(`/video/${item.id}`);
    root = rendered.root;
    container = rendered.container;
    expect(container.textContent).toContain("Loading…");
    await act(async () => {
      await Promise.resolve();
    });
    expect(feedApi.apiFetchVideoById).toHaveBeenCalledTimes(1);
    expect(feedApi.apiFetchVideoById).toHaveBeenCalledWith(item.id);
    expect(container.textContent).toContain(`PLAYER ${item.id}`);
    expect(container.textContent).toContain("@creator");
    expect(container.querySelectorAll("video")).toHaveLength(0);
  });

  it("shows unavailable copy for unknown videos", async () => {
    feedApi.apiFetchVideoById.mockResolvedValue({ video: null, error: "Video not found", status: 404 });
    const rendered = renderAt(`/video/${item.id}`);
    root = rendered.root;
    container = rendered.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Video not found or unavailable.");
  });

  it("does not label network failure as not found", async () => {
    feedApi.apiFetchVideoById.mockResolvedValue({ video: null, error: "Network", status: 0 });
    const rendered = renderAt(`/video/${item.id}`);
    root = rendered.root;
    container = rendered.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Couldn't load this video.");
    expect(container.textContent).not.toContain("Video not found or unavailable.");
  });

  it("returns to the named source instead of forcing For You", async () => {
    feedApi.apiFetchVideoById.mockResolvedValue({ video: item, error: null });
    const rendered = renderAt({
      pathname: `/video/${item.id}`,
      state: { returnTo: "/hashtag/car" },
    });
    root = rendered.root;
    container = rendered.container;
    await act(async () => {
      await Promise.resolve();
    });
    const close = container.querySelector('button[aria-label="Back"]');
    expect(close).toBeTruthy();
    act(() => {
      (close as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("HASHTAG PAGE");
  });
});
