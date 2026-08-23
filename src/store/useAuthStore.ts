import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { SessionUser } from "@shared/contracts";
import { setSessionToken } from "@/lib/sessionToken";
import { platform } from "@/lib/platform";
import {
  authAppleNative,
  authGetMe,
  authLoginWithPassword,
  authLogout,
  authRegister,
  displayLoginError,
} from "@/features/auth/authSession";
import { isolateVideoCallAccount } from "@/features/calls/videoCallSession";
import { unregisterCurrentDeviceToken } from "@/features/notifications/deviceTokenSession";
import { isolateWalletAccount } from "@/features/wallet/accountIsolation";

type AuthSession = {
  token: string;
};

type AuthStore = {
  user: SessionUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastError: string | null;
  signInWithPassword: (emailOrUsername: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<{
    error: string | null;
    needsEmailConfirmation?: boolean;
    confirmationEmailSent?: boolean;
    welcomeMessage?: string;
  }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  checkUser: () => Promise<void>;
  updateUser: (updates: Partial<SessionUser>) => void;
  clearLastError: () => void;
};

const AUTH_STORAGE_KEY = "elix-auth";

function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

const authStateStorage: StateStorage = {
  getItem: async (name) => {
    if (isNativeRuntime()) {
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      const nativeValue = await Preferences.get({ key: name });
      return nativeValue.value ?? null;
    }
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (isNativeRuntime()) {
      await Preferences.set({ key: name, value });
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof window !== "undefined") window.localStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (isNativeRuntime()) {
      await Preferences.remove({ key: name });
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(name);
  },
};

function applySession(token: string | null, user: SessionUser | null) {
  setSessionToken(token);
  return {
    session: token ? { token } : null,
    user,
    isAuthenticated: Boolean(token && user),
    isLoading: false,
    lastError: null as string | null,
  };
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: true,
      lastError: null,

      signInWithPassword: async (emailOrUsername, password) => {
        const result = await authLoginWithPassword(emailOrUsername, password);
        if (!result.ok) {
          return { error: displayLoginError(result.error) };
        }
        isolateWalletAccount();
        set(applySession(result.token, result.user));
        return { error: null };
      },

      signUpWithPassword: async (email, password, username) => {
        const result = await authRegister({
          email,
          password,
          username,
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        });
        if (!result.ok) return { error: result.error };
        if (result.needsEmailConfirmation || !result.token) {
          return {
            error: null,
            needsEmailConfirmation: true,
            confirmationEmailSent: result.confirmationEmailSent,
            welcomeMessage: result.welcomeMessage,
          };
        }
        isolateWalletAccount();
        set(applySession(result.token, result.user));
        return {
          error: null,
          needsEmailConfirmation: false,
          confirmationEmailSent: false,
          welcomeMessage: result.welcomeMessage,
        };
      },

      signInWithApple: async () => {
        if (!platform.isNative || !platform.isIOS) {
          return { error: "Sign in with Apple is available in the iOS app." };
        }
        try {
          const { SocialLogin } = await import("@capgo/capacitor-social-login");
          await SocialLogin.initialize({
            apple: { clientId: "com.elixstarlive.app", redirectUrl: "", useProperTokenExchange: false },
          });
          const state = globalThis.crypto.randomUUID();
          const apple = await SocialLogin.login({
            provider: "apple",
            options: { scopes: ["email", "name"], state },
          });
          const appleResult = apple.result;
          if (!appleResult || typeof appleResult !== "object" || !("idToken" in appleResult) || !appleResult.idToken) {
            return { error: "Apple did not return a valid identity token." };
          }
          const profile =
            "profile" in appleResult && appleResult.profile && typeof appleResult.profile === "object"
              ? (appleResult.profile as { givenName?: string | null; familyName?: string | null })
              : {};
          const parsed = await authAppleNative({
            idToken: String(appleResult.idToken),
            givenName: profile.givenName,
            familyName: profile.familyName,
          });
          if (!parsed.ok) return { error: parsed.error };
          isolateWalletAccount();
          set(applySession(parsed.token, parsed.user));
          return { error: null };
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
          if (code === "USER_CANCELLED") return { error: "Apple sign-in cancelled." };
          return { error: err instanceof Error ? err.message : "Apple sign-in failed." };
        }
      },

      signOut: async () => {
        await unregisterCurrentDeviceToken();
        const result = await authLogout();
        isolateVideoCallAccount();
        isolateWalletAccount();
        setSessionToken(null);
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          lastError: result.ok ? null : result.error,
        });
      },

      checkUser: async () => {
        const token = get().session?.token ?? null;
        setSessionToken(token);
        if (!token) {
          isolateWalletAccount();
          set({ user: null, session: null, isAuthenticated: false, isLoading: false });
          return;
        }
        const me = await authGetMe();
        if (!me.ok) {
          if (me.isAuthFailure) {
            isolateWalletAccount();
            setSessionToken(null);
            set({ user: null, session: null, isAuthenticated: false, isLoading: false, lastError: me.error });
            return;
          }
          set({ isLoading: false, lastError: me.error });
          return;
        }
        const nextToken = me.token || token;
        const currentUserId = get().user?.id;
        if (currentUserId && currentUserId !== me.user.id) isolateWalletAccount();
        set(applySession(nextToken, me.user));
      },

      updateUser: (updates) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...updates } });
      },

      clearLastError: () => set({ lastError: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => authStateStorage),
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        setSessionToken(state?.session?.token ?? null);
      },
    },
  ),
);
