import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { SAFETY_HOME } from "./settings/SafetyCenter";
import Report, { REPORT_HOME } from "./Report";

const api = vi.hoisted(() => ({
  apiCreateReport: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/report/reportApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderReport(entry: string | { pathname: string; search?: string; state?: unknown } = REPORT_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const initial =
    typeof entry === "string"
      ? entry
      : {
          pathname: entry.pathname,
          search: entry.search,
          state: entry.state,
        };
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/report" element={<Report />} />
          <Route path="/feed" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/safety" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

function reasonButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => (button.textContent || "").includes(label));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-046 Report page", () => {
  beforeEach(() => {
    api.apiCreateReport.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiCreateReport.mockResolvedValue({ ok: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("renders the support sheet for a missing target and the Safety Center query", () => {
    const view = renderReport();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Report a problem");
    expect(container.textContent).toContain("Why are you reporting this?");
    expect(container.textContent).toContain("Harassment or bullying");
    expect(reasonButton(container, "Submit Report")?.hasAttribute("disabled")).toBe(true);

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const support = renderReport("/report?type=support&id=support_ticket");
    root = support.root;
    container = support.container;
    expect(container.textContent).toContain("Report a problem");
    expect(container.textContent).toContain("Impersonation");
  });

  it("uses leftover targetKind deep links for a video report", () => {
    const view = renderReport("/report?targetKind=video&targetId=video-1");
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Report video");
    expect(container.textContent).toContain("Spam or misleading");
    expect(container.textContent).toContain("Child safety concerns");
  });

  it("submits the OLD body and shows success only after the server id", async () => {
    const hold = new Promise<{ ok: true; id: string }>(() => undefined);
    api.apiCreateReport.mockReturnValueOnce(hold);
    const view = renderReport("/report?type=user&id=22222222-2222-4222-8222-222222222222");
    root = view.root;
    container = view.container;
    act(() => {
      reasonButton(container!, "Spam account")?.click();
    });
    const submit = reasonButton(container!, "Submit Report") as HTMLButtonElement;
    act(() => {
      submit.click();
      submit.click();
    });
    await waitUntil(() => api.apiCreateReport.mock.calls.length === 1);
    expect(container.textContent).toContain("Submitting...");
    expect(container.textContent).not.toContain("Report Submitted");
    expect(api.apiCreateReport).toHaveBeenCalledWith({
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      reason: "spam",
      details: "",
    });
  });

  it("shows Report Submitted after a real id and keeps the named close", async () => {
    const view = renderReport("/report?type=support&id=support_ticket");
    root = view.root;
    container = view.container;
    act(() => {
      reasonButton(container!, "Other")?.click();
    });
    act(() => {
      reasonButton(container!, "Submit Report")?.click();
    });
    await waitUntil(() => (container!.textContent || "").includes("Report Submitted"));
    expect(container.textContent).toContain("Thank you for helping keep our community safe.");
    expect(container.textContent).not.toContain("Submitting...");
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /feed");
  });

  it("closes to For You by default and honors Safety/Settings returnTo", async () => {
    const view = renderReport();
    root = view.root;
    container = view.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /feed");
    expect(namedHardwareBackTarget(REPORT_HOME)).toBe("/feed");

    act(() => {
      root?.unmount();
      container?.remove();
    });
    const fromSafety = renderReport({ pathname: REPORT_HOME, search: "?type=support&id=support_ticket", state: { returnTo: SAFETY_HOME } });
    root = fromSafety.root;
    container = fromSafety.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain(`LOC ${SAFETY_HOME}`);
    expect(namedHardwareBackTarget(REPORT_HOME, { returnTo: SAFETY_HOME })).toBe(SAFETY_HOME);
    expect(namedHardwareBackTarget(REPORT_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("toasts a failed submit and does not show success", async () => {
    api.apiCreateReport.mockResolvedValueOnce({
      ok: false,
      error: "Failed to submit report. Please try again.",
      sessionExpired: false,
    });
    const view = renderReport();
    root = view.root;
    container = view.container;
    act(() => {
      reasonButton(container!, "Other")?.click();
    });
    act(() => {
      reasonButton(container!, "Submit Report")?.click();
    });
    await waitUntil(() => toast.mock.calls.length === 1);
    expect(container.textContent).not.toContain("Report Submitted");
    expect(container.textContent).toContain("Submit Report");
  });
});
