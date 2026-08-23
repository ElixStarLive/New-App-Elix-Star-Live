import { describe, expect, it, vi } from "vitest";
import {
  SECURITY_DISABLE_CODE_PROMPT,
  SECURITY_ENROLL_CODE_PROMPT,
  SECURITY_ENROLL_SECRET_PROMPT,
  SECURITY_STATUS_DISABLED,
  SECURITY_STATUS_ENABLED,
  SECURITY_STATUS_ERROR,
  SECURITY_STATUS_LOADING,
  createSecuritySession,
  normalizeSecurityTotpInput,
  securityTwoFactorDescription,
} from "./securitySession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId = "user-a") {
  let current = accountId;
  const loadStatus = vi.fn();
  const enroll = vi.fn();
  const verify = vi.fn();
  const disable = vi.fn();
  const prompt = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const session = createSecuritySession({
    getAccountId: () => current,
    loadStatus,
    enroll,
    verify,
    disable,
    prompt,
    toast,
    onSessionExpired,
  });
  return {
    session,
    loadStatus,
    enroll,
    verify,
    disable,
    prompt,
    toast,
    onSessionExpired,
    setAccount: (id: string | null) => {
      current = id as string;
    },
  };
}

describe("PAGE-042 security session", () => {
  it("describes loading, error, enabled, and disabled without mixing them", () => {
    expect(securityTwoFactorDescription({ kind: "loading", enabled: null, busy: false, error: null })).toBe(
      SECURITY_STATUS_LOADING,
    );
    expect(securityTwoFactorDescription({ kind: "error", enabled: null, busy: false, error: SECURITY_STATUS_ERROR })).toBe(
      SECURITY_STATUS_ERROR,
    );
    expect(securityTwoFactorDescription({ kind: "ready", enabled: true, busy: false, error: null })).toBe(
      SECURITY_STATUS_ENABLED,
    );
    expect(securityTwoFactorDescription({ kind: "ready", enabled: false, busy: false, error: null })).toBe(
      SECURITY_STATUS_DISABLED,
    );
    expect(normalizeSecurityTotpInput("12 34 56")).toBe("123456");
  });

  it("starts loading and does not default a failed status to disabled", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot().kind).toBe("loading");
    expect(deps.session.getSnapshot().enabled).toBeNull();
    deps.loadStatus.mockResolvedValueOnce({ ok: false, error: "offline", sessionExpired: false });
    await deps.session.load("user-a");
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      enabled: null,
      error: SECURITY_STATUS_ERROR,
    });
    expect(deps.toast).toHaveBeenCalledWith("offline");
    expect(securityTwoFactorDescription(deps.session.getSnapshot())).not.toBe(SECURITY_STATUS_DISABLED);
  });

  it("drops a late User A status after User B is active", async () => {
    const deps = createDeps("user-a");
    const first = deferred<{ ok: true; enabled: boolean }>();
    deps.loadStatus.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load("user-a");
    deps.setAccount("user-b");
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    const loadB = deps.session.load("user-b");
    first.resolve({ ok: true, enabled: true });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: false });
  });

  it("enrolls then enables only after a successful verify plus status reconcile", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await deps.session.load("user-a");
    deps.enroll.mockResolvedValueOnce({ ok: true, secret: "server-secret" });
    deps.prompt.mockResolvedValueOnce("ignored").mockResolvedValueOnce("123456");
    deps.verify.mockResolvedValueOnce({ ok: true, enabled: true });
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: true });
    await deps.session.toggle();
    expect(deps.enroll).toHaveBeenCalledTimes(1);
    expect(deps.prompt).toHaveBeenNthCalledWith(1, SECURITY_ENROLL_SECRET_PROMPT, "server-secret");
    expect(deps.prompt).toHaveBeenNthCalledWith(2, SECURITY_ENROLL_CODE_PROMPT, "");
    expect(deps.verify).toHaveBeenCalledWith("123456");
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: true, busy: false });
    expect(deps.toast).toHaveBeenCalledWith("Two-factor authentication enabled");
    expect(deps.session.getSnapshot()).not.toHaveProperty("secret");
  });

  it("keeps 2FA disabled after a wrong verify code", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await deps.session.load("user-a");
    deps.enroll.mockResolvedValueOnce({ ok: true, secret: "server-secret" });
    deps.prompt.mockResolvedValueOnce("ok").mockResolvedValueOnce("000000");
    deps.verify.mockResolvedValueOnce({ ok: false, error: "Invalid authenticator code", sessionExpired: false });
    await deps.session.toggle();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: false });
    expect(deps.toast).toHaveBeenCalledWith("Invalid authenticator code");
    expect(deps.loadStatus).toHaveBeenCalledTimes(1);
  });

  it("sends one enroll when Verify is tapped rapidly", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await deps.session.load("user-a");
    const enrollWait = deferred<{ ok: true; secret: string }>();
    deps.enroll.mockReturnValueOnce(enrollWait.promise);
    const first = deps.session.toggle();
    const second = deps.session.toggle();
    enrollWait.resolve({ ok: true, secret: "server-secret" });
    deps.prompt.mockResolvedValueOnce("ok").mockResolvedValueOnce(null);
    await first;
    await second;
    expect(deps.enroll).toHaveBeenCalledTimes(1);
  });

  it("disables only after server success and leaves enabled on failure", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: true });
    await deps.session.load("user-a");
    deps.prompt.mockResolvedValueOnce("000000");
    deps.disable.mockResolvedValueOnce({ ok: false, error: "Invalid authenticator code", sessionExpired: false });
    await deps.session.toggle();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: true });
    expect(deps.toast).toHaveBeenCalledWith("Invalid authenticator code");

    deps.prompt.mockResolvedValueOnce("123456");
    deps.disable.mockResolvedValueOnce({ ok: true, enabled: false });
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await deps.session.toggle();
    expect(deps.prompt).toHaveBeenCalledWith(SECURITY_DISABLE_CODE_PROMPT, "");
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: false });
    expect(deps.toast).toHaveBeenCalledWith("Two-factor authentication disabled");
  });

  it("sends one disable when Disable is tapped rapidly", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: true });
    await deps.session.load("user-a");
    const disableWait = deferred<{ ok: true; enabled: false }>();
    deps.prompt.mockResolvedValue("123456");
    deps.disable.mockReturnValueOnce(disableWait.promise);
    const first = deps.session.toggle();
    const second = deps.session.toggle();
    disableWait.resolve({ ok: true, enabled: false });
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await first;
    await second;
    expect(deps.disable).toHaveBeenCalledTimes(1);
  });

  it("retries a failed status and signs out only on session expiry", async () => {
    const deps = createDeps();
    deps.loadStatus.mockResolvedValueOnce({
      ok: false,
      error: "Sign in required",
      sessionExpired: true,
    });
    await deps.session.load("user-a");
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(deps.session.getSnapshot().kind).toBe("error");
    deps.loadStatus.mockResolvedValueOnce({ ok: true, enabled: false });
    await deps.session.toggle();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", enabled: false });
  });
});
