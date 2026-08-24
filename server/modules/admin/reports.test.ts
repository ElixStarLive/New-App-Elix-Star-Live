import { describe, expect, it } from "vitest";
import {
  ADMIN_REPORTS_LIMIT,
  ADMIN_REPORTS_LIST_SQL,
  ADMIN_REPORTS_NOTE_MAX,
  ADMIN_REPORTS_WARNING_BODY,
  ADMIN_REPORTS_WARNING_TITLE,
  isAdminReportId,
  parseAdminReportStatus,
  parseAdminReportsFilter,
  parseOptionalAdminNote,
  parseOptionalAdminReportAction,
} from "./reports.js";

describe("PAGE-072 admin reports contract", () => {
  it("lists a bounded newest-first queue from reports", () => {
    expect(ADMIN_REPORTS_LIMIT).toBe(200);
    expect(ADMIN_REPORTS_LIST_SQL).toContain("LIMIT 200");
    expect(ADMIN_REPORTS_LIST_SQL).toContain("ORDER BY r.created_at DESC");
    expect(ADMIN_REPORTS_LIST_SQL).toContain("FROM reports r");
    expect(ADMIN_REPORTS_LIST_SQL).toContain("status IN ('open', 'pending')");
    expect(ADMIN_REPORTS_LIST_SQL).not.toContain("password_hash");
    expect(ADMIN_REPORTS_LIST_SQL).not.toContain("elix_reports");
    expect(ADMIN_REPORTS_LIST_SQL).not.toContain("${");
  });

  it("accepts only the established status filter and mutation enums", () => {
    expect(parseAdminReportsFilter(undefined)).toBeNull();
    expect(parseAdminReportsFilter("")).toBeNull();
    expect(parseAdminReportsFilter("pending")).toBe("pending");
    expect(parseAdminReportsFilter("actioned")).toBe("actioned");
    expect(() => parseAdminReportsFilter("resolved")).toThrow(/Invalid status/);
    expect(() => parseAdminReportsFilter(12)).toThrow(/Invalid status/);
    expect(parseAdminReportStatus("actioned")).toBe("actioned");
    expect(() => parseAdminReportStatus("resolved")).toThrow(/Invalid status/);
    expect(() => parseAdminReportStatus("open")).toThrow(/Invalid status/);
    expect(parseOptionalAdminReportAction("warned")).toBe("warned");
    expect(parseOptionalAdminReportAction(undefined)).toBeNull();
    expect(() => parseOptionalAdminReportAction("ban")).toThrow(/Invalid action/);
    expect(parseOptionalAdminNote("Outcome: warned")).toBe("Outcome: warned");
    expect(() => parseOptionalAdminNote("x".repeat(ADMIN_REPORTS_NOTE_MAX + 1))).toThrow(/too long/);
    expect(isAdminReportId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isAdminReportId("not-a-uuid")).toBe(false);
  });

  it("keeps the established warning text and does not invent a strike or ban", () => {
    expect(ADMIN_REPORTS_WARNING_TITLE).toBe("Content warning");
    expect(ADMIN_REPORTS_WARNING_BODY).toContain("community guidelines");
    expect(ADMIN_REPORTS_WARNING_BODY).toContain("Repeated violations can lead to a ban");
  });
});
