import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadPublishState } from "@/features/upload/uploadSession";

const upload = vi.hoisted(() => {
  const state: UploadPublishState = {
    kind: "video",
    media: {
      blob: new Blob(["clip"], { type: "video/webm" }),
      objectUrl: "blob:test-upload",
      mimeType: "video/webm",
      kind: "video",
      durationMs: 1200,
      width: 720,
      height: 1280,
      orientation: "portrait",
      facing: "user",
      soundId: "sound-1",
      source: "camera",
    },
    caption: "",
    hashtagsText: "",
    soundId: "sound-1",
    mutedPreview: true,
    phase: "idle",
    progress: null,
    error: null,
    publishedId: null,
    processingStatus: null,
  };
  const session = {
    intake: vi.fn(),
    acceptGalleryFile: vi.fn(),
    setCaption: vi.fn((caption: string) => {
      state.caption = caption;
    }),
    setHashtagsText: vi.fn((text: string) => {
      state.hashtagsText = text;
    }),
    setMutedPreview: vi.fn(),
    clearError: vi.fn(),
    post: vi.fn(async () => {
      state.phase = "success";
      state.publishedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      return { ok: true as const, id: state.publishedId, kind: "video" as const };
    }),
    retry: vi.fn(),
    cancelInFlight: vi.fn(),
    discard: vi.fn(),
    dispose: vi.fn(),
    getState: () => state,
    subscribe: () => () => undefined,
  };
  return { state, session };
});

vi.mock("@/features/upload/useUploadSession", () => ({
  useUploadPublishSession: () => ({ state: upload.state, session: upload.session }),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

import Upload from "./Upload";
import { showToast } from "@/lib/toast";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search}`}</div>;
}

function renderUpload(entry = "/upload") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/upload" element={<Upload />} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
          <Route path="/friends" element={<div>FRIENDS PAGE</div>} />
          <Route path="/create" element={<div>CREATE PAGE</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-022 Upload page", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    upload.state.phase = "idle";
    upload.state.publishedId = null;
    upload.state.caption = "";
    upload.state.hashtagsText = "";
    upload.session.post.mockClear();
    upload.session.discard.mockClear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("previews PAGE-021 media and posts once", async () => {
    const mounted = renderUpload();
    root = mounted.root;
    container = mounted.container;
    expect(container.querySelector('[data-elix-page="upload"]')).toBeTruthy();
    expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:test-upload");
    expect(container.textContent).toContain("Sound attached");
    const post = Array.from(container.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "Post") as HTMLButtonElement;
    await act(async () => {
      post.click();
    });
    expect(upload.session.post).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalled();
    expect(container.textContent).toContain("FEED PAGE");
  });

  it("story mode labels Your Story and lands on Friends", async () => {
    const mounted = renderUpload("/upload?type=story");
    root = mounted.root;
    container = mounted.container;
    const post = Array.from(container.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Your Story"),
    ) as HTMLButtonElement;
    await act(async () => {
      post.click();
    });
    expect(container.textContent).toContain("FRIENDS PAGE");
  });
});
