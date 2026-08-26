import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import SafetyCenter, { SAFETY_HOME, SAFETY_REPORT_HREF } from "./SafetyCenter";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderSafety(entry: string | { pathname: string; state?: unknown } = SAFETY_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/settings/safety" element={<SafetyCenter />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/blocked" element={<LocationProbe />} />
          <Route path="/report" element={<LocationProbe />} />
          <Route path="/edit-profile" element={<LocationProbe />} />
          <Route path="/privacy" element={<LocationProbe />} />
          <Route path="/guidelines" element={<LocationProbe />} />
          <Route path="/support" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-041 Safety Center", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the Settings option sheet and exact row order", () => {
    const view = renderSafety();
    root = view.root;
    container = view.container;
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Safety Center");
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    const text = container.textContent || "";
    expect(text).toContain("Quick Actions");
    expect(text).toContain("Privacy Controls");
    expect(text).toContain("Resources");
    expect(text).toContain("Need Immediate Help?");
    expect(text).toContain("If you or someone you know is in immediate danger, contact emergency services.");
    expect(text).toContain("US:");
    expect(text).toContain("911");
    expect(text).toContain("UK:");
    expect(text).toContain("999");
    expect(text).toContain("EU:");
    expect(text).toContain("112");
    expect(text).toContain("Support");
    const labels = [...container.querySelectorAll("button")]
      .map((button) => (button.textContent || "").replace(/\s+/g, " ").trim())
      .filter((label) => label && label !== "Close");
    const indexOf = (needle: string) => labels.findIndex((label) => label.includes(needle));
    expect(indexOf("Blocked Accounts")).toBeLessThan(indexOf("Report a Problem"));
    expect(indexOf("Report a Problem")).toBeLessThan(indexOf("Account Privacy"));
    expect(indexOf("Account Privacy")).toBeLessThan(indexOf("Data & Personalization"));
    expect(indexOf("Data & Personalization")).toBeLessThan(indexOf("Community Guidelines"));
    expect(indexOf("Community Guidelines")).toBeLessThan(indexOf("Safety Tips"));
    expect(indexOf("Safety Tips")).toBeLessThan(indexOf("Contact Support"));
    expect(text).not.toMatch(/blocked users|safety score|risk score|report submitted/i);
    expect(text).not.toContain("child-safety.html");
  });

  it("closes to Settings on named back and hardware back", () => {
    const view = renderSafety();
    root = view.root;
    container = view.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget(SAFETY_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(SAFETY_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("hands Blocked, Report, Guidelines, Privacy, Edit Profile, and Support with Safety return on a deep link", () => {
    const cases: Array<[string, string]> = [
      ["Blocked Accounts", "LOC /settings/blocked"],
      ["Report a Problem", `LOC ${SAFETY_REPORT_HREF}`],
      ["Account Privacy", "LOC /edit-profile"],
      ["Data & Personalization", "LOC /privacy"],
      ["Community Guidelines", "LOC /guidelines"],
      ["Safety Tips", "LOC /guidelines"],
      ["Contact Support", "LOC /support"],
    ];
    for (const [label, location] of cases) {
      act(() => {
        root?.unmount();
        container?.remove();
      });
      const view = renderSafety();
      root = view.root;
      container = view.container;
      act(() => {
        row(container!, label)?.click();
      });
      expect(container.textContent).toContain(location);
      expect(container.textContent).toContain(`STATE ${JSON.stringify({ returnTo: SAFETY_HOME })}`);
    }
  });

  it("preserves Settings returnTo for children when opened from PAGE-040", () => {
    const view = renderSafety({ pathname: SAFETY_HOME, state: { returnTo: "/settings" } });
    root = view.root;
    container = view.container;
    act(() => {
      row(container!, "Blocked Accounts")?.click();
    });
    expect(container.textContent).toContain("LOC /settings/blocked");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
    expect(namedHardwareBackTarget("/settings/blocked", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/report", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/guidelines", { returnTo: "/settings" })).toBe("/settings");
  });

  it("sends the OLD support-report query and does not submit a report", () => {
    const view = renderSafety();
    root = view.root;
    container = view.container;
    act(() => {
      row(container!, "Report a Problem")?.click();
    });
    expect(container.textContent).toContain("LOC /report?type=support&id=support_ticket");
    expect(SAFETY_REPORT_HREF).toBe("/report?type=support&id=support_ticket");
    expect(container.textContent).not.toContain("report submitted");
  });

  it("keeps Privacy/Safety distinction and emergency copy static with no loading spinner", () => {
    const view = renderSafety();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Data & Personalization");
    expect(container.textContent).toContain("Manage how your data is used.");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Loading|Retry|safety score|risk score/i);
    act(() => {
      row(container!, "Data & Personalization")?.click();
    });
    expect(container.textContent).toContain("LOC /privacy");
    expect(container.textContent).toContain(`STATE ${JSON.stringify({ returnTo: SAFETY_HOME })}`);
  });
});
