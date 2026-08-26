import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./reportError";

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the scope and error in development", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("boom");
    reportError("login.submit", failure);
    expect(spy).toHaveBeenCalledWith("[login.submit]", failure);
  });
});
