import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_REPORTS_EMPTY,
  ADMIN_REPORTS_ERROR,
  ADMIN_REPORTS_LOADING,
  ADMIN_REPORTS_NO_ACTION,
  ADMIN_REPORTS_NO_DETAILS,
  ADMIN_REPORTS_REMOVE,
  ADMIN_REPORTS_TITLE,
  ADMIN_REPORTS_VIEW,
  ADMIN_REPORTS_WARN,
} from "@/content/adminReports";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminReports from "./Reports";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const reportsApi = vi.hoisted(() => ({
  filter: "pending",
  result: {
    reports: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        target_type: "user",
        target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        reason: "hate_speech",
        details: "<script>alert(1)</script>",
        status: "open",
        created_at: "2026-01-02T00:00:00.000Z",
        reporter: { username: "maya" },
      },
    ],
    error: null as string | null,
  },
  resolve: {
    ok: true as const,
    report: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      target_type: "user",
      target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      reason: "hate_speech",
      details: "<script>alert(1)</script>",
      status: "actioned",
      created_at: "2026-01-02T00:00:00.000Z",
      reporter: { username: "maya" },
    },
  } as { ok: true; report: Record<string, unknown> } | { ok: false; error: string },
  lastAction: "" as string,
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiAdminListReports: (filter = "pending") => {
    reportsApi.filter = filter;
    return Promise.resolve(reportsApi.result);
  },
  apiAdminResolveReport: (_id: string, action: string) => {
    reportsApi.lastAction = action;
    return Promise.resolve(reportsApi.resolve);
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/reports"]}>
        <Routes>
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
          <Route path="/video/:videoId" element={<LocationProbe />} />
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
      await Promise.resolve();
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-072 Admin Reports", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    reportsApi.filter = "pending";
    reportsApi.lastAction = "";
    reportsApi.result = {
      reports: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          target_type: "user",
          target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          reason: "hate_speech",
          details: "<script>alert(1)</script>",
          status: "open",
          created_at: "2026-01-02T00:00:00.000Z",
          reporter: { username: "maya" },
        },
      ],
      error: null,
    };
    reportsApi.resolve = {
      ok: true,
      report: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        target_type: "user",
        target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        reason: "hate_speech",
        details: "<script>alert(1)</script>",
        status: "actioned",
        created_at: "2026-01-02T00:00:00.000Z",
        reporter: { username: "maya" },
      },
    };
    vi.restoreAllMocks();
  });

  it("shows loading then the frozen queue and pending filter", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_REPORTS_LOADING);
    expect(container.textContent).not.toContain("maya");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_REPORTS_TITLE));
    expect(container.querySelector("h1")?.textContent).toContain(ADMIN_REPORTS_TITLE);
    expect(container.textContent).toContain("HATE SPEECH");
    expect(container.textContent).toContain("user");
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("maya");
    expect(container.textContent).toContain(ADMIN_REPORTS_WARN);
    expect(container.textContent).toContain(ADMIN_REPORTS_REMOVE);
    expect(container.textContent).toContain(ADMIN_REPORTS_NO_ACTION);
    expect(container.textContent).toContain(ADMIN_REPORTS_VIEW);
    expect(container.textContent).not.toContain("Ban");
    expect(namedHardwareBackTarget("/admin/reports")).toBe("/admin");
  });

  it("does not convert a failed load into No reports found", async () => {
    reportsApi.result = { reports: null as never, error: ADMIN_REPORTS_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_REPORTS_ERROR));
    expect(container.textContent).toContain(ADMIN_REPORTS_ERROR);
    expect(container.textContent).not.toContain(ADMIN_REPORTS_EMPTY);
    expect(container.textContent).not.toContain("maya");
  });

  it("shows the empty state only after a successful zero list", async () => {
    reportsApi.result = { reports: [], error: null };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_REPORTS_EMPTY));
    expect(container.textContent).toContain(ADMIN_REPORTS_EMPTY);
    expect(container.textContent).not.toContain(ADMIN_REPORTS_ERROR);
  });

  it("sends All to the server and does not keep a stale pending list", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "All")));
    const all = [...container.querySelectorAll("button")].find((button) => button.textContent === "All");
    act(() => {
      all?.click();
    });
    await waitUntil(() => reportsApi.filter === "all");
    expect(reportsApi.filter).toBe("all");
  });

  it("warns only after server success and drops the pending row", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_WARN))));
    const warn = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_WARN));
    await act(async () => {
      warn?.click();
      await Promise.resolve();
    });
    expect(reportsApi.lastAction).toBe("warned");
    await waitUntil(() => !(container?.textContent || "").includes(ADMIN_REPORTS_WARN));
    expect(container.textContent).not.toContain(ADMIN_REPORTS_WARN);
  });

  it("keeps the previous row when resolve fails", async () => {
    reportsApi.resolve = { ok: false, error: "nope" };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_WARN))));
    const warn = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_WARN));
    await act(async () => {
      warn?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(ADMIN_REPORTS_WARN);
    expect(container.textContent).toContain("maya");
  });

  it("hands View to the existing user route with a Reports return", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_VIEW))));
    const viewBtn = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(ADMIN_REPORTS_VIEW));
    act(() => {
      viewBtn?.click();
    });
    expect(container.textContent).toContain("LOC /profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(container.textContent).toContain('STATE {"returnTo":"/admin/reports"}');
  });

  it("renders missing details with the frozen fallback", async () => {
    reportsApi.result.reports[0].details = "";
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_REPORTS_NO_DETAILS));
    expect(container.textContent).toContain(ADMIN_REPORTS_NO_DETAILS);
  });
});
