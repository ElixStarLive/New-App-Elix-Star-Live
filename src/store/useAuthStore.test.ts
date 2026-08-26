// @vitest-environment jsdom
import type { SessionUser } from "@shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authLoginWithPassword: vi.fn(),
  authRegister: vi.fn(),
  authLogout: vi.fn(),
  authGetMe: vi.fn(),
  authAppleNative: vi.fn(),
  platform: { isNative: false, isIOS: false, isAndroid: false, isWeb: true, name: "web" as const },
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.platform.isNative } }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/platform", () => ({ platform: mocks.platform }));
vi.mock("@/features/auth/authSession", () => ({
  authLoginWithPassword: mocks.authLoginWithPassword,
  authRegister: mocks.authRegister,
  authLogout: mocks.authLogout,
  authGetMe: mocks.authGetMe,
  authAppleNative: mocks.authAppleNative,
}));

import { getSessionToken, setSessionToken } from "@/lib/sessionToken";
import { useAuthStore } from "./useAuthStore";

function user(partial: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "andrei",
    displayName: "Andrei",
    avatarUrl: null,
    bio: "",
    isVerified: false,
    followerCount: 0,
    followingCount: 0,
    email: "andrei@example.com",
    isAdmin: false,
    emailConfirmed: true,
    ...partial,
  };
}

