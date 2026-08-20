import { afterEach, describe, expect, it } from "vitest";
import { hasQualifiedViewAttempt, markQualifiedViewAttempt } from "./feedViewGuard";

const memory = new Map<string, string>();

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    clear: () => memory.clear(),
  },
});

describe("PAGE-007 view attempt guard", () => {
  afterEach(() => {
    memory.clear();
  });

  it("records one attempt per video", () => {
    expect(hasQualifiedViewAttempt("v1")).toBe(false);
    markQualifiedViewAttempt("v1");
    expect(hasQualifiedViewAttempt("v1")).toBe(true);
    markQualifiedViewAttempt("v1");
    expect(hasQualifiedViewAttempt("v1")).toBe(true);
  });
});
