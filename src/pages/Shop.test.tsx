import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const live = vi.fn();
let navigateShop: ((to: string) => void) | null = null;

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/shop/shopApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/shop/shopApi")>();
  return {
    ...actual,
    apiListShopItems: (...args: unknown[]) => list(...args),
    apiCreateShopItem: vi.fn(),
    apiUpdateShopItem: vi.fn(),
    apiDeleteShopItem: vi.fn(),
    apiUploadShopImage: vi.fn(),
    apiShopCheckout: vi.fn(),
    apiShopCheckoutSessionStatus: vi.fn(),
    openShopStripeCheckout: vi.fn(),
  };
});
vi.mock("@/features/feed/feedApi", () => ({
  apiLiveStreams: (...args: unknown[]) => live(...args),
}));
vi.mock("@/features/chat/chatApi", () => ({
  apiEnsureDmThread: vi.fn(),
}));

import Shop from "./Shop";

const hat = {
  id: "11111111-1111-4111-8111-111111111111",
  sellerId: "22222222-2222-4222-8222-222222222222",
  name: "Hat",
  title: "Hat",
  description: "",
  price: 10,
  pricePence: 1000,
  priceLabel: "£10.00",
  imageUrl: null,
  category: "other",
};

const cap = {
  ...hat,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Cap",
  title: "Cap",
  price: 12,
  pricePence: 1200,
  priceLabel: "£12.00",
};

function CaptureNav() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateShop = navigate;
    return () => {
      navigateShop = null;
    };
  }, [navigate]);
  return null;
}

function renderShop(path = "/shop") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <CaptureNav />
        <Routes>
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:itemId" element={<Shop />} />
        </Routes>
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
  list.mockReset();
  live.mockReset();
  navigateShop = null;
  list.mockResolvedValue({ items: [], error: null });
  live.mockResolvedValue({ streams: [], error: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-036 Shop page", () => {
  it("shows the OLD empty shop chrome after a successful empty list", async () => {
    const view = renderShop();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Shop");
    expect(container.textContent).toContain("No items for sale yet");
    expect(container.textContent).toContain("Add products");
    expect(container.textContent).toContain("Basket");
    expect(container.querySelector('[aria-label="Back"]')).toBeTruthy();
  });

  it("shows list failure instead of empty-success chrome", async () => {
    list.mockResolvedValue({ items: [], error: "Failed to load shop items" });
    const view = renderShop();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Failed to load shop items");
    expect(container.textContent).not.toContain("No items for sale yet");
  });

  it("renders a listed item with the basket control", async () => {
    list.mockResolvedValue({ items: [hat], error: null });
    const view = renderShop();
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Hat");
    expect(container.textContent).toContain("£10.00");
    expect(container.querySelector('[aria-label="Add to basket"]')).toBeTruthy();
  });

  it("keeps the full catalog on /shop when more than one item exists", async () => {
    list.mockResolvedValue({ items: [hat, cap], error: null });
    const view = renderShop("/shop");
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Hat");
    expect(container.textContent).toContain("Cap");
  });
});

describe("PAGE-037 Shop item deep link", () => {
  it("shows only the canonical item from GET /api/shop/items", async () => {
    list.mockResolvedValue({ items: [hat, cap], error: null });
    const view = renderShop(`/shop/${hat.id}`);
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Hat");
    expect(container.textContent).not.toContain("Cap");
    expect(container.querySelector('[aria-label="Add to basket"]')).toBeTruthy();
  });

  it("does not substitute another product for an unknown itemId", async () => {
    list.mockResolvedValue({ items: [hat, cap], error: null });
    const view = renderShop("/shop/not-a-real-item");
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("No items for sale yet");
    expect(container.textContent).not.toContain("Hat");
    expect(container.textContent).not.toContain("Cap");
  });

  it("shows catalog failure on deep link instead of empty-success chrome", async () => {
    list.mockResolvedValue({ items: [], error: "Failed to load shop items" });
    const view = renderShop(`/shop/${hat.id}`);
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Failed to load shop items");
    expect(container.textContent).not.toContain("No items for sale yet");
  });

  it("keeps item B when the route changes from A to B", async () => {
    list.mockResolvedValue({ items: [hat, cap], error: null });
    const view = renderShop(`/shop/${hat.id}`);
    root = view.root;
    container = view.container;
    await flush();
    expect(container.textContent).toContain("Hat");
    expect(container.textContent).not.toContain("Cap");
    await act(async () => {
      navigateShop?.(`/shop/${cap.id}`);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Cap");
    expect(container.textContent).not.toContain("Hat");
  });
});
