import { describe, expect, it } from "vitest";
import type { InboxActivityItem } from "@shared/contracts";
import { inboxActivityActorName, inboxActivityLine } from "./inboxActivityLine";

function item(partial: Partial<InboxActivityItem>): InboxActivityItem {
  return {
    id: "like_1",
    kind: "like",
    videoId: "v1",
    actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actorUsername: "fan",
    actorDisplayName: "Fan",
    actorAvatarUrl: null,
    snippet: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    ...partial,
  };
}

describe("PAGE-031 activity line", () => {
  it("names the real actor without fabricating username user", () => {
    expect(inboxActivityActorName(item({}))).toBe("Fan");
    expect(inboxActivityActorName(item({ actorDisplayName: null }))).toBe("fan");
    expect(inboxActivityActorName(item({ actorDisplayName: "  ", actorUsername: "  " }))).toBe("Someone");
  });

  it("uses the exact kind copy from the Activity overlay contract", () => {
    expect(inboxActivityLine(item({ kind: "like" }))).toBe("Liked your video");
    expect(inboxActivityLine(item({ kind: "save" }))).toBe("Saved your video");
    expect(inboxActivityLine(item({ kind: "mention", snippet: "hello" }))).toBe('Mentioned you: "hello"');
    expect(inboxActivityLine(item({ kind: "mention", snippet: null }))).toBe("Mentioned you in a comment");
    expect(inboxActivityLine(item({ kind: "comment", snippet: "nice" }))).toBe('Commented: "nice"');
    expect(inboxActivityLine(item({ kind: "comment", snippet: null }))).toBe("Commented on your video");
  });

  it("truncates mention and comment snippets at the overlay limits", () => {
    const mention = "m".repeat(81);
    const comment = "c".repeat(91);
    expect(inboxActivityLine(item({ kind: "mention", snippet: mention }))).toBe(`Mentioned you: "${"m".repeat(80)}…"`);
    expect(inboxActivityLine(item({ kind: "comment", snippet: comment }))).toBe(`Commented: "${"c".repeat(90)}…"`);
  });
});
