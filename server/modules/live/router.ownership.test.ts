import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("live router single-owner wiring", () => {
  it("delegates start/token/end to start.ts and token.ts (no inline LiveKit mint)", () => {
    const router = readFileSync(resolve(process.cwd(), "server/modules/live/router.ts"), "utf8");
    expect(router).toMatch(/from "\.\/start\.js"/);
    expect(router).toMatch(/from "\.\/token\.js"/);
    expect(router).toMatch(/startLive\(/);
    expect(router).toMatch(/issueLiveToken\(/);
    expect(router).toMatch(/endLive\(/);
    expect(router).not.toMatch(/createLivekitToken/);
    expect(router).not.toMatch(/valkeyTrySetNx/);
    expect(router).not.toMatch(/isSeatedCohost/);
  });

  it("keeps AccessToken minting only in infra/livekit.ts", () => {
    const livekit = readFileSync(resolve(process.cwd(), "server/infra/livekit.ts"), "utf8");
    expect(livekit).toMatch(/export async function createLivekitToken/);
    expect(livekit).toMatch(/new AccessToken/);
  });
});
