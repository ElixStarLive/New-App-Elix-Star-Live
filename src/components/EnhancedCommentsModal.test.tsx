import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import EnhancedCommentsModal from "./EnhancedCommentsModal";

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string; username: string } }) => unknown) => {
    const state = { user: { id: "11111111-1111-1111-1111-111111111111", username: "me" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiFetchVideoComments: vi.fn(async () => ({ comments: [], error: null })),
  apiPostVideoComment: vi.fn(),
  apiTrackInteraction: vi.fn(),
}));

describe("PAGE-007 comments handoff header", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it("keeps Newest | Comments | Oldest + Most Liked", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    container = el;
    const mounted = createRoot(el);
    root = mounted;
    act(() => {
      mounted.render(
        <EnhancedCommentsModal isOpen onClose={() => undefined} videoId="22222222-2222-4222-8222-222222222222" />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const titles = el.querySelectorAll("h2");
    expect(titles[0]?.textContent).toBe("Comments");
    expect(el.textContent).toContain("Newest");
    expect(el.textContent).toContain("Oldest");
    expect(el.textContent).toContain("Most Liked");
    expect(el.querySelector(".w-10.h-1.rounded-full")).toBeTruthy();
    expect(el.querySelector(".elix-glass.bottom-sheet-above-nav")).toBeTruthy();
  });
});
