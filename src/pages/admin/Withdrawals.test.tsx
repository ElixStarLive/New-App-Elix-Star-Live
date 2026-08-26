import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_WITHDRAWAL_ACTION_LABELS,
  ADMIN_WITHDRAWALS_EMPTY,
  ADMIN_WITHDRAWALS_ERROR,
  ADMIN_WITHDRAWALS_LOADING,
  ADMIN_WITHDRAWALS_NOTE_REQUIRED,
  ADMIN_WITHDRAWALS_TITLE,
  ADMIN_WITHDRAWALS_UPDATED,
} from "@/content/adminWithdrawals";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminWithdrawals from "./Withdrawals";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const withdrawalApi = vi.hoisted(() => ({
  list: {
    data: [
      {
        id: "wd-pending-1",
        userId: "creator-1",
        username: "creator_one",
        displayName: "<script>alert(1)</script>",
        amountPence: 5000,
        currency: "GBP" as const,
        status: "pending",
        adminNote: null,
        processedBy: null,
        processedAt: null,
        createdAt: "2026-08-22T00:00:00.000Z",
      },
      {
        id: "wd-approved-1",
        userId: "creator-2",
        username: "creator_two",
        displayName: "Creator Two With A Very Long Display Name That Must Wrap",
        amountPence: 123456789,
        currency: "GBP" as const,
        status: "approved",
        adminNote: "ref-1",
        processedBy: "admin-1",
        processedAt: "2026-08-22T01:00:00.000Z",
        createdAt: "2026-08-21T00:00:00.000Z",
      },
    ],
    error: null as string | null,
  },
  action: {
    ok: true as boolean,
    withdrawal: {
      id: "wd-pending-1",
      userId: "creator-1",
      username: "creator_one",
      displayName: "Creator One",
      amountPence: 5000,
      currency: "GBP" as const,
      status: "under_review",
      adminNote: null,
      processedBy: "admin-1",
      processedAt: "2026-08-22T02:00:00.000Z",
      createdAt: "2026-08-22T00:00:00.000Z",
    },
    error: null as string | null,
  },
  listCount: 0,
  actionCalls: [] as Array<{ id: string; action: string; note: string }>,
  pending: null as Promise<void> | null,
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminWithdrawals: () => {
    withdrawalApi.listCount += 1;
    return Promise.resolve(withdrawalApi.list);
  },
  apiAdminWithdrawalAction: (id: string, action: string, note: string) => {
    withdrawalApi.actionCalls.push({ id, action, note });
    const finish = withdrawalApi.action.ok
      ? { ok: true as const, withdrawal: withdrawalApi.action.withdrawal }
      : { ok: false as const, error: withdrawalApi.action.error || "Action failed" };
    if (withdrawalApi.pending) return withdrawalApi.pending.then(() => finish);
    return Promise.resolve(finish);
  },
}));

vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/withdrawals"]}>
        <Routes>
          <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
          <Route path="/admin" element={<div>admin-home</div>} />
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

