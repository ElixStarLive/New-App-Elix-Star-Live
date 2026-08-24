import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_HUB_DMCA_CONTACT,
  LEGAL_HUB_LABELS,
  LEGAL_HUB_PATHS,
  LEGAL_HUB_SUPPORT_CONTACT,
  LEGAL_HUB_TITLE,
} from "@/content/legalHub";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Legal from "./Legal";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal" element={<Legal />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/support" element={<LocationProbe />} />
          <Route path="/terms" element={<LocationProbe />} />
          <Route path="/privacy" element={<LocationProbe />} />
          <Route path="/copyright" element={<LocationProbe />} />
          <Route path="/legal/audio" element={<LocationProbe />} />
          <Route path="/legal/ugc" element={<LocationProbe />} />
          <Route path="/legal/affiliate" element={<LocationProbe />} />
          <Route path="/legal/supplier" element={<LocationProbe />} />
          <Route path="/legal/dmca" element={<LocationProbe />} />
          <Route path="/legal/safety" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
          <Route path="/how-it-works" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function rowButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => button.getAttribute("aria-label") !== "Close",
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-060 Legal Hub", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Legal Hub rows, contacts, and no child-document body", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_HUB_TITLE);
    expect(LEGAL_HUB_LABELS).toHaveLength(9);
    expect(LEGAL_HUB_PATHS).toEqual([
      "/terms",
      "/privacy",
      "/copyright",
      "/legal/audio",
      "/legal/ugc",
      "/legal/affiliate",
      "/legal/supplier",
      "/legal/dmca",
      "/legal/safety",
    ]);
    expect(rowButtons(container).map((button) => button.textContent)).toEqual([...LEGAL_HUB_LABELS]);
    expect(container.textContent).toContain(LEGAL_HUB_DMCA_CONTACT);
    expect(container.textContent).toContain(LEGAL_HUB_SUPPORT_CONTACT);
    expect(container.textContent).not.toContain("How the app works");
    expect(container.textContent).not.toContain("Community Guidelines");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Failed to load legal menu");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/guidelines"]')).toBeNull();
    expect(container.querySelector('a[href="/how-it-works"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("closes to Settings on a cold deep link and honors returnTo", () => {
    const cold = renderPage("/legal");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSupport = renderPage({ pathname: "/legal", state: { returnTo: "/support" } });
    root = fromSupport.root;
    container = fromSupport.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /support");
    expect(namedHardwareBackTarget("/legal", { returnTo: "/support" })).toBe("/support");
  });

  it.each([
    ["Terms & Conditions", "/terms"],
    ["Privacy Policy", "/privacy"],
    ["Copyright Notice", "/copyright"],
    ["Audio & Music Disclaimer", "/legal/audio"],
    ["UGC Disclaimer", "/legal/ugc"],
    ["Affiliate / Sponsored Disclosure", "/legal/affiliate"],
    ["Supplier Agreement", "/legal/supplier"],
    ["DMCA / Copyright Report", "/legal/dmca"],
    ["Safety", "/legal/safety"],
  ] as const)("hands %s to %s with Legal Hub returnTo", (label, path) => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    act(() => {
      const row = rowButtons(container!).find((button) => button.textContent === label);
      row?.click();
    });
    expect(container.textContent).toContain(`LOC ${path}`);
    expect(container.textContent).toContain('STATE {"returnTo":"/legal"}');
  });
});
