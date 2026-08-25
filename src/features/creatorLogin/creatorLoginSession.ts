import { authResendConfirmation } from "@/features/auth/authSession";
import {
  browserCreatorAccountStorage,
  clearAllLegacyCreatorLoginKeys,
  migrateLegacyCreatorLoginKeys,
  readCreatorSavePref,
  removeCreatorSavedAccount,
  upsertCreatorSavedAccount,
  writeCreatorSavePref,
  writeCreatorSavedAccounts,
  type CreatorAccountStorage,
  type SavedCreatorAccount,
} from "./creatorSavedAccounts";

export type CreatorLoginSnapshot = {
  accounts: SavedCreatorAccount[];
  savePref: boolean;
  email: string;
  username: string;
  password: string;
  showPassword: boolean;
  error: string | null;
  info: string | null;
  showResend: boolean;
  submitting: boolean;
  resending: boolean;
  switching: boolean;
};

type Listener = () => void;

const empty: CreatorLoginSnapshot = {
  accounts: [],
  savePref: false,
  email: "",
  username: "",
  password: "",
  showPassword: false,
  error: null,
  info: null,
  showResend: false,
  submitting: false,
  resending: false,
  switching: false,
};

function localPart(email: string): string {
  return email.split("@")[0] || email;
}

export function createCreatorLoginSession(storage: CreatorAccountStorage = browserCreatorAccountStorage()) {
  let accounts: SavedCreatorAccount[] = [];
  let savePref = false;
  let email = "";
  let username = "";
  let password = "";
  let showPassword = false;
  let error: string | null = null;
  let info: string | null = null;
  let showResend = false;
  let submitting = false;
  let resending = false;
  let switching = false;
  let submitGen = 0;
  const listeners = new Set<Listener>();
  let cached: CreatorLoginSnapshot = { ...empty };

  const snapshot = (): CreatorLoginSnapshot => cached;

  const notify = () => {
    cached = {
      accounts,
      savePref,
      email,
      username,
      password,
      showPassword,
      error,
      info,
      showResend,
      submitting,
      resending,
      switching,
    };
    for (const fn of listeners) fn();
  };

  const persistAccounts = (next: SavedCreatorAccount[]) => {
    accounts = next;
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    hydrate(viewerEmail?: string) {
      submitGen += 1;
      accounts = migrateLegacyCreatorLoginKeys(storage);
      savePref = readCreatorSavePref(storage);
      if (!email) email = accounts[0]?.identifier || viewerEmail || "";
      if (!username) username = accounts[0]?.username || (email ? localPart(email) : "");
      password = "";
      error = null;
      info = null;
      showResend = false;
      submitting = false;
      resending = false;
      switching = false;
      notify();
    },
    setEmail(value: string) {
      email = value;
      notify();
    },
    setUsername(value: string) {
      username = value;
      notify();
    },
    setPassword(value: string) {
      password = value;
      notify();
    },
    toggleShowPassword() {
      showPassword = !showPassword;
      notify();
    },
    setSavePref(enabled: boolean, viewer?: { email: string; username: string; avatarUrl?: string | null }) {
      savePref = enabled;
      writeCreatorSavePref(storage, enabled);
      clearAllLegacyCreatorLoginKeys(storage);
      if (enabled) {
        const identifier = email.trim() || viewer?.email || "";
        if (identifier) {
          const name =
            username.trim() ||
            (identifier === viewer?.email ? viewer.username : localPart(identifier));
          const avatar =
            identifier === viewer?.email && viewer.avatarUrl ? viewer.avatarUrl : undefined;
          persistAccounts(upsertCreatorSavedAccount(storage, { identifier, username: name, avatar }));
        }
      } else {
        persistAccounts(writeCreatorSavedAccounts(storage, []));
      }
      notify();
    },
    removeAccount(identifier: string) {
      persistAccounts(removeCreatorSavedAccount(storage, identifier));
      notify();
    },
    selectAccount(identifier: string) {
      submitGen += 1;
      submitting = false;
      const account = accounts.find((row) => row.identifier === identifier);
      email = identifier;
      username = account?.username || localPart(identifier);
      password = "";
      error = null;
      info = null;
      showResend = false;
      notify();
    },
    clearForAdd() {
      submitGen += 1;
      submitting = false;
      email = "";
      username = "";
      password = "";
      error = null;
      info = null;
      showResend = false;
      notify();
    },
    async login(
      signIn: (email: string, password: string) => Promise<{ error: string | null }>,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      if (submitting) return { ok: false, error: "busy" };
      const gen = ++submitGen;
      const trimmedEmail = email.trim();
      const trimmedUsername = username.trim() || localPart(trimmedEmail);
      submitting = true;
      error = null;
      info = null;
      showResend = false;
      notify();
      const res = await signIn(trimmedEmail, password);
      if (gen !== submitGen) return { ok: false, error: "stale" };
      submitting = false;
      if (res.error) {
        const lower = res.error.toLowerCase();
        if (lower === "aborted" || lower.includes("aborted")) {
          notify();
          return { ok: false as const, error: "aborted" };
        }
        const message = lower.includes("email not confirmed")
          ? "Email not confirmed. Check your inbox and confirm your account, then try again."
          : res.error;
        error = message;
        // Only unconfirmed-email cases — never match generic "Invalid email or password".
        showResend =
          message.toLowerCase().includes("email not confirmed") ||
          /confirm your (email|account)|verify your email|email verification/i.test(res.error);
        notify();
        return { ok: false as const, error: message };
      }
      savePref = true;
      writeCreatorSavePref(storage, true);
      persistAccounts(
        upsertCreatorSavedAccount(storage, {
          identifier: trimmedEmail,
          username: trimmedUsername,
        }),
      );
      clearAllLegacyCreatorLoginKeys(storage);
      password = "";
      notify();
      return { ok: true };
    },
    async resendConfirmation(): Promise<{ ok: true } | { ok: false; error: string }> {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        error = "Please enter your email first.";
        notify();
        return { ok: false, error };
      }
      if (resending) return { ok: false, error: "busy" };
      resending = true;
      error = null;
      info = null;
      notify();
      const res = await authResendConfirmation(trimmedEmail);
      resending = false;
      if (!res.ok) {
        error = res.error;
        notify();
        return { ok: false, error: res.error };
      }
      info = "Confirmation email resent. Check your Inbox and Spam folders.";
      notify();
      return { ok: true };
    },
    async signOutAndStay(signOut: () => Promise<void>): Promise<void> {
      switching = true;
      notify();
      await signOut();
      password = "";
      switching = false;
      notify();
    },
    dispose() {
      submitGen += 1;
      password = "";
      error = null;
      info = null;
      showResend = false;
      submitting = false;
      resending = false;
      switching = false;
      notify();
    },
  };
}

export type CreatorLoginSession = ReturnType<typeof createCreatorLoginSession>;
