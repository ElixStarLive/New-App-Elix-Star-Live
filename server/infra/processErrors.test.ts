import { afterAll, describe, expect, it, vi } from "vitest";
import { logger } from "./logger.js";
import { installProcessErrorHandlers } from "./processErrors.js";

describe("installProcessErrorHandlers", () => {
  const before = {
    rejection: process.listenerCount("unhandledRejection"),
    exception: process.listenerCount("uncaughtException"),
  };

  afterAll(() => {
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
  });

  it("registers handlers once and logs unhandled rejections", () => {
    installProcessErrorHandlers();
    installProcessErrorHandlers();
    expect(process.listenerCount("unhandledRejection")).toBe(before.rejection + 1);
    expect(process.listenerCount("uncaughtException")).toBe(before.exception + 1);

    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const failure = new Error("dropped");
    process.emit("unhandledRejection", failure, Promise.resolve());
    expect(spy).toHaveBeenCalledWith({ err: failure }, "unhandled promise rejection");
    spy.mockRestore();
  });
});
