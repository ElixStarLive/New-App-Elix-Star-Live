import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./useLiveHostSession.ts", import.meta.url), "utf8");

describe("PAGE-018 host session ownership", () => {
  it("ends the server live only from explicit endBroadcast or failed publish rollback", () => {
    const cleanup = src.slice(src.indexOf("return () => {"), src.indexOf("const endBroadcast"));
    expect(cleanup).not.toMatch(/apiLiveEnd/);
    const cancelled = src.slice(src.indexOf("if (cancelled)"), src.indexOf("if (!result.ok)"));
    expect(cancelled).not.toMatch(/apiLiveEnd/);
    expect(src).toMatch(/const ended = await apiLiveEnd\(id\)/);
    expect(src).toMatch(/await end\(parsed\.data\.streamId\)/);
  });
});
