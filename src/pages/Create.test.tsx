import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraSessionState } from "@/features/camera/createCameraSession";

const camera = vi.hoisted(() => {
  const state: CameraSessionState = {
    facing: "user",
    recording: false,
    attaching: false,
    error: null,
    errorKind: null,
    flashOn: false,
    zoom: 1,
    elapsedMs: 0,
    countdown: null,
    timerSeconds: 0,
    duration: "60s",
    clip: null,
    micDenied: false,
    micDeniedMessage: null,
  };
  const session = {
    open: vi.fn(async () => undefined),
    flip: vi.fn(async () => undefined),
    shutter: vi.fn(),
    stopRecording: vi.fn(async () => undefined),
    retake: vi.fn(),
    acceptGalleryFile: vi.fn(),
    applyZoom: vi.fn(async () => undefined),
    toggleFlash: vi.fn(async () => false),
    setDuration: vi.fn(),
    cycleTimer: vi.fn(),
    cancelCountdown: vi.fn(),
    markHandedOff: vi.fn(() => state.clip),
    onBackground: vi.fn(),
    release: vi.fn(),
    retry: vi.fn(async () => undefined),
    getState: () => state,
    subscribe: () => () => undefined,
  };
  return { state, session };
});

vi.mock("@/features/camera/useCreateCameraSession", () => ({
  useCreateCameraSession: () => ({ state: camera.state, session: camera.session }),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

vi.mock("@/features/camera/capturedMediaCache", () => ({
  setCapturedCreateMedia: vi.fn(),
}));

import Create from "./Create";
import { setCapturedCreateMedia } from "@/features/camera/capturedMediaCache";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search}`}</div>;
}

function renderCreate(entry = "/create") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/create" element={<Create />} />
          <Route path="/upload" element={<div>UPLOAD PAGE</div>} />
          <Route path="/music" element={<div>MUSIC PAGE</div>} />
          <Route path="/live/broadcast" element={<div>LIVE HOST PAGE</div>} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-021 Create camera page", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    camera.state.clip = null;
    camera.state.recording = false;
    camera.state.error = null;
    camera.state.errorKind = null;
    camera.session.markHandedOff.mockImplementation(() => camera.state.clip);
    camera.session.release.mockClear();
    camera.session.shutter.mockClear();
    vi.mocked(setCapturedCreateMedia).mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("opens the Create camera chrome, not upload", () => {
    const mounted = renderCreate();
    root = mounted.root;
    container = mounted.container;
    expect(container.querySelector('[data-elix-page="create"]')).toBeTruthy();
    expect(container.textContent).toContain("Add sound");
    expect(container.textContent).toContain("CREATE");
    expect(container.textContent).not.toContain("UPLOAD PAGE");
  });

  it("POST tab hands off to PAGE-022 Upload", () => {
    const mounted = renderCreate();
    root = mounted.root;
    container = mounted.container;
    const post = Array.from(container.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "POST") as HTMLButtonElement;
    act(() => {
      post.click();
    });
    expect(container.textContent).toContain("UPLOAD PAGE");
  });

  it("Add sound opens PAGE-016 pick, and a canonical soundId is shown on return", () => {
    const mounted = renderCreate("/create?soundId=epidemic-1");
    root = mounted.root;
    container = mounted.container;
    expect(container.textContent).toContain("Sound");
    const add = Array.from(container.querySelectorAll("button")).find((el) =>
      (el.getAttribute("title") || "").includes("Add sound"),
    ) as HTMLButtonElement;
    act(() => {
      add.click();
    });
    expect(container.textContent).toContain("MUSIC PAGE");
  });

  it("LIVE shutter releases the camera and goes to PAGE-018", () => {
    const mounted = renderCreate();
    root = mounted.root;
    container = mounted.container;
    const live = Array.from(container.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "LIVE") as HTMLButtonElement;
    act(() => {
      live.click();
    });
    const shutter = container.querySelector('button[title="Start recording"]') as HTMLButtonElement;
    act(() => {
      shutter.click();
    });
    expect(camera.session.release).toHaveBeenCalled();
    expect(container.textContent).toContain("LIVE HOST PAGE");
  });

  it("Next/Post after capture stores the blob cache for PAGE-022", () => {
    camera.state.clip = {
      blob: new Blob(["clip"], { type: "video/webm" }),
      objectUrl: "blob:test",
      mimeType: "video/webm",
      kind: "video",
      durationMs: 1500,
      width: 720,
      height: 1280,
      orientation: "portrait",
      facing: "user",
      soundId: null,
      source: "camera",
    };
    const mounted = renderCreate("/create?soundId=epidemic-1");
    root = mounted.root;
    container = mounted.container;
    const postClip = Array.from(container.querySelectorAll("button")).find((el) =>
      (el.getAttribute("title") || "") === "Post",
    ) as HTMLButtonElement;
    act(() => {
      postClip.click();
    });
    expect(setCapturedCreateMedia).toHaveBeenCalledWith(expect.objectContaining({ soundId: "epidemic-1", mimeType: "video/webm" }));
    expect(container.textContent).toContain("UPLOAD PAGE");
  });

  it("close before recording returns to For You", () => {
    const mounted = renderCreate();
    root = mounted.root;
    container = mounted.container;
    const close = container.querySelector('button[title="Close"]') as HTMLButtonElement;
    act(() => {
      close.click();
    });
    expect(container.textContent).toContain("FEED PAGE");
  });
});
