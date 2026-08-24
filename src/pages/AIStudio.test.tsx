import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } | null }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
    return selector ? selector(state) : state;
  },
}));

import AIStudio from "./AIStudio";
import { showToast } from "@/lib/toast";
import { namedHardwareBackTarget } from "@/lib/settingsNav";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderStudio(entry: string | { pathname: string; state?: { returnTo?: string } } = "/ai-studio") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/ai-studio" element={<AIStudio />} />
          <Route path="/feed" element={<LocationProbe />} />
          <Route path="/profile" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-023 AI Studio page", () => {
  it("renders the AI Studio chrome, empty import state, and named tools", () => {
    const view = renderStudio();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("AI Studio");
    expect(container.textContent).toContain("Import a video to start editing with AI tools");
    expect(container.textContent).toContain("Select Video");
    expect(container.textContent).toContain("Add background");
    expect(container.textContent).toContain("Import");
    expect(container.textContent).toContain("Background");
    expect(container.textContent).toContain("AI Tools");
    expect(container.textContent).toContain("Reset");
    expect(container.textContent).toContain("Export");
  });

  it("opens the tools sheet with OLD tabs and does not call a generation API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const view = renderStudio();
    root = view.root;
    container = view.container;
    const tools = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("AI Tools"));
    expect(tools).toBeTruthy();
    await act(async () => {
      tools?.click();
    });
    expect(container.textContent).toContain("Filters");
    expect(container.textContent).toContain("Enhance");
    expect(container.textContent).toContain("Captions");
    expect(container.textContent).toContain("Thumbnail");
    expect(container.textContent).toContain("Voice FX");
    expect(container.textContent).toContain("Subtitles");
    expect(container.textContent).toMatch(/Background/);
    expect(fetchSpy).not.toHaveBeenCalled();
    const captionsTab = [...container.querySelectorAll("button")].find((b) => b.textContent === "Captions" || b.textContent?.includes("Captions"));
    await act(async () => {
      captionsTab?.click();
    });
    const generate = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Generate AI Captions"));
    await act(async () => {
      generate?.click();
    });
    expect(container.textContent).toContain("AI Suggestions");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("toasts when exporting without a video", async () => {
    const view = renderStudio();
    root = view.root;
    container = view.container;
    const exportBtn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Export"));
    await act(async () => {
      exportBtn?.click();
    });
    expect(showToast).toHaveBeenCalledWith("Load a video first");
  });

  it("closes to For You by named exit", async () => {
    const view = renderStudio();
    root = view.root;
    container = view.container;
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
    });
    expect(container.textContent).toContain("LOC /feed");
  });

  it("honors returnTo on close", async () => {
    const view = renderStudio({ pathname: "/ai-studio", state: { returnTo: "/profile" } });
    root = view.root;
    container = view.container;
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.click();
    });
    expect(container.textContent).toContain("LOC /profile");
  });

  it("names hardware back to For You", () => {
    expect(namedHardwareBackTarget("/ai-studio")).toBe("/feed");
    expect(namedHardwareBackTarget("/ai-studio", { returnTo: "/profile" })).toBe("/profile");
  });
});
