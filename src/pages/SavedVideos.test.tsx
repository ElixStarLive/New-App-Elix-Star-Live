import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavedVideos from "./SavedVideos";

const feedApi = vi.hoisted(() => ({
  apiFetchSavedVideos: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
    return selector ? selector(state) : state;
  },
}));

import { showToast } from "@/lib/toast";

const hit = {
  id: "11111111-1111-4111-8111-111111111111",
  thumbnailUrl: "https://cdn.example/t.jpg",
  viewCount: 1500,
  mediaUrl: "https://cdn.example/v.mp4",
  userId: "22222222-2222-4222-8222-222222222222",
  username: "creator",
  displayName: "Creator",
};

function renderSaved(entry: string | { pathname: string; state?: unknown } = "/saved") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/saved" element={<SavedVideos />} />
          <Route path="/settings" element={<div>SETTINGS PAGE</div>} />
          <Route path="/video/:videoId" element={<div>VIDEO PAGE</div>} />
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

describe("PAGE-015 Saved Videos", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    feedApi.apiFetchSavedVideos.mockReset();
    vi.mocked(showToast).mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the 3-column grid and view counts", async () => {
    feedApi.apiFetchSavedVideos.mockResolvedValue({ videos: [hit], hasMore: false, error: null });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchSavedVideos).toHaveBeenCalledWith(50, 0);
    expect(container.textContent).toContain("Saved Videos");
    expect(container.textContent).toContain("1.5K");
    expect(container.querySelector(".grid.grid-cols-3")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(hit.thumbnailUrl);
  });

  it("shows the empty copy when the viewer has no saves", async () => {
    feedApi.apiFetchSavedVideos.mockResolvedValue({ videos: [], hasMore: false, error: null });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No saved videos yet. Tap the bookmark icon on any video to save it.");
  });

  it("keeps a failed first load distinct from empty", async () => {
    feedApi.apiFetchSavedVideos.mockResolvedValue({
      videos: [],
      hasMore: false,
      error: "Failed to load saved videos",
      status: 500,
    });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Failed to load saved videos");
    expect(container.textContent).not.toContain("No saved videos yet");
    expect(showToast).toHaveBeenCalled();
  });

  it("hands a card to /video/:id and returns to Settings", async () => {
    feedApi.apiFetchSavedVideos.mockResolvedValue({ videos: [hit], hasMore: false, error: null });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const card = container.querySelector("img")?.closest("button") as HTMLButtonElement;
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("VIDEO PAGE");
  });

  it("closes to Settings", async () => {
    feedApi.apiFetchSavedVideos.mockResolvedValue({ videos: [], hasMore: false, error: null });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("SETTINGS PAGE");
  });

  it("requests the next offset on Load more", async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...hit, id: `id-${i}` }));
    feedApi.apiFetchSavedVideos
      .mockResolvedValueOnce({ videos: page, hasMore: true, error: null })
      .mockResolvedValueOnce({ videos: [{ ...hit, id: "id-50" }], hasMore: false, error: null });
    const mounted = renderSaved();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const more = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Load more");
    expect(more).toBeTruthy();
    await act(async () => {
      more?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(feedApi.apiFetchSavedVideos).toHaveBeenLastCalledWith(50, 50);
  });
});
