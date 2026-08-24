import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_AUDIO_CONTACT,
  LEGAL_AUDIO_SECTIONS,
  LEGAL_AUDIO_SECTION_TITLES,
  LEGAL_AUDIO_TITLE,
} from "@/content/legalAudio";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalAudio from "./LegalAudio";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/audio") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal/audio" element={<LegalAudio />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/legal/ugc" element={<LocationProbe />} />
          <Route path="/legal/dmca" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-061 Legal Audio", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Audio sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_AUDIO_TITLE);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_AUDIO_SECTION_TITLES]);
    expect(headings).toHaveLength(5);
    for (const section of LEGAL_AUDIO_SECTIONS) {
      expect(container.textContent).toContain(section.paragraph);
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(bullet.text);
        if (bullet.emphasis) expect(container.textContent).toContain(bullet.emphasis);
      }
    }
    expect(container.textContent).toContain(LEGAL_AUDIO_CONTACT);
    expect(container.textContent).toContain("DMCA takedown notice");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Your audio rights are verified");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/legal/ugc"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/dmca"]')).toBeNull();
    expect(container.querySelector('a[href="/copyright"]')).toBeNull();
    expect(container.querySelector("button[type='button']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and to Legal Hub when returnTo is set", () => {
    const cold = renderPage("/legal/audio");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal/audio")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/audio", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/audio", { returnTo: "/legal" })).toBe("/legal");
  });
});
