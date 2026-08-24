import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FLOW-022 Join daily hearts owner", () => {
  it("sends the membership heart API from Join and does not treat Join as a co-host request", () => {
    const screen = readFileSync(resolve(process.cwd(), "src/features/live/LiveRoomScreen.tsx"), "utf8");
    const joinBlock = screen.slice(screen.indexOf("onJoin={() =>"), screen.indexOf("/>", screen.indexOf("onJoin={() =>")));
    expect(joinBlock).toMatch(/apiSendDailyHeart/);
    expect(joinBlock).not.toMatch(/cohost_request_send/);
    expect(screen).toMatch(/\/api\/hearts\/daily|apiGetDailyHearts/);
  });
});
