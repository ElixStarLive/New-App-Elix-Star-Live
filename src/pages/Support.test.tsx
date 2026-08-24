import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_LABEL,
  SUPPORT_FAQ_ITEMS,
  SUPPORT_FAQ_LABEL,
  SUPPORT_FAQ_QUESTIONS,
  SUPPORT_LEGAL_LABEL,
  SUPPORT_LEGAL_LINKS,
  SUPPORT_MAILTO,
  SUPPORT_QUICK_LABEL,
  SUPPORT_QUICK_LINKS,
  SUPPORT_TITLE,
} from "@/content/support";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import Support from "./Support";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/support") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter
        initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}
      >
        <Routes>
          <Route path="/support" element={<Support />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/safety" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
          <Route path="/how-it-works" element={<LocationProbe />} />
          <Route path="/terms" element={<LocationProbe />} />
          <Route path="/privacy" element={<LocationProbe />} />
          <Route path="/copyright" element={<LocationProbe />} />
          <Route path="/legal" element={<LocationProbe />} />
          <Route path="/report" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function rowButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => {
    const title = button.querySelector("span.block")?.textContent;
    return title === label || button.textContent === label;
  }) as HTMLButtonElement | undefined;
}

function faqButton(container: HTMLElement, question: string) {
  return [...container.querySelectorAll("button[aria-expanded]")].find((button) => button.textContent === question) as
    | HTMLButtonElement
    | undefined;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-069 Support", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the frozen Help & Support sheet in order", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.querySelector("h1")?.textContent).toBe(SUPPORT_TITLE);
    expect(container.textContent).toContain(SUPPORT_QUICK_LABEL);
    expect(container.textContent).toContain(SUPPORT_FAQ_LABEL);
    expect(container.textContent).toContain(SUPPORT_LEGAL_LABEL);
    expect(container.textContent).toContain(SUPPORT_EMAIL_LABEL);
    expect(container.textContent).toContain(SUPPORT_EMAIL);
    expect(SUPPORT_QUICK_LINKS.map((item) => item.label)).toEqual([
      "Contact Support",
      "Safety Center",
      "Community Guidelines",
    ]);
    expect(SUPPORT_LEGAL_LINKS.map((item) => item.path)).toEqual(["/terms", "/privacy", "/copyright"]);
    expect(Array.from(container.querySelectorAll("button[aria-expanded]")).map((node) => node.textContent)).toEqual([
      ...SUPPORT_FAQ_QUESTIONS,
    ]);
    expect(SUPPORT_FAQ_QUESTIONS).toHaveLength(8);
    for (const item of SUPPORT_FAQ_ITEMS) {
      expect(container.textContent).toContain(item.question);
      expect(container.textContent).not.toContain(item.answer);
    }
    expect(container.textContent).toContain("support@elixstarlive.co.uk");
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).not.toContain("Message Sent");
    expect(container.textContent).not.toContain("Sending...");
    expect(container.textContent).not.toContain("24 hours");
    expect(container.textContent).not.toContain("Chat with us");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('a[href="/help"]')).toBeNull();
    expect(container.querySelector('a[href="/contact"]')).toBeNull();
    expect(container.querySelector('a[href="/legal"]')).toBeNull();
    expect(container.querySelector('a[href="/report"]')).toBeNull();
    expect(container.querySelector("button[aria-label='Close']")?.getAttribute("aria-label")).toBe("Close");
  });

  it("keeps FAQ closed by default and allows more than one answer open", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    const first = SUPPORT_FAQ_ITEMS[0];
    const second = SUPPORT_FAQ_ITEMS[1];
    expect(faqButton(container, first.question)?.getAttribute("aria-expanded")).toBe("false");
    expect(faqButton(container, second.question)?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      faqButton(container!, first.question)?.click();
    });
    expect(faqButton(container, first.question)?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(first.answer);
    expect(container.textContent).not.toContain(second.answer);

    act(() => {
      faqButton(container!, second.question)?.click();
    });
    expect(faqButton(container, first.question)?.getAttribute("aria-expanded")).toBe("true");
    expect(faqButton(container, second.question)?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(first.answer);
    expect(container.textContent).toContain(second.answer);
    expect(container.textContent).toContain("Apple / Google Play");

    act(() => {
      faqButton(container!, first.question)?.click();
    });
    expect(faqButton(container, first.question)?.getAttribute("aria-expanded")).toBe("false");
    expect(faqButton(container, second.question)?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).not.toContain(first.answer);
    expect(container.textContent).toContain(second.answer);
  });

  it("uses mailto for Contact Support and the footer email", () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    const mailtos = [...container.querySelectorAll(`a[href="${SUPPORT_MAILTO}"]`)];
    expect(mailtos).toHaveLength(2);
    expect(mailtos.some((link) => link.textContent?.includes("Contact Support"))).toBe(true);
    expect(mailtos.some((link) => link.textContent === SUPPORT_EMAIL)).toBe(true);
  });

  it("closes to Settings on a cold deep link and honors incoming returnTo", () => {
    const cold = renderPage("/support");
    root = cold.root;
    container = cold.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/support")).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSettings = renderPage({ pathname: "/support", state: { returnTo: "/settings" } });
    root = fromSettings.root;
    container = fromSettings.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/support", { returnTo: "/settings" })).toBe("/settings");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSafety = renderPage({ pathname: "/support", state: { returnTo: "/settings/safety" } });
    root = fromSafety.root;
    container = fromSafety.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings/safety");
    expect(namedHardwareBackTarget("/support", { returnTo: "/settings/safety" })).toBe("/settings/safety");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromHow = renderPage({ pathname: "/support", state: { returnTo: "/how-it-works" } });
    root = fromHow.root;
    container = fromHow.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /how-it-works");
    expect(namedHardwareBackTarget("/support", { returnTo: "/how-it-works" })).toBe("/how-it-works");
  });

  it("hands Safety, Guidelines, and Legal rows with Support return on a cold open", () => {
    const cases: Array<[string, string]> = [
      ["Safety Center", "LOC /settings/safety"],
      ["Community Guidelines", "LOC /guidelines"],
      ["Terms of Service", "LOC /terms"],
      ["Privacy Policy", "LOC /privacy"],
      ["Copyright Policy", "LOC /copyright"],
    ];
    for (const [label, location] of cases) {
      if (root || container) {
        act(() => {
          root?.unmount();
          container?.remove();
        });
      }
      const view = renderPage("/support");
      root = view.root;
      container = view.container;
      act(() => {
        rowButton(container!, label)?.click();
      });
      expect(container.textContent).toContain(location);
      expect(container.textContent).toContain('STATE {"returnTo":"/support"}');
    }
  });

  it("forwards an incoming Settings returnTo when opening child destinations", () => {
    const view = renderPage({ pathname: "/support", state: { returnTo: "/settings" } });
    root = view.root;
    container = view.container;
    act(() => {
      rowButton(container!, "Community Guidelines")?.click();
    });
    expect(container.textContent).toContain("LOC /guidelines");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
  });
});
