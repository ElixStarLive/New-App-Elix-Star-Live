import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Hashtag from "./Hashtag";

const feedApi = vi.hoisted(() => ({
  apiFetchHashtag: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

import { showToast } from "@/lib/toast";

function Harness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/hashtag/live")}>
        go-live
      </button>
      <Routes>
        <Route path="/hashtag/:tag" element={<Hashtag />} />
        <Route path="/discover" element={<div>DISCOVER PAGE</div>} />
        <Route path="/feed" element={<div>FEED PAGE</div>} />
        <Route path="/video/:videoId" element={<div>VIDEO PAGE</div>} />
      </Routes>
    </>
  );
}

function renderHashtag(entry: string | { pathname: string; state?: unknown }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Harness />
      </MemoryRouter>,
    );
  });
  return { root, container };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PAGE-013 Hashtag", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    feedApi.apiFetchHashtag.mockReset();
    feedApi.apiFetchHashtag.mockResolvedValue({
      tag: "music",
      useCount: 2,
      videos: [{ id: "vid-1", thumbnailUrl: "https://cdn.example/t.jpg", viewCount: 12 }],
      error: null,
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => root!.unmount());
      container.remove();
    }
    root = null;
    container = null;
  });

  it("shows OLD chrome, count, and 3-column grid without a snap player", async () => {
    const mounted = renderHashtag("/hashtag/Music");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("#music");
    expect(container.textContent).toContain("2 videos");
    expect(container.textContent).toContain("12 views");
    expect(container.querySelector("h1")?.textContent).toBe("#music");
    expect(container.querySelectorAll("article").length).toBe(0);
    expect(feedApi.apiFetchHashtag).toHaveBeenCalledWith("music");
  });

  it("normalizes a leading hash in the route", async () => {
    const mounted = renderHashtag("/hashtag/%23Dance");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchHashtag).toHaveBeenCalledWith("dance");
    expect(container.querySelector("h1")?.textContent).toBe("#dance");
  });

  it("shows the OLD empty copy for a valid tag with zero videos", async () => {
    feedApi.apiFetchHashtag.mockResolvedValue({ tag: "none", useCount: 0, videos: [], error: null });
    const mounted = renderHashtag("/hashtag/none");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No videos found for this hashtag");
    expect(container.textContent).not.toContain("Nothing here yet");
  });

  it("keeps prior videos and toasts when a later tag request fails", async () => {
    const mounted = renderHashtag("/hashtag/music");
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("12 views");
    feedApi.apiFetchHashtag.mockResolvedValue({ tag: "live", useCount: 0, videos: [], error: "HASHTAG_DOWN" });
    const goLive = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "go-live");
    await act(async () => {
      goLive?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalledWith("Failed to load hashtag videos");
    expect(container.textContent).toContain("12 views");
    expect(container.textContent).not.toContain("No videos found for this hashtag");
  });

  it("drops a stale slower tag response", async () => {
    let finishMusic: ((value: { tag: string; useCount: number; videos: Array<{ id: string; thumbnailUrl: string | null; viewCount: number }>; error: null }) => void) | undefined;
    feedApi.apiFetchHashtag.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishMusic = resolve;
        }),
    );
    feedApi.apiFetchHashtag.mockResolvedValue({
      tag: "live",
      useCount: 1,
      videos: [{ id: "live-1", thumbnailUrl: null, viewCount: 3 }],
      error: null,
    });
    const mounted = renderHashtag("/hashtag/music");
    root = mounted.root;
    container = mounted.container;
    await flush();
    const goLive = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "go-live");
    await act(async () => {
      goLive?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      finishMusic?.({
        tag: "music",
        useCount: 9,
        videos: [{ id: "music-old", thumbnailUrl: null, viewCount: 99 }],
        error: null,
      });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("#live");
    expect(container.textContent).not.toContain("99 views");
  });

  it("hands a video to /video/:id and returns to Discover", async () => {
    const mounted = renderHashtag({ pathname: "/hashtag/music", state: { returnTo: "/discover" } });
    root = mounted.root;
    container = mounted.container;
    await flush();
    const card = container.querySelector("button.relative") as HTMLButtonElement;
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("VIDEO PAGE");
  });

  it("closes to Discover", async () => {
    const mounted = renderHashtag("/hashtag/music");
    root = mounted.root;
    container = mounted.container;
    await flush();
    const back = container.querySelector('button[title="Back to For You"]') as HTMLButtonElement;
    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("DISCOVER PAGE");
  });
});
