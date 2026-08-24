import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  GUIDELINES_INTRO,
  GUIDELINES_REPORT_INTRO,
  GUIDELINES_REPORT_LABEL,
  GUIDELINES_SECTIONS,
  GUIDELINES_SECTION_TITLES,
  GUIDELINES_SETTINGS_LABEL,
  GUIDELINES_TITLE,
  GUIDELINES_UPDATED,
} from "@/content/guidelines";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Guidelines from "./Guidelines";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/guidelines") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/guidelines" element={<Guidelines />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/safety" element={<LocationProbe />} />
          <Route path="/report" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/legal/ugc" element={<LocationProbe />} />
          <Route path="/legal/safety" element={<LocationProbe />} />
          <Route path="/copyright" element={<LocationProbe />} />
          <Route path="/support" element={<LocationProbe />} />
          <Route path="/how-it-works" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function labeledButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === label) as
    | HTMLButtonElement
    | undefined;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-067 Guidelines", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Community Guidelines sections in order with exact markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(GUIDELINES_TITLE);
    expect(container.textContent).toContain(GUIDELINES_UPDATED);
    expect(container.textContent).toContain(GUIDELINES_INTRO);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...GUIDELINES_SECTION_TITLES]);
    expect(headings).toHaveLength(6);
    for (const section of GUIDELINES_SECTIONS) {
      expect(container.textContent).toContain(section.paragraph);
      for (const bullet of section.bullets) {
        expect(container.textContent).toContain(bullet);
      }
    }
    expect(container.textContent).toContain(GUIDELINES_REPORT_INTRO);
    expect(container.textContent).toContain(GUIDELINES_REPORT_LABEL);
    expect(container.textContent).toContain(GUIDELINES_SETTINGS_LABEL);
    expect(container.textContent).toContain("Don't impersonate others");
    expect(container.textContent).toContain("Temporary account suspension");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("How the app works");
    expect(container.textContent).not.toContain("Your report was submitted");
    expect(container.textContent).not.toContain("strike");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(container.querySelector('a[href="/legal"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/ugc"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/safety"]')).toBeNull();
    expect(container.querySelector('a[href="/copyright"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('a[href="/how-it-works"]')).toBeNull();
    expect(container.querySelector("button[aria-label='Close']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and honors returnTo from Settings and Safety Center", () => {
    const cold = renderPage("/guidelines");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/guidelines")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSettings = renderPage({ pathname: "/guidelines", state: { returnTo: "/settings" } });
    root = fromSettings.root;
    container = fromSettings.container;
    act(() => {
      labeledButton(container!, GUIDELINES_SETTINGS_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/guidelines", { returnTo: "/settings" })).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSafety = renderPage({ pathname: "/guidelines", state: { returnTo: "/settings/safety" } });
    root = fromSafety.root;
    container = fromSafety.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings/safety");
    expect(namedHardwareBackTarget("/guidelines", { returnTo: "/settings/safety" })).toBe("/settings/safety");
  });

  it("hands Report a Violation to PAGE-046 with Guidelines return on a cold open", () => {
    const view = renderPage("/guidelines");
    root = view.root;
    container = view.container;
    act(() => {
      labeledButton(container!, GUIDELINES_REPORT_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /report");
    expect(container.textContent).toContain('STATE {"returnTo":"/guidelines"}');
  });

  it("forwards an incoming Settings returnTo when opening Report", () => {
    const view = renderPage({ pathname: "/guidelines", state: { returnTo: "/settings" } });
    root = view.root;
    container = view.container;
    act(() => {
      labeledButton(container!, GUIDELINES_REPORT_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /report");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
  });
});
