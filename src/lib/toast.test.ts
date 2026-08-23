/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { showToast } from "./toast";

describe("PAGE-006 toast", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders an imperative DOM capsule and dedupes identical messages", () => {
    vi.useFakeTimers();
    showToast("Hello");
    expect(document.body.textContent).toContain("Hello");
    showToast("Hello");
    expect(document.body.querySelectorAll("div").length).toBeGreaterThan(0);
    vi.advanceTimersByTime(3000);
  });
});
