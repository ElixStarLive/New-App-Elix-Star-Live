import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_AFFILIATE_CONTACT,
  LEGAL_AFFILIATE_SECTIONS,
  LEGAL_AFFILIATE_SECTION_TITLES,
  LEGAL_AFFILIATE_TITLE,
} from "@/content/legalAffiliate";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalAffiliate from "./LegalAffiliate";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/affiliate") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal/affiliate" element={<LegalAffiliate />} />
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

describe("PAGE-063 Legal Affiliate", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Affiliate sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_AFFILIATE_TITLE);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_AFFILIATE_SECTION_TITLES]);
    expect(headings).toHaveLength(4);
    for (const section of LEGAL_AFFILIATE_SECTIONS) {
      expect(container.textContent).toContain(section.paragraph);
      for (const bullet of section.bullets ?? []) {
        expect(container.textContent).toContain(bullet);
      }
    }
    expect(container.textContent).toContain(LEGAL_AFFILIATE_CONTACT);
    expect(container.textContent).toContain("Advertising Standards Authority");
    expect(container.textContent).toContain("Federal Trade Commission");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Your referral code");
    expect(container.textContent).not.toContain("commission rate");
    expect(container.textContent).not.toContain("payout threshold");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/dmca"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector("button[type='button']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and to Legal Hub when returnTo is set", () => {
    const cold = renderPage("/legal/affiliate");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal/affiliate")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/affiliate", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/affiliate", { returnTo: "/legal" })).toBe("/legal");
  });
});
