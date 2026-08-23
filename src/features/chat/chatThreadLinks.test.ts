import { describe, expect, it } from "vitest";
import { splitChatBody } from "./chatThreadLinks";

describe("PAGE-033 message body parts", () => {
  it("keeps script text as plain text", () => {
    expect(splitChatBody("<script>alert(1)</script>")).toEqual([
      { kind: "text", text: "<script>alert(1)</script>" },
    ]);
  });

  it("maps app share URLs to in-app paths and leaves other https links as urls", () => {
    const parts = splitChatBody("see https://www.elixstarlive.co.uk/video/abc123 and https://example.com/x");
    expect(parts).toEqual([
      { kind: "text", text: "see " },
      { kind: "app", path: "/video/abc123", label: "View Video" },
      { kind: "text", text: " and " },
      { kind: "url", href: "https://example.com/x" },
    ]);
  });
});
