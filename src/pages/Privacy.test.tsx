import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_PRIVACY_SECTION_TITLES,
  LEGAL_PRIVACY_SETTINGS_LABEL,
  LEGAL_PRIVACY_TITLE,
  LEGAL_PRIVACY_UPDATED_LABEL,
} from "@/content/legalPrivacy";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Privacy from "./Privacy";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/privacy") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/terms" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-058 Privacy", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Privacy sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_PRIVACY_TITLE);
    expect(container.textContent).toContain(LEGAL_PRIVACY_UPDATED_LABEL);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_PRIVACY_SECTION_TITLES]);
    expect(headings).toHaveLength(14);
    expect(container.textContent).toContain("Account Information");
    expect(container.textContent).toContain("children under 13");
    expect(container.textContent).toContain("within 30 days");
    expect(container.textContent).toContain("up to 7 years");
    expect(container.textContent).toContain("Information Commissioner's Office (ICO)");
    expect(container.textContent).toContain("info@elixstarlive.co.uk");
    expect(container.textContent).toContain("Settings → Delete Account");
    expect(container.textContent).toContain("Apple In-App Purchase, Google Play Billing, or Stripe");
    expect(container.textContent).not.toContain("privacy.html");
    expect(container.textContent).not.toContain("I Agree");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/copyright"]')).toBeNull();
  });

  it("closes to Settings on a cold deep link and honors returnTo", () => {
    const cold = renderPage("/privacy");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/privacy")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromTerms = renderPage({ pathname: "/privacy", state: { returnTo: "/terms" } });
    root = fromTerms.root;
    container = fromTerms.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /terms");
    expect(namedHardwareBackTarget("/privacy", { returnTo: "/terms" })).toBe("/terms");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromLegal = renderPage({ pathname: "/privacy", state: { returnTo: "/legal" } });
    root = fromLegal.root;
    container = fromLegal.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/privacy", { returnTo: "/legal" })).toBe("/legal");
  });

  it("opens Settings from the in-document control without inventing a Terms route", () => {
    const view = renderPage({ pathname: "/privacy", state: { returnTo: "/register" } });
    root = view.root;
    container = view.container;
    act(() => {
      const button = Array.from(container!.querySelectorAll("button")).find(
        (node) => node.textContent === LEGAL_PRIVACY_SETTINGS_LABEL,
      );
      button?.click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(container.textContent).toContain('STATE {"returnTo":"/register"}');
  });
});
