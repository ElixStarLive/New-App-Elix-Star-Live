import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_ECONOMY_EDIT_PRICE,
  ADMIN_ECONOMY_ERROR,
  ADMIN_ECONOMY_INVALID_PRICE,
  ADMIN_ECONOMY_LOADING,
  ADMIN_ECONOMY_PACKAGES_EMPTY,
  ADMIN_ECONOMY_PRICE_FAILURE,
  ADMIN_ECONOMY_PRICE_UPDATED,
  ADMIN_ECONOMY_TITLE,
} from "@/content/adminEconomy";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminEconomy from "./Economy";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const economyApi = vi.hoisted(() => ({
  result: {
    data: {
      gifts: [
        {
          id: "rose",
          name: "<script>alert(1)</script>",
          coinCost: 1,
          isActive: true,
        },
      ],
      packages: [
        {
          id: "google:coins100",
          productId: "coins100",
          provider: "google",
          title: "100 Coins",
          coins: 100,
          priceDisplay: "£0.99",
        },
      ],
      boosters: [] as Array<{
        id: string;
        name: string;
        coinCost: number;
        effectType: string;
        isActive: boolean;
      }>,
    },
    error: null as string | null,
  },
  patch: {
    ok: true as const,
    gift: {
      id: "rose",
      name: "<script>alert(1)</script>",
      coinCost: 7,
      isActive: true,
    },
  } as
    | { ok: true; gift: { id: string; name: string; coinCost: number; isActive: boolean } }
    | { ok: false; error: string },
  lastPrice: 0,
  fetchCount: 0,
}));

const prompt = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminEconomy: () => {
    economyApi.fetchCount += 1;
    return Promise.resolve(economyApi.result);
  },
  apiAdminUpdateGiftPrice: (_giftId: string, coinCost: number) => {
    economyApi.lastPrice = coinCost;
    if (economyApi.patch.ok && economyApi.result.data) {
      const updated = economyApi.patch.gift;
      economyApi.result = {
        ...economyApi.result,
        data: {
          ...economyApi.result.data,
          gifts: economyApi.result.data.gifts.map((gift) => (gift.id === updated.id ? updated : gift)),
        },
      };
    }
    return Promise.resolve(economyApi.patch);
  },
}));

vi.mock("@/components/NativeDialog", async () => {
  const actual = await vi.importActual<typeof import("@/components/NativeDialog")>("@/components/NativeDialog");
  return { ...actual, nativePrompt: (...args: unknown[]) => prompt(...args) };
});

vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/economy"]}>
        <Routes>
          <Route path="/admin/economy" element={<AdminEconomy />} />
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

describe("PAGE-073 Admin Economy", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    economyApi.fetchCount = 0;
    economyApi.lastPrice = 0;
    economyApi.result = {
      data: {
        gifts: [
          {
            id: "rose",
            name: "<script>alert(1)</script>",
            coinCost: 1,
            isActive: true,
          },
        ],
        packages: [
          {
            id: "google:coins100",
            productId: "coins100",
            provider: "google",
            title: "100 Coins",
            coins: 100,
            priceDisplay: "£0.99",
          },
        ],
        boosters: [],
      },
      error: null,
    };
    economyApi.patch = {
      ok: true,
      gift: {
        id: "rose",
        name: "<script>alert(1)</script>",
        coinCost: 7,
        isActive: true,
      },
    };
    prompt.mockReset();
    toast.mockReset();
  });

  it("shows loading then the frozen economy sections", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_ECONOMY_LOADING);
    expect(container.textContent).not.toContain("100 Coins");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_ECONOMY_TITLE));
    expect(container.querySelector("h1")?.textContent).toContain(ADMIN_ECONOMY_TITLE);
    expect(container.textContent).toContain("Coin Packages (1)");
    expect(container.textContent).toContain("Gifts Catalog (1)");
    expect(container.textContent).toContain("Boosters Catalog (0)");
    expect(container.textContent).toContain("100 Coins");
    expect(container.textContent).toContain("coins100");
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain(ADMIN_ECONOMY_EDIT_PRICE);
    expect(container.textContent).not.toContain("Add Coins");
    expect(container.textContent).not.toContain("Monetisation");
    expect(namedHardwareBackTarget("/admin/economy")).toBe("/admin");
  });

  it("does not convert a failed load into empty catalogs", async () => {
    economyApi.result = { data: null as never, error: ADMIN_ECONOMY_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_ECONOMY_ERROR));
    expect(container.textContent).toContain(ADMIN_ECONOMY_ERROR);
    expect(container.textContent).not.toContain("Coin Packages (0)");
    expect(container.textContent).not.toContain(ADMIN_ECONOMY_PACKAGES_EMPTY);
    expect(container.textContent).not.toContain(ADMIN_ECONOMY_EDIT_PRICE);
  });

  it("saves an edited price from the server gift and ignores a cancelled prompt", async () => {
    prompt.mockResolvedValueOnce("7");
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE)));
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE);
    await act(async () => {
      edit?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_ECONOMY_PRICE_UPDATED));
    expect(economyApi.lastPrice).toBe(7);
    expect(container.textContent).toContain("7");
    expect(economyApi.fetchCount).toBeGreaterThan(1);

    prompt.mockResolvedValueOnce(null);
    await act(async () => {
      edit?.click();
      await Promise.resolve();
    });
    expect(toast).not.toHaveBeenCalledWith(ADMIN_ECONOMY_INVALID_PRICE);
  });

  it("rejects an invalid price without calling PATCH", async () => {
    prompt.mockResolvedValueOnce("0");
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE)));
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE);
    await act(async () => {
      edit?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_ECONOMY_INVALID_PRICE));
    expect(economyApi.lastPrice).toBe(0);
    expect(container.textContent).toContain("1");
  });

  it("keeps the previous catalog when PATCH fails", async () => {
    economyApi.patch = { ok: false, error: "nope" };
    prompt.mockResolvedValueOnce("9");
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE)));
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_ECONOMY_EDIT_PRICE);
    await act(async () => {
      edit?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_ECONOMY_PRICE_FAILURE));
    expect(container.textContent).toContain("1");
    expect(container.textContent).not.toMatch(/\b9\b/);
  });
});
