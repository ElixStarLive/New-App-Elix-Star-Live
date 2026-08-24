import { describe, expect, it } from "vitest";
import { isReportSessionFailure } from "./reportApi";

describe("PAGE-046 report API session codes", () => {
  it("treats only 401 unauthenticated/session_expired as session failure", () => {
    expect(isReportSessionFailure(401, "unauthenticated")).toBe(true);
    expect(isReportSessionFailure(401, "session_expired")).toBe(true);
    expect(isReportSessionFailure(401, "forbidden")).toBe(false);
    expect(isReportSessionFailure(400, "unauthenticated")).toBe(false);
    expect(isReportSessionFailure(500)).toBe(false);
  });
});