describe("PAGE-076 Admin Withdrawals", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    withdrawalApi.listCount = 0;
    withdrawalApi.actionCalls = [];
    withdrawalApi.pending = null;
    withdrawalApi.list = {
      data: [
        {
          id: "wd-pending-1",
          userId: "creator-1",
          username: "creator_one",
          displayName: "<script>alert(1)</script>",
          amountPence: 5000,
          currency: "GBP",
          status: "pending",
          adminNote: null,
          processedBy: null,
          processedAt: null,
          createdAt: "2026-08-22T00:00:00.000Z",
        },
        {
          id: "wd-approved-1",
          userId: "creator-2",
          username: "creator_two",
          displayName: "Creator Two With A Very Long Display Name That Must Wrap",
          amountPence: 123456789,
          currency: "GBP",
          status: "approved",
          adminNote: "ref-1",
          processedBy: "admin-1",
          processedAt: "2026-08-22T01:00:00.000Z",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      error: null,
    };
    withdrawalApi.action = {
      ok: true,
      withdrawal: {
        id: "wd-pending-1",
        userId: "creator-1",
        username: "creator_one",
        displayName: "Creator One",
        amountPence: 5000,
        currency: "GBP",
        status: "under_review",
        adminNote: null,
        processedBy: "admin-1",
        processedAt: "2026-08-22T02:00:00.000Z",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
      error: null,
    };
    toast.mockReset();
  });

  it("shows loading then withdrawal cards without inventing chargeback or rising-stars UI", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_WITHDRAWALS_LOADING);
    expect(container.textContent).not.toContain("£50.00");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_WITHDRAWALS_TITLE));
    expect(container.textContent).toContain("Requested");
    expect(container.textContent).toContain("Under review");
    expect(container.textContent).toContain("£50.00");
    expect(container.textContent).toContain("£1234567.89");
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain(ADMIN_WITHDRAWAL_ACTION_LABELS.review);
    expect(container.textContent).toContain(ADMIN_WITHDRAWAL_ACTION_LABELS.approve);
    expect(container.textContent).toContain(ADMIN_WITHDRAWAL_ACTION_LABELS.reject);
    expect(container.textContent).toContain(ADMIN_WITHDRAWAL_ACTION_LABELS.cancel);
    expect(container.textContent).toContain(ADMIN_WITHDRAWAL_ACTION_LABELS["mark-paid"]);
    expect(container.textContent).not.toContain("Chargeback");
    expect(container.textContent).not.toContain("Unfreeze");
    expect(container.textContent).not.toContain("Rising Stars");
    expect(container.textContent).not.toContain(" coins");
    expect(namedHardwareBackTarget("/admin/withdrawals")).toBe("/admin");
  });

  it("does not convert a failed load into an empty payout list", async () => {
    withdrawalApi.list = { data: null as never, error: ADMIN_WITHDRAWALS_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_WITHDRAWALS_ERROR));
    expect(container.textContent).toContain(ADMIN_WITHDRAWALS_ERROR);
    expect(container.textContent).not.toContain(ADMIN_WITHDRAWALS_EMPTY);
    expect(container.textContent).not.toContain("£50.00");
  });

  it("keeps prior rows when a later status reload fails", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes("£50.00"));
    withdrawalApi.list = { data: null as never, error: ADMIN_WITHDRAWALS_ERROR };
    const approvedTab = [...container.querySelectorAll("button")].find((button) => button.textContent === "Approved");
    await act(async () => {
      approvedTab?.click();
      await Promise.resolve();
    });
    await waitUntil(() => withdrawalApi.listCount >= 2);
    expect(container.textContent).toContain("£50.00");
    expect(container.textContent).not.toContain(ADMIN_WITHDRAWALS_EMPTY);
    expect(toast).toHaveBeenCalled();
  });

  it("requires a note for reject and keeps the action button pending until the response", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes("£50.00"));
    const reject = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === ADMIN_WITHDRAWAL_ACTION_LABELS.reject,
    );
    await act(async () => {
      reject?.click();
      await Promise.resolve();
    });
    expect(toast).toHaveBeenCalledWith(ADMIN_WITHDRAWALS_NOTE_REQUIRED);
    expect(withdrawalApi.actionCalls).toHaveLength(0);

    const note = container.querySelector("#admin-withdrawal-note") as HTMLInputElement;
    await act(async () => {
      note.value = "duplicate request";
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let releasePending: () => void = () => undefined;
    withdrawalApi.pending = new Promise<void>((resolve) => {
      releasePending = resolve;
    });
    const reviewButtons = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent === ADMIN_WITHDRAWAL_ACTION_LABELS.review,
    );
    const review = reviewButtons[reviewButtons.length - 1];
    await act(async () => {
      review?.click();
    });
    await waitUntil(() => withdrawalApi.actionCalls.length === 1);
    await act(async () => {
      review?.click();
    });
    expect(withdrawalApi.actionCalls).toHaveLength(1);
    await act(async () => {
      releasePending();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_WITHDRAWALS_UPDATED));
  });

  it("returns to the dashboard from ← Admin", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "← Admin")));
    const back = [...container.querySelectorAll("button")].find((button) => button.textContent === "← Admin");
    act(() => {
      back?.click();
    });
    expect(container.textContent).toContain("admin-home");
  });

  it("renders nothing for a non-admin session", async () => {
    authState.user = { id: "user-1", isAdmin: false };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain(ADMIN_WITHDRAWALS_TITLE);
    expect(container.textContent).not.toContain("£50.00");
    expect(withdrawalApi.listCount).toBe(0);
  });
});
