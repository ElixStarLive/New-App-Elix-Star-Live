import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOW_IT_WORKS_ENGAGEMENT_LABEL,
  HOW_IT_WORKS_GUIDELINES_LABEL,
  HOW_IT_WORKS_INTRO,
  HOW_IT_WORKS_SECTIONS,
  HOW_IT_WORKS_SECTION_TITLES,
  HOW_IT_WORKS_SUPPORT_LABEL,
  HOW_IT_WORKS_TITLE,
  HOW_IT_WORKS_UPDATED,
  howItWorksBulletText,
  howItWorksParagraphText,
} from "@/content/howItWorks";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import HowItWorks from "./HowItWorks";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/how-it-works") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/engagement" element={<LocationProbe />} />
          <Route path="/support" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
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

describe("PAGE-068 How It Works", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen How the app works sections in order with exact markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(HOW_IT_WORKS_TITLE);
    expect(container.textContent).toContain(HOW_IT_WORKS_UPDATED);
    expect(container.textContent).toContain(HOW_IT_WORKS_INTRO);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...HOW_IT_WORKS_SECTION_TITLES]);
    expect(headings).toHaveLength(11);
    for (const section of HOW_IT_WORKS_SECTIONS) {
      for (const paragraph of section.paragraphs ?? []) {
        expect(container.textContent).toContain(howItWorksParagraphText(paragraph));
      }
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(howItWorksBulletText(bullet));
      }
      if (section.footer) expect(container.textContent).toContain(section.footer);
    }
    expect(container.textContent).toContain("£0 creator payout");
    expect(container.textContent).toContain("£1,000");
    expect(container.textContent).toContain("Google Play / Apple");
    expect(container.textContent).toContain("Stripe");
    expect(container.textContent).toContain("Test coins");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Step completed");
    expect(container.textContent).not.toContain("tutorial progress");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(container.querySelector('a[href="/legal"]')).toBeNull();
    expect(container.querySelector("button[aria-label='Close']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and honors Settings returnTo", () => {
    const cold = renderPage("/how-it-works");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/how-it-works")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSettings = renderPage({ pathname: "/how-it-works", state: { returnTo: "/settings" } });
    root = fromSettings.root;
    container = fromSettings.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/how-it-works", { returnTo: "/settings" })).toBe("/settings");
  });

  it("hands Engagement, Support, and Guidelines with How It Works return on a cold open", () => {
    const view = renderPage("/how-it-works");
    root = view.root;
    container = view.container;
    act(() => {
      labeledButton(container!, HOW_IT_WORKS_ENGAGEMENT_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(container.textContent).toContain('STATE {"returnTo":"/how-it-works"}');

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const supportView = renderPage("/how-it-works");
    root = supportView.root;
    container = supportView.container;
    act(() => {
      labeledButton(container!, HOW_IT_WORKS_SUPPORT_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /support");
    expect(container.textContent).toContain('STATE {"returnTo":"/how-it-works"}');

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const guidelinesView = renderPage("/how-it-works");
    root = guidelinesView.root;
    container = guidelinesView.container;
    act(() => {
      labeledButton(container!, HOW_IT_WORKS_GUIDELINES_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /guidelines");
    expect(container.textContent).toContain('STATE {"returnTo":"/how-it-works"}');
  });

  it("forwards an incoming Settings returnTo when opening child destinations", () => {
    const view = renderPage({ pathname: "/how-it-works", state: { returnTo: "/settings" } });
    root = view.root;
    container = view.container;
    act(() => {
      labeledButton(container!, HOW_IT_WORKS_GUIDELINES_LABEL)?.click();
    });
    expect(container.textContent).toContain("LOC /guidelines");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
  });
});
