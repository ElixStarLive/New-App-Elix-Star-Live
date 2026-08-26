import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadStoreCoinProducts = vi.fn();
const initializeCoinIap = vi.fn();
const reconcileOwnedCoinPurchases = vi.fn();
const purchaseCoinProduct = vi.fn();
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
  purchaseCoinProduct: (...args: unknown[]) => purchaseCoinProduct(...args),
  reconcileOwnedCoinPurchases: (...args: unknown[]) => reconcileOwnedCoinPurchases(...args),
}));

import { BuyCoinsModal } from "./BuyCoinsModal";

function renderModal(isOpen = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<BuyCoinsModal isOpen={isOpen} onClose={vi.fn()} />);
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

beforeEach(() => {
  native.isNative = false;
  loadStoreCoinProducts.mockReset();
  initializeCoinIap.mockReset();
  reconcileOwnedCoinPurchases.mockReset();
  purchaseCoinProduct.mockReset();
  initializeCoinIap.mockResolvedValue(true);
  reconcileOwnedCoinPurchases.mockResolvedValue(0);
  loadStoreCoinProducts.mockResolvedValue({ products: [], error: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.querySelectorAll('[aria-label="Recharge Coins"]').forEach((node) => node.remove());
  document.body.querySelectorAll(".fixed.inset-0.bg-black\\/80").forEach((node) => node.remove());
});

describe("PAGE-038 BuyCoinsModal", () => {
  it("shows honest web unavailable chrome without Stripe", async () => {
    const view = renderModal(true);
    root = view.root;
    await flush();
    const dialog = document.body.querySelector('[aria-label="Recharge Coins"]');
    expect(dialog?.textContent).toContain("Recharge Coins");
    expect(dialog?.textContent).toContain("Purchase Coins in the App");
    expect(dialog?.textContent).not.toContain("Checkout with Stripe");
  });

  it("loads native packages through the shared IAP owner", async () => {
    native.isNative = true;
    loadStoreCoinProducts.mockResolvedValue({
      products: [{ productId: "coins100", coins: 100, title: "100 Coins", price: "£0.99" }],
      error: null,
    });
    const view = renderModal(true);
    root = view.root;
    await flush();
    expect(initializeCoinIap).toHaveBeenCalled();
    expect(reconcileOwnedCoinPurchases).toHaveBeenCalled();
    expect(loadStoreCoinProducts).toHaveBeenCalled();
    const dialog = document.body.querySelector('[aria-label="Recharge Coins"]');
    expect(dialog?.textContent).toContain("100 Coins");
    expect(dialog?.textContent).toContain("£0.99");
    expect(dialog?.textContent).toContain("100 coins");
  });
});
