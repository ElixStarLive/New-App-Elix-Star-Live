import { describe, expect, it } from "vitest";
import { parseReportSearch, reportModalTargetId } from "./reportReasons";

describe("PAGE-046 report search and modal target", () => {
  it("maps Safety Center support to the support ticket contract", () => {
    const parsed = parseReportSearch(new URLSearchParams("type=support&id=support_ticket"));
    expect(parsed).toEqual({
      contentType: "user",
      targetType: "support",
      targetId: "support_ticket",
      isGeneralSupport: true,
    });
  });

  it("accepts leftover targetKind/targetId deep links", () => {
    const parsed = parseReportSearch(
      new URLSearchParams("targetKind=user&targetId=22222222-2222-4222-8222-222222222222"),
    );
    expect(parsed).toEqual({
      contentType: "user",
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      isGeneralSupport: false,
    });
  });

  it("treats a missing id as general support", () => {
    expect(parseReportSearch(new URLSearchParams())).toMatchObject({
      targetType: "support",
      targetId: "support_ticket",
      isGeneralSupport: true,
    });
  });

  it("resolves modal targets the same way as the OLD contentType contract", () => {
    expect(reportModalTargetId("video-1", "video")).toBe("video-1");
    expect(reportModalTargetId("video-1", "user", "user-2")).toBe("user-2");
    expect(reportModalTargetId("host-1", "live")).toBe("host-1");
    expect(reportModalTargetId("video-1", "comment", "comment-9")).toBe("comment-9");
  });
});
