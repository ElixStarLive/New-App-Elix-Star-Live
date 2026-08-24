import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEGAL_SUPPLIER_BUSINESS,
  LEGAL_SUPPLIER_COMPANY,
  LEGAL_SUPPLIER_SECTIONS,
  LEGAL_SUPPLIER_SECTION_TITLES,
  LEGAL_SUPPLIER_SUPPORT,
  LEGAL_SUPPLIER_TITLE,
  LEGAL_SUPPLIER_UPDATED,
} from "@/content/legalSupplier";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import LegalSupplier from "./LegalSupplier";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/legal/supplier") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/legal/supplier" element={<LegalSupplier />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/terms" element={<LocationProbe />} />
          <Route path="/privacy" element={<LocationProbe />} />
          <Route path="/legal/affiliate" element={<LocationProbe />} />
          <Route path="/support" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-066 Legal Supplier", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Supplier sections in order with exact legal markers", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(LEGAL_SUPPLIER_TITLE);
    expect(container.textContent).toContain(LEGAL_SUPPLIER_UPDATED);
    const headings = Array.from(container.querySelectorAll("h2")).map((node) => node.textContent);
    expect(headings).toEqual([...LEGAL_SUPPLIER_SECTION_TITLES]);
    expect(headings).toHaveLength(11);
    for (const section of LEGAL_SUPPLIER_SECTIONS) {
      for (const paragraph of section.paragraphs ?? []) {
        expect(container.textContent).toContain(paragraph.text);
      }
      for (const bullet of section.bullets ?? []) {
        if (bullet.text) expect(container.textContent).toContain(bullet.text);
        if (bullet.label) expect(container.textContent).toContain(bullet.label);
        if (bullet.value) expect(container.textContent).toContain(bullet.value);
      }
      if (section.footer) expect(container.textContent).toContain(section.footer);
    }
    expect(container.textContent).toContain(LEGAL_SUPPLIER_COMPANY);
    expect(container.textContent).toContain(LEGAL_SUPPLIER_BUSINESS);
    expect(container.textContent).toContain(LEGAL_SUPPLIER_SUPPORT);
    expect(container.textContent).toContain("Net 30");
    expect(container.textContent).toContain("VAT");
    expect(container.textContent).toContain("England and Wales");
    expect(container.textContent).toContain("buy-only for end users");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("supplier-agreement.html");
    expect(container.textContent).not.toContain("Your contract was accepted");
    expect(container.textContent).not.toContain("Invoice paid");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
    expect(container.querySelector('a[href="/legal/affiliate"]')).toBeNull();
    expect(container.querySelector('a[href="/support"]')).toBeNull();
    expect(container.querySelector('a[href="/guidelines"]')).toBeNull();
    expect(container.querySelector("button[type='button']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("closes to Settings on a cold deep link and to Legal Hub when returnTo is set", () => {
    const cold = renderPage("/legal/supplier");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/legal/supplier")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHub = renderPage({ pathname: "/legal/supplier", state: { returnTo: "/legal" } });
    root = fromHub.root;
    container = fromHub.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /legal");
    expect(namedHardwareBackTarget("/legal/supplier", { returnTo: "/legal" })).toBe("/legal");
  });
});
