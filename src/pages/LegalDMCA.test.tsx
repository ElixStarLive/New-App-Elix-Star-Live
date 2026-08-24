import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_DMCA_CONTACT,
  LEGAL_DMCA_INTRO,
  LEGAL_DMCA_MAILTO_HREF,
  LEGAL_DMCA_MAILTO_LABEL,
  LEGAL_DMCA_SECTIONS,
  LEGAL_DMCA_SECTION_TITLES,
  LEGAL_DMCA_TITLE,
} from "@/content/legalDmca";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalDMCA from "./LegalDMCA";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/dmca") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal/dmca" element={<LegalDMCA />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/copyright" element={<LocationProbe />} />
          <Route path="/legal/ugc" element={<LocationProbe />} />
          <Route path="/legal/safety" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-064 Legal DMCA", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen DMCA sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_DMCA_TITLE);
    expect(container.textContent).toContain(LEGAL_DMCA_INTRO);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_DMCA_SECTION_TITLES]);
    expect(headings).toHaveLength(4);
    for (const section of LEGAL_DMCA_SECTIONS) {
      expect(container.textContent).toContain(section.paragraph);
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(bullet);
      }
    }
    expect(container.textContent).toContain(LEGAL_DMCA_CONTACT);
    expect(container.textContent).toContain("penalty of perjury");
    expect(container.textContent).toContain("repeat copyright infringers");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("DMCA-12345");
    expect(container.textContent).not.toContain("submitted successfully");
    expect(container.textContent).not.toContain("Your copyright claim was submitted");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/safety"]')).toBeNull();
    const mailto = container.querySelector(`a[href="${LEGAL_DMCA_MAILTO_HREF}"]`);
    expect(mailto?.textContent).toBe(LEGAL_DMCA_MAILTO_LABEL);
    expect(container.querySelector("button[type='button']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and honors returnTo from Hub, Copyright, and UGC", () => {
    const cold = renderPage("/legal/dmca");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal/dmca")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/dmca", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/legal" })).toBe("/legal");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromCopyright = renderPage({ pathname: "/legal/dmca", state: { returnTo: "/copyright" } });
    root = fromCopyright.root;
    container = fromCopyright.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /copyright");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/copyright" })).toBe("/copyright");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromUgc = renderPage({ pathname: "/legal/dmca", state: { returnTo: "/legal/ugc" } });
    root = fromUgc.root;
    container = fromUgc.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal/ugc");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/legal/ugc" })).toBe("/legal/ugc");
  });
});
