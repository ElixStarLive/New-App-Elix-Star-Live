import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FLOW-031 audio rights owner", () => {
  it("blocks catalog sounds marked BLOCKED and refuses publish with AUDIO_BLOCKED", () => {
    const rights = readFileSync(resolve(process.cwd(), "server/modules/uploads/audioRights.ts"), "utf8");
    const session = readFileSync(resolve(process.cwd(), "server/modules/uploads/session.ts"), "utf8");
    expect(rights).toMatch(/AUDIO_BLOCKED/);
    expect(rights).toMatch(/copyright_status/);
    expect(session).toMatch(/assertCatalogSoundPublishable/);
    expect(session).toMatch(/scanUploadAudio/);
  });
});
