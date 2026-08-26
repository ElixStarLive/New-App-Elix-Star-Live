import type {
  CreatorBalance,
  CreatorLedgerRow,
  CreatorPayoutAccount,
  CreatorPayoutMethod,
  CreatorWithdrawalRow,
} from "@shared/contracts";
import type { CreatorPayoutApiFailure } from "./creatorPayoutApi";

export type CreatorPayoutKind = "loading" | "ready" | "error";

export type CreatorPayoutView = {
  kind: CreatorPayoutKind;
  balance: CreatorBalance | null;
  methods: CreatorPayoutMethod[];
  withdrawals: CreatorWithdrawalRow[];
  ledger: CreatorLedgerRow[];
  account: CreatorPayoutAccount | null;
  connectStatus: string;
  error: string | null;
  withdrawing: boolean;
  savingMethod: boolean;
  onboarding: boolean;
};

export const CREATOR_PAYOUT_LOAD_ERROR = "Failed to load payout info";

type LoadOk = {
  ok: true;
  balance: CreatorBalance;
  methods: CreatorPayoutMethod[];
  withdrawals: CreatorWithdrawalRow[];
  ledger: CreatorLedgerRow[];
  account: CreatorPayoutAccount;
};

type CreatorPayoutDeps = {
  getAccountId: () => string | null;
  loadSnapshot: () => Promise<LoadOk | CreatorPayoutApiFailure>;
  saveMethod: (body: {
    type: "bank" | "paypal";
    details: Record<string, string>;
  }) => Promise<{ ok: true } | CreatorPayoutApiFailure>;
  withdraw: (body: {
    amount_pence: number;
    idempotency_key: string;
  }) => Promise<{ ok: true; status: string; already_exists: boolean } | CreatorPayoutApiFailure>;
  onboard: () => Promise<{ ok: true; onboardingUrl: string } | CreatorPayoutApiFailure>;
  openOnboardingUrl: (url: string) => Promise<void>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView: CreatorPayoutView = {
  kind: "loading",
  balance: null,
  methods: [],
  withdrawals: [],
  ledger: [],
  account: null,
  connectStatus: "unknown",
  error: null,
  withdrawing: false,
  savingMethod: false,
  onboarding: false,
};

function connectStatusFromAccount(account: CreatorPayoutAccount): string {
  return account.payouts_enabled === true ? "ready" : account.status;
}

export function createCreatorPayoutSession(deps: CreatorPayoutDeps) {
  let view: CreatorPayoutView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  let withdrawInFlight = false;
  let saveInFlight = false;
  let onboardInFlight = false;
  let connectReturnPending = false;
  let withdrawIdem: { key: string; amountPence: number } | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const assign = (next: Partial<CreatorPayoutView>) => {
    view = { ...view, ...next };
    emit();
  };

  const expireIfNeeded = (sessionExpired: boolean) => {
    if (sessionExpired) deps.onSessionExpired();
  };

  const applyReady = (snapshot: LoadOk) => {
    assign({
      kind: "ready",
      balance: snapshot.balance,
      methods: snapshot.methods,
      withdrawals: snapshot.withdrawals,
      ledger: snapshot.ledger,
      account: snapshot.account,
      connectStatus: connectStatusFromAccount(snapshot.account),
      error: null,
    });
  };

  const load = async (nextAccountId: string | null) => {
    if (nextAccountId !== accountId) {
      accountId = nextAccountId;
      withdrawInFlight = false;
      saveInFlight = false;
      onboardInFlight = false;
      connectReturnPending = false;
      withdrawIdem = null;
      view = { ...emptyView };
      emit();
    } else if (view.kind !== "ready") {
      assign({
        kind: "loading",
        balance: null,
        methods: [],
        withdrawals: [],
        ledger: [],
        account: null,
        error: null,
      });
    }
    const gen = ++generation;
    if (!nextAccountId) {
      if (gen !== generation) return;
      assign({
        kind: "error",
        balance: null,
        methods: [],
        withdrawals: [],
        ledger: [],
        account: null,
        error: CREATOR_PAYOUT_LOAD_ERROR,
      });
      return;
    }
    const result = await deps.loadSnapshot();
    if (gen !== generation || deps.getAccountId() !== nextAccountId) return;
    if (result.ok) {
      applyReady(result);
      return;
    }
    expireIfNeeded(result.sessionExpired);
    assign({
      kind: "error",
      balance: null,
      methods: [],
      withdrawals: [],
      ledger: [],
      account: null,
      error: result.error || CREATOR_PAYOUT_LOAD_ERROR,
    });
  };

  const reloadSilent = async () => {
    const expectedAccountId = accountId;
    if (!expectedAccountId) return;
    // Bump generation so an older in-flight load/snapshot cannot overwrite
    // a newer post-withdraw / post-onboard authoritative balance.
    const gen = ++generation;
    const result = await deps.loadSnapshot();
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
    if (result.ok) {
      applyReady(result);
      return;
    }
    expireIfNeeded(result.sessionExpired);
    deps.toast(result.error || CREATOR_PAYOUT_LOAD_ERROR);
  };

  const saveMethod = async (body: { type: "bank" | "paypal"; details: Record<string, string> }) => {
    if (saveInFlight || view.kind !== "ready") return false;
    const expectedAccountId = accountId;
    const gen = generation;
    saveInFlight = true;
    assign({ savingMethod: true });
    const result = await deps.saveMethod(body);
    saveInFlight = false;
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return false;
    assign({ savingMethod: false });
    if (!result.ok) {
      expireIfNeeded(result.sessionExpired);
      deps.toast(result.error || "Could not save payout method");
      return false;
    }
    deps.toast("Payout method saved");
    await reloadSilent();
    return true;
  };

  const withdraw = async (amountPence: number) => {
    if (withdrawInFlight || view.kind !== "ready") return false;
    if (!Number.isInteger(amountPence) || amountPence <= 0) {
      deps.toast("Enter a valid GBP amount");
      return false;
    }
    if (!view.methods.length) {
      deps.toast("Add a payout method first");
      return false;
    }
    if (withdrawIdem?.amountPence !== amountPence) {
      withdrawIdem = { key: crypto.randomUUID(), amountPence };
    }
    const idempotencyKey = withdrawIdem.key;
    const expectedAccountId = accountId;
    const gen = generation;
    withdrawInFlight = true;
    assign({ withdrawing: true });
    const result = await deps.withdraw({
      amount_pence: amountPence,
      idempotency_key: idempotencyKey,
    });
    withdrawInFlight = false;
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return false;
    assign({ withdrawing: false });
    if (!result.ok) {
      expireIfNeeded(result.sessionExpired);
      deps.toast(result.error || "Withdraw failed");
      return false;
    }
    withdrawIdem = null;
    deps.toast(result.already_exists ? "Withdrawal already submitted" : "GBP withdrawal requested");
    await reloadSilent();
    return true;
  };

  const startOnboard = async () => {
    if (onboardInFlight || view.connectStatus === "ready") return;
    const expectedAccountId = accountId;
    const gen = generation;
    onboardInFlight = true;
    assign({ onboarding: true });
    const result = await deps.onboard();
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) {
      onboardInFlight = false;
      return;
    }
    if (!result.ok) {
      onboardInFlight = false;
      assign({ onboarding: false });
      expireIfNeeded(result.sessionExpired);
      deps.toast(result.error || "Stripe Connect unavailable");
      return;
    }
    try {
      connectReturnPending = true;
      await deps.openOnboardingUrl(result.onboardingUrl);
    } catch {
      connectReturnPending = false;
      deps.toast("Could not open Stripe Connect");
    } finally {
      onboardInFlight = false;
      if (gen === generation && deps.getAccountId() === expectedAccountId) {
        assign({ onboarding: false });
      }
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
    reloadSilent,
    finishConnectReturn: () => {
      if (!connectReturnPending) return;
      connectReturnPending = false;
      void reloadSilent();
    },
    saveMethod,
    withdraw,
    startOnboard,
  };
}

export type CreatorPayoutSession = ReturnType<typeof createCreatorPayoutSession>;
