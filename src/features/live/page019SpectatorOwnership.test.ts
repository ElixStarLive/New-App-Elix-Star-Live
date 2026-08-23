import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("PAGE-019 spectator ownership", () => {
  it("keeps one spectator session owner and never ends the host from watch", () => {
    const screen = read("./LiveRoomScreen.tsx");
    const session = read("./useSpectatorSession.ts");
    const shell = read("./spectator/SpectatorLiveShell.tsx");
    const token = read("../../../server/modules/live/token.ts");
    expect(screen).toContain("useSpectatorSession");
    expect(screen).toMatch(/ReportModal/);
    expect(screen).not.toMatch(/apiLiveToken/);
    expect(screen).not.toMatch(/new LiveKitSession/);
    expect(screen).not.toMatch(/apiLiveEnd/);
    expect(screen).not.toMatch(/hostId \|\| roomId/);
    expect(screen).toContain('role === "spectator" && Boolean(hostId) && hostId !== user?.id');
    expect(session).toContain('requestToken(args.roomId, "spectator")');
    expect(session).toContain("SPECTATOR_WS_OWNER");
    expect(session).toContain("canPublish");
    expect(session).not.toMatch(/setTimeout/);
    expect(session).not.toMatch(/location\.reload/);
    expect(shell).toContain("key={streamId");
    expect(token).toContain("WHERE s.room_id = $1 AND s.status = 'live'");
    expect(token).not.toContain("OR s.id");
    expect(token).toContain("spectatorIdentity");
    expect(token).toContain("let canPublish = false");
  });
});
