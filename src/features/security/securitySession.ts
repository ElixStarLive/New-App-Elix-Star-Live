export type SecurityStatusKind = "loading" | "ready" | "error";

export type SecurityView = {
  kind: SecurityStatusKind;
  enabled: boolean | null;
  busy: boolean;
  error: string | null;
};

export type SecurityStatusResult = { ok: true; enabled: boolean } | { ok: false; error: string; sessionExpired: boolean };
export type SecurityEnrollResult = { ok: true; secret: string } | { ok: false; error: string; sessionExpired: boolean };
export type SecurityVerifyResult = { ok: true; enabled: true } | { ok: false; error: string; sessionExpired: boolean };
export type SecurityDisableResult = { ok: true; enabled: false } | { ok: false; error: string; sessionExpired: boolean };

export const SECURITY_STATUS_LOADING = "Checking status…";
export const SECURITY_STATUS_ERROR = "Could not load 2FA status";
export const SECURITY_STATUS_ENABLED = "Enabled — tap to disable.";
export const SECURITY_STATUS_DISABLED = "Add an authenticator app code.";
export const SECURITY_ENROLL_SECRET_PROMPT =
  "Add this secret in your authenticator app, then tap OK and enter a code.";
export const SECURITY_ENROLL_CODE_PROMPT = "Enter the 6-digit code from your authenticator app";
export const SECURITY_DISABLE_CODE_PROMPT = "Enter your authenticator code to disable 2FA";

type SecurityDeps = {
  getAccountId: () => string | null;
  loadStatus: () => Promise<SecurityStatusResult>;
  enroll: () => Promise<SecurityEnrollResult>;
  verify: (code: string) => Promise<SecurityVerifyResult>;
  disable: (code: string) => Promise<SecurityDisableResult>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView: SecurityView = {
  kind: "loading",
  enabled: null,
  busy: false,
  error: null,
};

export function securityTwoFactorDescription(view: SecurityView): string {
  if (view.kind === "loading") return SECURITY_STATUS_LOADING;
  if (view.kind === "error") return SECURITY_STATUS_ERROR;
  if (view.enabled === true) return SECURITY_STATUS_ENABLED;
  return SECURITY_STATUS_DISABLED;
}

export function normalizeSecurityTotpInput(raw: string): string {
  return raw.replace(/\s/g, "");
}

export function createSecuritySession(deps: SecurityDeps) {
  let view: SecurityView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  let actionLock = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const assign = (next: Partial<SecurityView>) => {
    view = { ...view, ...next };
    emit();
  };

  const expireIfNeeded = (sessionExpired: boolean) => {
    if (sessionExpired) deps.onSessionExpired();
  };

  const reconcileStatus = async (expectedAccountId: string | null, gen: number) => {
    const result = await deps.loadStatus();
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
    if (result.ok) {
      assign({ kind: "ready", enabled: result.enabled, error: null });
      return;
    }
    expireIfNeeded(result.sessionExpired);
    deps.toast(result.error || SECURITY_STATUS_ERROR);
    assign({ kind: "error", enabled: null, error: SECURITY_STATUS_ERROR });
  };

  const load = async (nextAccountId: string | null) => {
    if (nextAccountId !== accountId) {
      accountId = nextAccountId;
      view = { ...emptyView };
      emit();
    } else if (view.kind !== "ready") {
      assign({ kind: "loading", enabled: null, error: null });
    }
    const gen = ++generation;
    if (!nextAccountId) {
      if (gen !== generation) return;
      assign({ kind: "error", enabled: null, error: SECURITY_STATUS_ERROR });
      return;
    }
    await reconcileStatus(nextAccountId, gen);
  };

  const enrollFlow = async () => {
    const expectedAccountId = accountId;
    const enrolled = await deps.enroll();
    if (deps.getAccountId() !== expectedAccountId) return;
    if (!enrolled.ok) {
      expireIfNeeded(enrolled.sessionExpired);
      deps.toast(enrolled.error || "Could not start 2FA enrollment");
      return;
    }
    const secret = enrolled.secret;
    await deps.prompt(SECURITY_ENROLL_SECRET_PROMPT, secret);
    if (deps.getAccountId() !== expectedAccountId) return;
    const entered = await deps.prompt(SECURITY_ENROLL_CODE_PROMPT, "");
    if (deps.getAccountId() !== expectedAccountId) return;
    if (entered == null) return;
    const code = normalizeSecurityTotpInput(entered);
    if (!code) {
      deps.toast("Code required — 2FA was not enabled");
      return;
    }
    const verified = await deps.verify(code);
    if (deps.getAccountId() !== expectedAccountId) return;
    if (!verified.ok) {
      expireIfNeeded(verified.sessionExpired);
      deps.toast(verified.error || "Invalid code — 2FA was not enabled");
      return;
    }
    await reconcileStatus(expectedAccountId, generation);
    if (deps.getAccountId() !== expectedAccountId) return;
    if (view.kind === "ready" && view.enabled === true) {
      deps.toast("Two-factor authentication enabled");
    }
  };

  const disableFlow = async () => {
    const expectedAccountId = accountId;
    const entered = await deps.prompt(SECURITY_DISABLE_CODE_PROMPT, "");
    if (deps.getAccountId() !== expectedAccountId) return;
    if (entered == null) return;
    const code = normalizeSecurityTotpInput(entered);
    if (!code) {
      deps.toast("Code required");
      return;
    }
    const disabled = await deps.disable(code);
    if (deps.getAccountId() !== expectedAccountId) return;
    if (!disabled.ok) {
      expireIfNeeded(disabled.sessionExpired);
      deps.toast(disabled.error || "Could not disable 2FA");
      return;
    }
    await reconcileStatus(expectedAccountId, generation);
    if (deps.getAccountId() !== expectedAccountId) return;
    if (view.kind === "ready" && view.enabled === false) {
      deps.toast("Two-factor authentication disabled");
    }
  };

  const toggle = async () => {
    if (actionLock || view.busy || view.kind === "loading") return;
    if (view.kind === "error") {
      await load(deps.getAccountId());
      return;
    }
    if (view.kind !== "ready" || view.enabled == null) return;
    actionLock = true;
    assign({ busy: true });
    try {
      if (view.enabled) await disableFlow();
      else await enrollFlow();
    } finally {
      actionLock = false;
      assign({ busy: false });
    }
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    toggle,
  };
}