describe("useAuthStore", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.authLoginWithPassword,
      mocks.authRegister,
      mocks.authLogout,
      mocks.authGetMe,
      mocks.authAppleNative,
    ]) {
      mock.mockReset();
    }
    mocks.platform.isNative = false;
    mocks.platform.isIOS = false;
    setSessionToken(null);
    useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isLoading: false, lastError: null });
  });

  describe("signInWithPassword", () => {
    it("stores the session and shares the token with the api client", async () => {
      mocks.authLoginWithPassword.mockResolvedValue({ ok: true, token: "tok-1", user: user() });
      await expect(useAuthStore.getState().signInWithPassword("andrei", "secret")).resolves.toEqual({ error: null });
      expect(useAuthStore.getState()).toMatchObject({
        session: { token: "tok-1" },
        isAuthenticated: true,
        isLoading: false,
        lastError: null,
      });
      expect(useAuthStore.getState().user?.username).toBe("andrei");
      expect(getSessionToken()).toBe("tok-1");
    });

    it("stays signed out and returns the error on a failed login", async () => {
      mocks.authLoginWithPassword.mockResolvedValue({ ok: false, error: "Invalid login credentials." });
      await expect(useAuthStore.getState().signInWithPassword("andrei", "wrong")).resolves.toEqual({
        error: "Invalid login credentials.",
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(getSessionToken()).toBeNull();
    });
  });

  describe("signUpWithPassword", () => {
    it("passes the age and consent flags to the api", async () => {
      mocks.authRegister.mockResolvedValue({ ok: true, token: "tok-2", user: user() });
      await useAuthStore.getState().signUpWithPassword("andrei@example.com", "secret", "andrei");
      expect(mocks.authRegister).toHaveBeenCalledWith({
        email: "andrei@example.com",
        password: "secret",
        username: "andrei",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      });
    });

    it("signs the new user in when the api returns a token", async () => {
      mocks.authRegister.mockResolvedValue({ ok: true, token: "tok-2", user: user(), welcomeMessage: "Welcome" });
      await expect(useAuthStore.getState().signUpWithPassword("andrei@example.com", "secret")).resolves.toEqual({
        error: null,
        needsEmailConfirmation: false,
        confirmationEmailSent: false,
        welcomeMessage: "Welcome",
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it("does not sign in when email confirmation is required", async () => {
      mocks.authRegister.mockResolvedValue({
        ok: true,
        needsEmailConfirmation: true,
        confirmationEmailSent: true,
        welcomeMessage: "Check your inbox",
      });
      await expect(useAuthStore.getState().signUpWithPassword("andrei@example.com", "secret")).resolves.toEqual({
        error: null,
        needsEmailConfirmation: true,
        confirmationEmailSent: true,
        welcomeMessage: "Check your inbox",
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(getSessionToken()).toBeNull();
    });

    it("treats a missing token as needing confirmation", async () => {
      mocks.authRegister.mockResolvedValue({ ok: true, token: "", user: user() });
      await expect(useAuthStore.getState().signUpWithPassword("andrei@example.com", "secret")).resolves.toMatchObject({
        needsEmailConfirmation: true,
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("returns the registration error", async () => {
      mocks.authRegister.mockResolvedValue({ ok: false, error: "Email already registered." });
      await expect(useAuthStore.getState().signUpWithPassword("andrei@example.com", "secret")).resolves.toEqual({
        error: "Email already registered.",
      });
    });
  });

  describe("signInWithApple", () => {
    it("is rejected outside the iOS app", async () => {
      await expect(useAuthStore.getState().signInWithApple()).resolves.toEqual({
        error: "Sign in with Apple is available in the iOS app.",
      });
      expect(mocks.authAppleNative).not.toHaveBeenCalled();
    });
  });

  describe("signOut", () => {
    it("clears the session even when the api call fails", async () => {
      mocks.authLoginWithPassword.mockResolvedValue({ ok: true, token: "tok-1", user: user() });
      await useAuthStore.getState().signInWithPassword("andrei", "secret");

      mocks.authLogout.mockResolvedValue({ ok: false, error: "Logout failed" });
      await useAuthStore.getState().signOut();
      expect(useAuthStore.getState()).toMatchObject({
        user: null,
        session: null,
        isAuthenticated: false,
        lastError: "Logout failed",
      });
      expect(getSessionToken()).toBeNull();
    });

    it("leaves no error behind on a clean sign out", async () => {
      mocks.authLogout.mockResolvedValue({ ok: true, error: null });
      await useAuthStore.getState().signOut();
      expect(useAuthStore.getState().lastError).toBeNull();
    });
  });

  describe("checkUser", () => {
    it("signs out immediately when there is no stored token", async () => {
      await useAuthStore.getState().checkUser();
      expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isLoading: false });
      expect(mocks.authGetMe).not.toHaveBeenCalled();
    });

    it("refreshes the user from the api and keeps the stored token", async () => {
      useAuthStore.setState({ session: { token: "tok-1" } });
      mocks.authGetMe.mockResolvedValue({ ok: true, user: user({ displayName: "Renamed" }), token: "" });
      await useAuthStore.getState().checkUser();
      expect(useAuthStore.getState().user?.displayName).toBe("Renamed");
      expect(useAuthStore.getState().session).toEqual({ token: "tok-1" });
      expect(getSessionToken()).toBe("tok-1");
    });

    it("adopts a rotated token from the api", async () => {
      useAuthStore.setState({ session: { token: "tok-1" } });
      mocks.authGetMe.mockResolvedValue({ ok: true, user: user(), token: "tok-rotated" });
      await useAuthStore.getState().checkUser();
      expect(useAuthStore.getState().session).toEqual({ token: "tok-rotated" });
      expect(getSessionToken()).toBe("tok-rotated");
    });

    it("drops the session on an auth failure", async () => {
      useAuthStore.setState({ session: { token: "tok-1" }, user: user(), isAuthenticated: true });
      mocks.authGetMe.mockResolvedValue({ ok: false, isAuthFailure: true, error: "Session expired" });
      await useAuthStore.getState().checkUser();
      expect(useAuthStore.getState()).toMatchObject({
        user: null,
        session: null,
        isAuthenticated: false,
        lastError: "Session expired",
      });
      expect(getSessionToken()).toBeNull();
    });

    it("keeps the session on a transient network failure", async () => {
      useAuthStore.setState({ session: { token: "tok-1" }, user: user(), isAuthenticated: true, isLoading: true });
      mocks.authGetMe.mockResolvedValue({ ok: false, isAuthFailure: false, error: "Network error" });
      await useAuthStore.getState().checkUser();
      expect(useAuthStore.getState()).toMatchObject({
        isAuthenticated: true,
        isLoading: false,
        lastError: "Network error",
      });
      expect(getSessionToken()).toBe("tok-1");
    });
  });

  describe("updateUser and clearLastError", () => {
    it("merges updates into the signed-in user only", () => {
      useAuthStore.getState().updateUser({ displayName: "Ignored" });
      expect(useAuthStore.getState().user).toBeNull();

      useAuthStore.setState({ user: user() });
      useAuthStore.getState().updateUser({ displayName: "New Name", bio: "hello" });
      expect(useAuthStore.getState().user).toMatchObject({
        username: "andrei",
        displayName: "New Name",
        bio: "hello",
      });
    });

    it("clears the last error", () => {
      useAuthStore.setState({ lastError: "boom" });
      useAuthStore.getState().clearLastError();
      expect(useAuthStore.getState().lastError).toBeNull();
    });
  });
});
