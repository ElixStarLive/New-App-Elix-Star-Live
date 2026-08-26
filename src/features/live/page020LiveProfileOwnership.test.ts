import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const overlay = readFileSync(resolve(root, "./spectator/ProfileLiveOverlay.tsx"), "utf8");
const shell = readFileSync(resolve(root, "./spectator/SpectatorLiveShell.tsx"), "utf8");
const profile = readFileSync(resolve(root, "../../pages/Profile.tsx"), "utf8");

describe("PAGE-020 live profile overlay ownership", () => {
  it("wraps Profile without owning LiveKit or WS connect", () => {
    expect(overlay).toMatch(/from "@\/pages\/Profile"/);
    expect(overlay).not.toMatch(/LiveKitSession|new Room\(|apiLiveToken|apiLiveEnd|wsClient\.connect|wsClient\.disconnect/);
    expect(overlay).toContain('data-elix-live-profile="true"');
    expect(overlay).toContain("stream_ended");
    expect(overlay).toContain("closeToWatch");
    expect(overlay).toContain('z-[99999] bg-black');
  });

  it("keeps spectator LiveKit owner mounted under nested overlay route", () => {
    expect(shell).toContain("<LiveRoomScreen");
    expect(shell).toContain("<Outlet />");
    expect(shell).toContain('key={streamId');
  });

  it("returns to watch session from live overlay profile close", () => {
    expect(profile).toContain("namedExitForLocation");
    expect(profile).toContain("watchSessionPathFromOverlay");
    expect(profile).toContain("isLiveProfileOverlay");
  });
});
