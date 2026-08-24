import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const overlay = readFileSync(resolve(root, "./spectator/ProfileLiveOverlay.tsx"), "utf8");
const hook = readFileSync(resolve(root, "./useLiveProfileOverlay.ts"), "utf8");

describe("PAGE-020 live profile overlay ownership", () => {
  it("does not own LiveKit, tokens, or a second profile page", () => {
    expect(overlay).not.toMatch(/from "@\/pages\/Profile"/);
    expect(overlay).not.toMatch(/LiveKitSession|new Room\(|apiLiveToken|apiLiveEnd|wsClient\.connect|wsClient\.disconnect/);
    expect(overlay).toContain("loadLiveProfile");
    expect(overlay).toContain("apiFollow");
    expect(overlay).toContain("apiUnfollow");
    expect(overlay).toContain('z-[99999]');
    expect(overlay).toContain("closeToWatch");
    expect(hook).toContain("apiFetchProfile");
    expect(hook).not.toMatch(/hostId \|\| |userId \|\| hostId/);
  });
});
