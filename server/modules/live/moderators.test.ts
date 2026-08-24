import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FLOW-025 live moderator owner", () => {
  it("keeps host-only grant/revoke on the live router", () => {
    const router = readFileSync(resolve(process.cwd(), "server/modules/live/router.ts"), "utf8");
    const service = readFileSync(resolve(process.cwd(), "server/modules/live/moderators.ts"), "utf8");
    expect(router).toMatch(/\/:streamId\/moderators/);
    expect(service).toMatch(/Only the stream host can assign moderators/);
    expect(service).toMatch(/live_stream_moderators/);
  });
});
