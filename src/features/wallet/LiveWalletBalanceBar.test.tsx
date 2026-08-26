import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveWalletBalanceBar } from "./LiveWalletBalanceBar";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

function renderBar(props: Partial<Parameters<typeof LiveWalletBalanceBar>[0]> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onGiftSourceChange = vi.fn();
  const onTopUp = vi.fn();
  act(() => {
    root.render(
      <LiveWalletBalanceBar
        paidCoins={1200}
        starterCoins={50000}
        promoCoins={25}
        walletStatus="ready"
        giftSource="paid_coins"
        onGiftSourceChange={onGiftSourceChange}
        onTopUp={onTopUp}
        testCoins={10}
        testStatus="ready"
        {...props}
      />,
    );
  });
  return { container, root, onGiftSourceChange, onTopUp };
}

describe("PAGE-039 LiveWalletBalanceBar", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows separated paid / starter / promo and Top Up without merging", () => {
    const view = renderBar();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("1,200");
    expect(container.textContent).toContain("Starter 50,000");
    expect(container.textContent).toContain("Promo 25");
    expect(container.textContent).toContain("Top Up");
    expect(container.textContent).toContain("Test coins 10");
    expect(container.textContent).toContain("not wallet money");
    expect(container.textContent).not.toContain("51,225");
  });

  it("does not invent zero while loading", () => {
    const view = renderBar({
      paidCoins: null,
      starterCoins: null,
      promoCoins: null,
      walletStatus: "loading",
      testCoins: null,
      testStatus: "loading",
    });
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("…");
    expect(container.textContent).not.toMatch(/Paid coins 0|Starter 0|Promo 0/);
  });

  it("shows unavailable on wallet error instead of silent zero", () => {
    const view = renderBar({
      paidCoins: null,
      starterCoins: null,
      promoCoins: null,
      walletStatus: "error",
    });
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("unavailable");
  });
});
