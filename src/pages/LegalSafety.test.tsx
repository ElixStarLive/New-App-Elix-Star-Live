import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_SAFETY_CONTACT,
  LEGAL_SAFETY_INTRO,
  LEGAL_SAFETY_SECTIONS,
  LEGAL_SAFETY_SECTION_TITLES,
  LEGAL_SAFETY_TITLE,
} from "@/content/legalSafety";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalSafety from "./LegalSafety";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/safety") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal/safety" element={<LegalSafety />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/safety" element={<LocationProbe />} />
          <Route path="/report" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
          <Route path="/legal/supplier" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-065 Legal Safety", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Safety Centre sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_SAFETY_TITLE);
    expect(container.textContent).toContain(LEGAL_SAFETY_INTRO);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_SAFETY_SECTION_TITLES]);
    expect(headings).toHaveLength(7);
    for (const section of LEGAL_SAFETY_SECTIONS) {
      if (section.paragraph) expect(container.textContent).toContain(section.paragraph);
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(bullet.text);
        if (bullet.emphasis) expect(container.textContent).toContain(bullet.emphasis);
      }
    }
    expect(container.textContent).toContain(LEGAL_SAFETY_CONTACT);
    expect(container.textContent).toContain("Settings → Blocked Accounts");
    expect(container.textContent).toContain("116 123");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("child-safety.html");
    expect(container.textContent).not.toContain("Your report was submitted");
    expect(container.textContent).not.toContain("safety-center-page");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/settings/safety"]')).toBeNull();
    expect(container.querySelector('a[href="/report"]')).toBeNull();
    expect(container.querySelector('a[href="/guidelines"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/ugc"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/supplier"]')).toBeNull();
    expect(container.querySelector("button[type='button']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and to Legal Hub when returnTo is set", () => {
    const cold = renderPage("/legal/safety");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(container.textContent).not.toContain("LOC /settings/safety");
    expect(namedHardwareBackTarget("/legal/safety")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/safety", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/safety", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/settings/safety")).toBe("/settings");
  });
});
