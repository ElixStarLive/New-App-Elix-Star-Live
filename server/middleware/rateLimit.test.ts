import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const counters = new Map<string, number>();
const incr = vi.fn(async (key: string) => {
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return next;
});
const expire = vi.fn(async () => 1);
const envState = { valkeyUrl: "redis://test", isProduction: false };

vi.mock("../infra/env.js", () => ({
  env: () => envState,
}));

vi.mock("../infra/valkey.js", () => ({
  requireValkey: () => ({ incr, expire }),
}));

import { rateLimit } from "./rateLimit.js";

function request(overrides: Partial<Request> = {}): Request {
  return { path: "/api/feed", method: "GET", ip: "1.2.3.4", ...overrides } as Request;
}

async function run(req: Request): Promise<unknown> {
  const next = vi.fn() as unknown as NextFunction;
  await rateLimit(req, {} as Response, next);
  return vi.mocked(next).mock.calls[0]?.[0];
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    counters.clear();
    incr.mockClear();
    expire.mockClear();
    envState.valkeyUrl = "redis://test";
    envState.isProduction = false;
  });

  it("skips non-api paths without touching Valkey", async () => {
    expect(await run(request({ path: "/live/room-1" }))).toBeUndefined();
    expect(incr).not.toHaveBeenCalled();
  });

  it("sets the window ttl on the first request only", async () => {
    await run(request());
    await run(request());
    expect(incr).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("rl:1.2.3.4:GET:/api/feed", 60);
  });

  it("counts per ip, method and path", async () => {
    await run(request());
    await run(request({ method: "POST" }));
    await run(request({ ip: "5.6.7.8" }));
    expect([...counters.keys()]).toEqual([
      "rl:1.2.3.4:GET:/api/feed",
      "rl:1.2.3.4:POST:/api/feed",
      "rl:5.6.7.8:GET:/api/feed",
    ]);
  });

  it("falls back to an unknown bucket when the ip is missing", async () => {
    await run(request({ ip: undefined }));
    expect([...counters.keys()]).toEqual(["rl:unknown:GET:/api/feed"]);
  });

  it("rate-limits after 120 requests in the window", async () => {
    for (let i = 0; i < 120; i += 1) {
      expect(await run(request())).toBeUndefined();
    }
    expect(await run(request())).toMatchObject({
      code: "rate_limited",
      status: 429,
      message: "Too many requests",
    });
  });

  it("passes through when Valkey is not configured outside production", async () => {
    envState.valkeyUrl = "";
    expect(await run(request())).toBeUndefined();
    expect(incr).not.toHaveBeenCalled();
  });

  it("fails closed when Valkey is not configured in production", async () => {
    envState.valkeyUrl = "";
    envState.isProduction = true;
    expect(await run(request())).toMatchObject({
      code: "unavailable",
      status: 503,
      message: "Rate limiter requires Valkey",
    });
  });
});
