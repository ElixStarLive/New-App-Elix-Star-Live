import { describe, expect, it } from "vitest";
import { inboxMessagePreview } from "./inboxPreview";

describe("PAGE-030 inbox message preview", () => {
  it("labels live, video, and profile shares without fabricating rows", () => {
    expect(inboxMessagePreview("")).toBe("No messages yet");
    expect(inboxMessagePreview("/watch/host-1")).toBe("Shared a live");
    expect(inboxMessagePreview("https://elix.local/live/abc")).toBe("Shared a live");
    expect(inboxMessagePreview("/video/vid-1")).toBe("Shared a video");
    expect(inboxMessagePreview("/profile/user-1")).toBe("Shared a profile");
    expect(inboxMessagePreview("hello")).toBe("hello");
  });
});
