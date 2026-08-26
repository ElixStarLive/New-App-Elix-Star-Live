import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./cors.js";

describe("CORS origin allowlist", () => {
  it("allows an exact configured origin", () => {
    expect(isAllowedOrigin("https://app.example", { clientUrl: "https://app.example", isProduction: true })).toBe(true);
  });

  it("allows comma-separated configured origins", () => {
    expect(
      isAllowedOrigin("https://admin.example", {
        clientUrl: "https://app.example, https://admin.example",
        isProduction: true,
      }),
    ).toBe(true);
  });

  it("ignores case and trailing slashes for configured origins", () => {
    expect(
      isAllowedOrigin("HTTPS://APP.EXAMPLE/", { clientUrl: "https://app.example/", isProduction: true }),
    ).toBe(true);
  });

  it("denies unrelated origins", () => {
    expect(isAllowedOrigin("https://evil.example", { clientUrl: "https://app.example", isProduction: true })).toBe(false);
  });

  it("allows native origins without a configured client URL", () => {
    expect(isAllowedOrigin("capacitor://localhost", { clientUrl: "", isProduction: true })).toBe(true);
    expect(isAllowedOrigin("https://evil.example", { clientUrl: "", isProduction: true })).toBe(false);
  });

  it("allows local development origins", () => {
    expect(isAllowedOrigin("http://localhost:5173", { isProduction: false })).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173", { isProduction: false })).toBe(true);
  });

  it("requires configured local origins in production", () => {
    expect(isAllowedOrigin("http://localhost:5173", { isProduction: true })).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173", { clientUrl: "http://localhost:5173", isProduction: true })).toBe(true);
  });
});
