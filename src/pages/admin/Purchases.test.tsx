import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PURCHASES_EMPTY,
  ADMIN_PURCHASES_ERROR,
  ADMIN_PURCHASES_LOADING,
  ADMIN_PURCHASES_TAB_IAP,
  ADMIN_PURCHASES_TAB_SHOP,
  ADMIN_PURCHASES_TITLE,
} from "@/content/adminPurchases";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminPurchases from "./Purchases";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const purchaseApi = vi.hoisted(() => ({
  iap: {
    data: [
      {
        id: "iap-1",
        user_id: "user-apple",
        provider: "apple",
        product_id: "coins100",
        transaction_id: "txn-apple-very-long-id-0001",
        coins: 100,
        status: "credited",
        created_at: "2026-08-22T00:00:00.000Z",
      },
      {
        id: "iap-2",
        user_id: "user-google",
        provider: "google",
        product_id: "coins500",
        transaction_id: "txn-google-1",
        coins: 500,
        status: "reversed",
        created_at: "2026-08-21T00:00:00.000Z",
      },
    ],
    error: null as string | null,
  },
  shop: {
    data: [
      {
        id: "shop-1",
        user_id: "<script>alert(1)</script>",
        stripe_session_id: "cs_test_long_session_id_should_truncate",
        item_id: "item-1",
        quantity: 1,
        amount_pence: 1999,
        status: "paid",
        created_at: "2026-08-22T00:00:00.000Z",
      },
    ],
    error: null as string | null,
  },
  iapCount: 0,
  shopCount: 0,
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminIapPurchases: () => {
    purchaseApi.iapCount += 1;
    return Promise.resolve(purchaseApi.iap);
  },
  apiFetchAdminShopPurchases: () => {
    purchaseApi.shopCount += 1;
    return Promise.resolve(purchaseApi.shop);
  },
}));

vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/purchases"]}>
        <Routes>
          <Route path="/admin/purchases" element={<AdminPurchases />} />
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

describe("PAGE-075 Admin Purchases", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    purchaseApi.iapCount = 0;
    purchaseApi.shopCount = 0;
    purchaseApi.iap = {
      data: [
        {
          id: "iap-1",
          user_id: "user-apple",
          provider: "apple",
          product_id: "coins100",
          transaction_id: "txn-apple-very-long-id-0001",
          coins: 100,
          status: "credited",
          created_at: "2026-08-22T00:00:00.000Z",
        },
        {
          id: "iap-2",
          user_id: "user-google",
          provider: "google",
          product_id: "coins500",
          transaction_id: "txn-google-1",
          coins: 500,
          status: "reversed",
          created_at: "2026-08-21T00:00:00.000Z",
        },
      ],
      error: null,
    };
    purchaseApi.shop = {
      data: [
        {
          id: "shop-1",
          user_id: "<script>alert(1)</script>",
          stripe_session_id: "cs_test_long_session_id_should_truncate",
          item_id: "item-1",
          quantity: 1,
          amount_pence: 1999,
          status: "paid",
          created_at: "2026-08-22T00:00:00.000Z",
        },
      ],
      error: null,
    };
    toast.mockReset();
  });

  it("shows loading then Coin IAP rows without shop money or credit controls", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_PURCHASES_LOADING);
    expect(container.textContent).not.toContain("coins100");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_PURCHASES_TITLE));
    expect(container.textContent).toContain(ADMIN_PURCHASES_TAB_IAP);
    expect(container.textContent).toContain(ADMIN_PURCHASES_TAB_SHOP);
    expect(container.textContent).toContain("coins100");
    expect(container.textContent).toContain("apple");
    expect(container.textContent).toContain("credited");
    expect(container.textContent).toContain("reversed");
    expect(container.textContent).toContain("100");
    expect(container.textContent).not.toContain("£19.99");
    expect(container.textContent).not.toContain("Credit Coins");
    expect(container.textContent).not.toContain("Consume");
    expect(container.querySelector("script")).toBeNull();
    expect(namedHardwareBackTarget("/admin/purchases")).toBe("/admin");
    expect(purchaseApi.shopCount).toBe(0);
  });

  it("does not convert a failed load into an empty purchase list", async () => {
    purchaseApi.iap = { data: null as never, error: ADMIN_PURCHASES_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_PURCHASES_ERROR));
    expect(container.textContent).toContain(ADMIN_PURCHASES_ERROR);
    expect(container.textContent).not.toContain(ADMIN_PURCHASES_EMPTY);
    expect(container.textContent).not.toContain("coins100");
  });

  it("switches to Shop without mixing IAP coin amounts", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes("coins100"));
    const shopTab = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_PURCHASES_TAB_SHOP);
    await act(async () => {
      shopTab?.click();
      await Promise.resolve();
    });
    await waitUntil(() => (container?.textContent || "").includes("£19.99"));
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("coins100");
    expect(container.textContent).not.toContain("Credit Coins");
    expect(purchaseApi.shopCount).toBeGreaterThan(0);
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
});
