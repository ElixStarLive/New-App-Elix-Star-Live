import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_COPYRIGHT_CONTACT,
  LEGAL_COPYRIGHT_DMCA_LABEL,
  LEGAL_COPYRIGHT_NOTICE,
  LEGAL_COPYRIGHT_SECTIONS,
  LEGAL_COPYRIGHT_SECTION_TITLES,
  LEGAL_COPYRIGHT_TITLE,
} from "@/content/legalCopyright";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Copyright from "./Copyright";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/copyright") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/copyright" element={<Copyright />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/legal/dmca" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-059 Copyright", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Copyright sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_COPYRIGHT_TITLE);
    expect(container.textContent).toContain(LEGAL_COPYRIGHT_NOTICE);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_COPYRIGHT_SECTION_TITLES]);
    expect(headings).toHaveLength(5);
    for (const section of LEGAL_COPYRIGHT_SECTIONS) {
      expect(container.textContent).toContain(section.paragraph);
      if (section.afterLink) expect(container.textContent).toContain(section.afterLink);
    }
    expect(container.textContent).toContain("Users retain ownership of the content they create and upload");
    expect(container.textContent).toContain("worldwide, non-exclusive, royalty-free licence");
    expect(container.textContent).toContain(LEGAL_COPYRIGHT_CONTACT);
    expect(container.textContent).toContain(LEGAL_COPYRIGHT_DMCA_LABEL);
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Your copyright claim was submitted");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
  });

  it("closes to Settings on a cold deep link and honors returnTo", () => {
    const cold = renderPage("/copyright");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/copyright")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromLegal = renderPage({ pathname: "/copyright", state: { returnTo: "/legal" } });
    root = fromLegal.root;
    container = fromLegal.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/copyright", { returnTo: "/legal" })).toBe("/legal");
  });

  it("hands DMCA to PAGE-064 without building the destination", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    act(() => {
      const link = Array.from(container!.querySelectorAll("button")).find(
        (button) => button.textContent === LEGAL_COPYRIGHT_DMCA_LABEL,
      );
      link?.click();
    });
    expect(container.textContent).toContain("LOC /legal/dmca");
    expect(container.textContent).toContain('STATE {"returnTo":"/copyright"}');
  });
});
