import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeConfirm = vi.hoisted(() => vi.fn());
const authDeleteAccount = vi.hoisted(() => vi.fn());

vi.mock("@/components/NativeDialog", () => ({
  nativeConfirm: (...args: unknown[]) => nativeConfirm(...args),
}));
vi.mock("@/features/auth/authSession", () => ({
  authDeleteAccount: () => authDeleteAccount(),
}));

import { requestSettingsDeleteAccount, requestSettingsLogout, resetSettingsActionLocksForTests } from "./settingsSession";

describe("PAGE-040 settings session actions", () => {
  beforeEach(() => {
    resetSettingsActionLocksForTests();
    nativeConfirm.mockReset();
    authDeleteAccount.mockReset();
  });

  it("rejects a second logout while the first is in flight", async () => {
    let release!: () => void;
    const signOut = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = requestSettingsLogout(signOut);
    const second = await requestSettingsLogout(signOut);
    expect(second).toEqual({ started: false });
    expect(signOut).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toEqual({ started: true });
  });

  it("does not call delete when NativeDialog is cancelled", async () => {
    nativeConfirm.mockResolvedValue(false);
    const signOut = vi.fn();
    const result = await requestSettingsDeleteAccount(signOut);
    expect(result).toEqual({ cancelled: true });
    expect(authDeleteAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sends one delete request after confirm", async () => {
    nativeConfirm.mockResolvedValue(true);
    authDeleteAccount.mockResolvedValue({ ok: true });
    const signOut = vi.fn(async () => undefined);
    const first = requestSettingsDeleteAccount(signOut);
    const second = await requestSettingsDeleteAccount(signOut);
    expect(second).toEqual({ cancelled: false, ok: false, error: "Delete already in progress" });
    await expect(first).resolves.toEqual({ cancelled: false, ok: true });
    expect(authDeleteAccount).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("leaves the session intact when delete fails", async () => {
    nativeConfirm.mockResolvedValue(true);
    authDeleteAccount.mockResolvedValue({ ok: false, error: "offline" });
    const signOut = vi.fn();
    const result = await requestSettingsDeleteAccount(signOut);
    expect(result).toEqual({ cancelled: false, ok: false, error: "offline" });
    expect(signOut).not.toHaveBeenCalled();
  });
});
