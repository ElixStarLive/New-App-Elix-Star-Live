import { describe, expect, it, vi } from "vitest";
import { REPORT_SUBMIT_ERROR, createReportSession } from "./reportSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId: string | null = userA) {
  let current = accountId;
  const createReport = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const session = createReportSession({
    getAccountId: () => current,
    createReport,
    toast,
    onSessionExpired,
  });
  session.bindAccount(accountId);
  return {
    session,
    createReport,
    toast,
    onSessionExpired,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-046 report session", () => {
  it("does not submit without a reason or a signed-in account", async () => {
    const signedOut = createDeps(null);
    signedOut.session.setReason("spam");
    await signedOut.session.submit("video", "video-1");
    expect(signedOut.createReport).not.toHaveBeenCalled();
    expect(signedOut.toast).toHaveBeenCalledWith("Please sign in to submit a report.");

    const missingReason = createDeps();
    await missingReason.session.submit("video", "video-1");
    expect(missingReason.createReport).not.toHaveBeenCalled();
    expect(missingReason.toast).toHaveBeenCalledWith("Please select a reason");
  });

  it("locks duplicate submit taps and only succeeds after { ok: true, id }", async () => {
    const deps = createDeps();
    deps.session.setReason("spam");
    deps.session.setDetails("  extra context  ");
    const hold = deferred<{ ok: true; id: string }>();
    deps.createReport.mockReturnValueOnce(hold.promise);
    const first = deps.session.submit("video", "video-1");
    const second = deps.session.submit("video", "video-1");
    expect(deps.session.getSnapshot().kind).toBe("submitting");
    await second;
    expect(deps.createReport).toHaveBeenCalledTimes(1);
    expect(deps.createReport).toHaveBeenCalledWith({
      targetType: "video",
      targetId: "video-1",
      reason: "spam",
      details: "extra context",
    });
    hold.resolve({ ok: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    await first;
    expect(deps.session.getSnapshot().kind).toBe("success");
  });

  it("keeps an API failure as error, not submitted", async () => {
    const deps = createDeps();
    deps.session.setReason("harassment");
    deps.createReport.mockResolvedValueOnce({
      ok: false,
      error: REPORT_SUBMIT_ERROR,
      sessionExpired: false,
    });
    await deps.session.submit("user", userB);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      error: REPORT_SUBMIT_ERROR,
    });
    expect(deps.onSessionExpired).not.toHaveBeenCalled();
  });

  it("expires only an unauthenticated submit failure", async () => {
    const deps = createDeps();
    deps.session.setReason("spam");
    deps.createReport.mockResolvedValueOnce({
      ok: false,
      error: "Please sign in to submit a report.",
      sessionExpired: true,
    });
    await deps.session.submit("support", "support_ticket");
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(deps.session.getSnapshot().kind).toBe("error");
  });

  it("drops a late User A success after User B is active", async () => {
    const deps = createDeps(userA);
    deps.session.setReason("spam");
    const first = deferred<{ ok: true; id: string }>();
    deps.createReport.mockReturnValueOnce(first.promise);
    const submitA = deps.session.submit("video", "video-a");
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    expect(deps.session.getSnapshot().kind).toBe("form");
    first.resolve({ ok: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    await submitA;
    expect(deps.session.getSnapshot().kind).toBe("form");
    expect(deps.session.getSnapshot().reason).toBe("");
  });

  it("caps details at 500 and never treats loading as success", async () => {
    const deps = createDeps();
    deps.session.setDetails("x".repeat(520));
    expect(deps.session.getSnapshot().details).toHaveLength(500);
    deps.session.setReason("other");
    const hold = deferred<{ ok: true; id: string }>();
    deps.createReport.mockReturnValueOnce(hold.promise);
    const pending = deps.session.submit("comment", "comment-1");
    expect(deps.session.getSnapshot().kind).toBe("submitting");
    expect(deps.session.getSnapshot().kind).not.toBe("success");
    hold.resolve({ ok: true, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    await pending;
    expect(deps.session.getSnapshot().kind).toBe("success");
  });
});
