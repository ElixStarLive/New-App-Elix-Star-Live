import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadStoreCoinProducts = vi.fn();
const initializeCoinIap = vi.fn();
const reconcileOwnedCoinPurchases = vi.fn();
const native = vi.hoisted(() => ({ isNative: false }));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/platform", () => ({
  platform: {
    get isNative() {
      return native.isNative;
    },
  },
}));
vi.mock("@/features/iap/iapApi", () => ({
  initializeCoinIap: (...args: unknown[]) => initializeCoinIap(...args),
  loadStoreCoinProducts: (...args: unknown[]) => loadStoreCoinProducts(...args),
  purchaseCoinProduct: vi.fn(),
  reconcileOwnedCoinPurchases: (...args: unknown[]) => reconcileOwnedCoinPurchases(...args),
  restoreCoinPurchases: vi.fn(),
}));

import PurchaseCoins from "./PurchaseCoins";

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <PurchaseCoins />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  native.isNative = false;
  loadStoreCoinProducts.mockReset();
  initializeCoinIap.mockReset();
  reconcileOwnedCoinPurchases.mockReset();
  initializeCoinIap.mockResolvedValue(undefined);
  reconcileOwnedCoinPurchases.mockResolvedValue(0);
  loadStoreCoinProducts.mockResolvedValue({ products: [], error: null });
  root = null;
  container = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-038 Purchase Coins page", () => {
  it("shows the OLD web Get Coins chrome and does not sell coins on web", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Get Coins");
    expect(container.textContent).toContain("Buy Coins");
    expect(container.textContent).toContain("Purchase Coins in the App");
    expect(container.textContent).toContain("Apple App Store or Google Play");
    expect(container.textContent).not.toContain("Checkout with Stripe");
    expect(container.textContent).toContain("What you can do with coins:");
    expect(container.querySelector("button[title='Back']")).toBeTruthy();
  });

  it("shows a spinner while the native catalog loads", async () => {
    native.isNative = true;
    let resolveCatalog: ((value: { products: unknown[]; error: string | null }) => void) | null = null;
    loadStoreCoinProducts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    const view = renderPage();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.querySelector(".elix-loader")).toBeTruthy();
    expect(container.textContent).not.toContain("Coin store unavailable");
    await act(async () => {
      resolveCatalog?.({
        products: [{ productId: "coins_100", coins: 100, title: "100 Coins", price: "£0.99" }],
        error: null,
      });
      await Promise.resolve();
    });
    expect(container.querySelector(".elix-loader")).toBeNull();
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("£0.99");
  });

  it("shows catalog failure instead of a blank product list", async () => {
    native.isNative = true;
    loadStoreCoinProducts.mockResolvedValue({ products: [], error: "Coin store unavailable. Try again in a moment." });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Coin store unavailable. Try again in a moment.");
    expect(container.querySelector(".elix-loader")).toBeNull();
  });
});
