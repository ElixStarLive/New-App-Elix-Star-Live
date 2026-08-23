import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxActivityItem } from "@shared/contracts";
import { InboxActivityOverlay } from "./InboxActivityOverlay";

const like: InboxActivityItem = {
  id: "like_1",
  kind: "like",
  videoId: "video-1",
  actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  actorUsername: "fan",
  actorDisplayName: "Fan Name",
  actorAvatarUrl: null,
  snippet: null,
  createdAt: "2026-08-21T00:00:00.000Z",
};

function renderOverlay(props: Partial<ComponentProps<typeof InboxActivityOverlay>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const onOpenVideo = vi.fn();
  act(() => {
    root.render(
      <InboxActivityOverlay
        open
        items={[]}
        error={null}
        loading={false}
        onClose={onClose}
        onOpenVideo={onOpenVideo}
        {...props}
      />,
    );
  });
  return { container, root, onClose, onOpenVideo };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-031 Inbox Activity overlay", () => {
  it("does not mount while closed", () => {
    const view = renderOverlay({ open: false });
    root = view.root;
    container = view.container;
    expect(document.body.textContent).not.toContain("Close activity");
    expect(document.body.textContent).not.toContain("No activity yet. When someone likes");
  });

  it("shows empty copy, not a fake stub row", () => {
    const view = renderOverlay();
    root = view.root;
    container = view.container;
    expect(document.body.textContent).toContain("Activity");
    expect(document.body.textContent).toContain(
      "No activity yet. When someone likes, comments on, saves your video, or @mentions you, it will show here.",
    );
    expect(document.body.textContent).not.toContain("@user");
  });

  it("keeps API failure separate from empty", () => {
    const view = renderOverlay({ error: "offline", items: [] });
    root = view.root;
    container = view.container;
    expect(document.body.textContent).toContain("offline");
    expect(document.body.textContent).not.toContain("No activity yet. When someone likes");
  });

  it("does not treat initial loading as empty success", () => {
    const view = renderOverlay({ loading: true, items: [] });
    root = view.root;
    container = view.container;
    expect(document.body.textContent).toContain("Activity");
    expect(document.body.textContent).not.toContain("No activity yet. When someone likes");
    expect(document.body.querySelector(".elix-loader")).toBeTruthy();
  });

  it("lists the real actor and opens the video target", () => {
    const view = renderOverlay({ items: [like] });
    root = view.root;
    container = view.container;
    expect(document.body.textContent).toContain("Fan Name");
    expect(document.body.textContent).toContain("Liked your video");
    expect(document.body.textContent).toContain("Tap to view");
    const row = [...document.body.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Fan Name"));
    expect(row).toBeTruthy();
    act(() => {
      row?.click();
    });
    expect(view.onOpenVideo).toHaveBeenCalledWith("video-1");
  });

  it("closes back to Inbox without navigating away", () => {
    const view = renderOverlay({ items: [like] });
    root = view.root;
    container = view.container;
    const close = document.body.querySelector('button[aria-label="Close activity"]');
    expect(close).toBeTruthy();
    act(() => {
      (close as HTMLButtonElement).click();
    });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.onOpenVideo).not.toHaveBeenCalled();
  });
});
