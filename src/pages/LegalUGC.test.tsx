import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_UGC_DMCA_LABEL,
  LEGAL_UGC_SECTIONS,
  LEGAL_UGC_SECTION_TITLES,
  LEGAL_UGC_TITLE,
} from "@/content/legalUgc";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalUGC from "./LegalUGC";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/ugc") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/legal/ugc" element={<LegalUGC />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/legal/dmca" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-062 Legal UGC", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen UGC policy sections in order", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_UGC_TITLE);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_UGC_SECTION_TITLES]);
    expect(headings).toHaveLength(6);
    for (const section of LEGAL_UGC_SECTIONS) {
      for (const paragraph of section.paragraphs) {
        expect(container.textContent).toContain(paragraph);
      }
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(bullet);
      }
    }
    expect(container.textContent).toContain("worldwide, non-exclusive, royalty-free licence");
    expect(container.textContent).toContain("You own or have all necessary rights to the content");
    expect(container.textContent).toContain("in-app reporting tools");
    expect(container.textContent).toContain("safe harbour");
    expect(container.textContent).toContain(LEGAL_UGC_DMCA_LABEL);
    expect(container.textContent).not.toContain("terms.html");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Your content rights are verified");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/guidelines"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/audio"]')).toBeNull();
    expect(container.querySelector('a[href="/copyright"]')).toBeNull();
  });

  it("closes to Settings on a cold deep link and to Legal Hub when returnTo is set", () => {
    const cold = renderPage("/legal/ugc");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal/ugc")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/ugc", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/ugc", { returnTo: "/legal" })).toBe("/legal");
  });

  it("hands DMCA to PAGE-064 without building the destination", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    act(() => {
      const link = Array.from(container!.querySelectorAll("button")).find(
        (button) => button.textContent === LEGAL_UGC_DMCA_LABEL,
      );
      link?.click();
    });
    expect(container.textContent).toContain("LOC /legal/dmca");
    expect(container.textContent).toContain('STATE {"returnTo":"/legal/ugc"}');
  });
});
