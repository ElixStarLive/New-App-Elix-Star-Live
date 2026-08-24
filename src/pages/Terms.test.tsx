import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_TERMS_COINS_ANDROID_WEB,
  LEGAL_TERMS_COINS_IOS,
  LEGAL_TERMS_SECTION_TITLES,
  LEGAL_TERMS_TITLE,
  LEGAL_TERMS_UPDATED_LABEL,
  legalTermsCoinsPurchaseLine,
  legalTermsSections,
} from "@/content/legalTerms";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Terms from "./Terms";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/terms") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/terms" element={<Terms />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/register" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-057 Terms", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Terms sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_TERMS_TITLE);
    expect(container.textContent).toContain(LEGAL_TERMS_UPDATED_LABEL);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_TERMS_SECTION_TITLES]);
    expect(headings).toHaveLength(27);
    expect(container.textContent).toContain("You must be at least 13 years old.");
    expect(container.textContent).toContain("twelve (12) months");
    expect(container.textContent).toContain("within 14 days");
    expect(container.textContent).toContain("support@elixstarlive.co.uk");
    expect(container.textContent).toContain("info@elixstarlive.co.uk");
    expect(container.textContent).toContain("dmca@elixstarlive.com");
    expect(container.textContent).toContain("England and Wales");
    expect(container.textContent).toContain("Stripe only");
    expect(container.textContent).toContain(LEGAL_TERMS_COINS_ANDROID_WEB);
    expect(container.textContent).not.toContain(LEGAL_TERMS_COINS_IOS);
    expect(container.textContent).not.toContain("terms.html");
    expect(container.textContent).not.toContain("I Agree");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
    expect(container.querySelector('a[href="/copyright"]')).toBeNull();
  });

  it("closes to Settings on a cold deep link and honors returnTo", () => {
    const cold = renderPage("/terms");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/terms")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromLegal = renderPage({ pathname: "/terms", state: { returnTo: "/legal" } });
    root = fromLegal.root;
    container = fromLegal.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/terms", { returnTo: "/legal" })).toBe("/legal");
  });

  it("keeps one content source and the platform coin sentence", () => {
    expect(legalTermsSections(false)).toHaveLength(27);
    expect(legalTermsSections(true)[12]?.title).toBe("13. Virtual Coins / Credits");
    expect(legalTermsCoinsPurchaseLine(true)).toBe(LEGAL_TERMS_COINS_IOS);
    expect(legalTermsCoinsPurchaseLine(false)).toBe(LEGAL_TERMS_COINS_ANDROID_WEB);
  });
});
