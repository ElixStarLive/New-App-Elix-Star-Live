// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => false) }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform, getPlatform: () => (isNativePlatform() ? "ios" : "web") },
}));

import { apiUrl, getApiBase, getLiveKitUrl, getPublicWebOrigin, getWsUrl } from "./api";

const PRODUCTION_ORIGIN = "https://www.elixstarlive.co.uk";

function stubLocation(url: string, runtimeEnv?: Record<string, string>): void {
  const parsed = new URL(url);
  vi.stubGlobal("window", {
    location: {
      hostname: parsed.hostname,
      host: parsed.host,
      protocol: parsed.protocol,
      origin: parsed.origin,
    },
    __ELIX_ENV: runtimeEnv,
  });
}

describe("api url resolution", () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_WS_URL", "");
    vi.stubEnv("VITE_LIVEKIT_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses same-origin relative paths in local dev", () => {
    stubLocation("http://localhost:5173/feed");
    expect(getApiBase()).toBe("");
    expect(apiUrl("/api/feed")).toBe("/api/feed");
    expect(apiUrl("api/feed")).toBe("/api/feed");
  });

  it("ignores a configured api url in local dev", () => {
    stubLocation("http://127.0.0.1:5173/feed");
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    expect(getApiBase()).toBe("");
  });

  it("uses the configured api url on a deployed web origin", () => {
    stubLocation("https://staging.elixstarlive.co.uk/feed");
    vi.stubEnv("VITE_API_URL", "https://api.example.com/");
    expect(getApiBase()).toBe("https://api.example.com");
    expect(apiUrl("/api/feed")).toBe("https://api.example.com/api/feed");
  });

  it("falls back to the runtime env when no build-time api url is set", () => {
    stubLocation("https://staging.elixstarlive.co.uk/feed", { VITE_API_URL: "https://runtime.example.com/" });
    expect(getApiBase()).toBe("https://runtime.example.com");
  });

  it("uses the configured absolute api url on native", () => {
    isNativePlatform.mockReturnValue(true);
    stubLocation("http://localhost/");
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    expect(getApiBase()).toBe("https://api.example.com");
  });

  it("falls back to the production origin on native without an absolute api url", () => {
    isNativePlatform.mockReturnValue(true);
    stubLocation("http://localhost/");
    vi.stubEnv("VITE_API_URL", "api.example.com");
    expect(getApiBase()).toBe(PRODUCTION_ORIGIN);
  });

  it("reports the browser origin as the public web origin, and the api base on native", () => {
    stubLocation("https://staging.elixstarlive.co.uk/feed");
    expect(getPublicWebOrigin()).toBe("https://staging.elixstarlive.co.uk");

    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    expect(getPublicWebOrigin()).toBe("https://api.example.com");
  });
});

describe("getWsUrl", () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_WS_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the dev server host in local dev, matching the page protocol", () => {
    stubLocation("http://localhost:5173/live");
    expect(getWsUrl()).toBe("ws://localhost:5173");
    stubLocation("https://localhost:5173/live");
    expect(getWsUrl()).toBe("wss://localhost:5173");
  });

  it("upgrades a configured http(s) ws url to a ws scheme", () => {
    stubLocation("https://app.elixstarlive.co.uk/live");
    vi.stubEnv("VITE_WS_URL", "https://ws.example.com/");
    expect(getWsUrl()).toBe("wss://ws.example.com");
    vi.stubEnv("VITE_WS_URL", "http://ws.example.com");
    expect(getWsUrl()).toBe("wss://ws.example.com");
  });

  it("forces wss for a remote ws:// url but leaves loopback alone", () => {
    stubLocation("https://app.elixstarlive.co.uk/live");
    vi.stubEnv("VITE_WS_URL", "ws://ws.example.com");
    expect(getWsUrl()).toBe("wss://ws.example.com");
    vi.stubEnv("VITE_WS_URL", "ws://localhost:8080");
    expect(getWsUrl()).toBe("ws://localhost:8080");
    vi.stubEnv("VITE_WS_URL", "ws://127.0.0.1:8080");
    expect(getWsUrl()).toBe("ws://127.0.0.1:8080");
  });

  it("derives the ws url from the page host when nothing is configured", () => {
    stubLocation("https://app.elixstarlive.co.uk/live");
    expect(getWsUrl()).toBe("wss://app.elixstarlive.co.uk");
  });

  it("derives the ws url from the api base on native", () => {
    isNativePlatform.mockReturnValue(true);
    stubLocation("http://localhost/");
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    expect(getWsUrl()).toBe("wss://api.example.com");
  });
});

describe("getLiveKitUrl", () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    stubLocation("https://app.elixstarlive.co.uk/live");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps http(s) to ws(s) and keeps an explicit ws url", () => {
    vi.stubEnv("VITE_LIVEKIT_URL", "https://lk.example.com/");
    expect(getLiveKitUrl()).toBe("wss://lk.example.com");
    vi.stubEnv("VITE_LIVEKIT_URL", "http://lk.example.com");
    expect(getLiveKitUrl()).toBe("ws://lk.example.com");
    vi.stubEnv("VITE_LIVEKIT_URL", "wss://lk.example.com");
    expect(getLiveKitUrl()).toBe("wss://lk.example.com");
  });

  it("returns an empty string when unconfigured", () => {
    vi.stubEnv("VITE_LIVEKIT_URL", "");
    expect(getLiveKitUrl()).toBe("");
  });
});
