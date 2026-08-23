import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import { parseReportBody } from "./service.js";

describe("PAGE-046 report body contract", () => {
  it("accepts the OLD client body and ignores reporter_id / targetKind authority", () => {
    const parsed = parseReportBody({
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      reason: "spam",
      details: "  hello  ",
      reporter_id: "11111111-1111-4111-8111-111111111111",
      targetKind: "video",
    });
    expect(parsed).toEqual({
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      reason: "spam",
      details: "hello",
    });
  });

  it("rejects the retired targetKind-only body", () => {
    expect(() =>
      parseReportBody({
        targetKind: "user",
        targetId: "22222222-2222-4222-8222-222222222222",
        reason: "spam",
      }),
    ).toThrow(AppError);
  });

  it("rejects an empty target and oversized details", () => {
    expect(() => parseReportBody({ targetType: "video", targetId: "", reason: "spam" })).toThrow(AppError);
    expect(() =>
      parseReportBody({
        targetType: "support",
        targetId: "support_ticket",
        reason: "other",
        details: "x".repeat(501),
      }),
    ).toThrow(AppError);
  });
});
