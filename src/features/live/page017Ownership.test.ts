import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/LiveDiscover.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/features/live/useLiveDiscover.ts"), "utf8");
const card = readFileSync(resolve(process.cwd(), "src/components/ForYouLiveCard.tsx"), "utf8");

describe("PAGE-017 Live discover ownership", () => {
  it("lists lives via hook and opens watch by roomId", () => {
    expect(page).toMatch(/useLiveDiscover/);
    expect(page).toMatch(/ForYouLiveCard/);
    expect(page).toMatch(/No one is live right now/);
    expect(hook).toMatch(/apiLiveStreams/);
    expect(card).toMatch(/\/watch\//);
  });
});
