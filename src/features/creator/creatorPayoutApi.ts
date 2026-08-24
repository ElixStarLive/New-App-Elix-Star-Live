import {
  creatorBalanceSchema,
  creatorLedgerResponseSchema,
  creatorOnboardResponseSchema,
  creatorPayoutAccountSchema,
  creatorPayoutMethodsResponseSchema,
  creatorWithdrawResponseSchema,
  creatorWithdrawalsResponseSchema,
  type CreatorBalance,
  type CreatorLedgerRow,
  type CreatorPayoutAccount,
  type CreatorPayoutMethod,
  type CreatorWithdrawalRow,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type CreatorPayoutApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
};

export function isCreatorPayoutSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(error: { message: string; status: number; code?: string }, fallback: string): CreatorPayoutApiFailure {
  return {
    ok: false,
    error: error.message || fallback,
    sessionExpired: isCreatorPayoutSessionFailure(error.status, error.code),
  };
}

export async function apiCreatorBalance(): Promise<{ ok: true; balance: CreatorBalance } | CreatorPayoutApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/creator/balance");
  if (error) return failure(error, "Failed to load creator balance");
  const parsed = creatorBalanceSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load creator balance", sessionExpired: false };
  }
  return { ok: true, balance: parsed.data };
}

export async function apiCreatorLedger(): Promise<{ ok: true; ledger: CreatorLedgerRow[] } | CreatorPayoutApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/creator/ledger");
  if (error) return failure(error, "Failed to load creator ledger");
  const parsed = creatorLedgerResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load creator ledger", sessionExpired: false };
  }
  return { ok: true, ledger: parsed.data.ledger };
}

export async function apiCreatorWithdrawals(): Promise<
  { ok: true; withdrawals: CreatorWithdrawalRow[] } | CreatorPayoutApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/creator/withdrawals-gbp");
  if (error) return failure(error, "Failed to load withdrawals");
  const parsed = creatorWithdrawalsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load withdrawals", sessionExpired: false };
  }
  return { ok: true, withdrawals: parsed.data.withdrawals };
}

export async function apiCreatorPayoutMethods(): Promise<
  { ok: true; methods: CreatorPayoutMethod[] } | CreatorPayoutApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/creator/payout-methods");
  if (error) return failure(error, "Failed to load payout methods");
  const parsed = creatorPayoutMethodsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load payout methods", sessionExpired: false };
  }
  return { ok: true, methods: parsed.data.methods };
}

export async function apiCreatorPayoutAccount(): Promise<
  { ok: true; account: CreatorPayoutAccount } | CreatorPayoutApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/creator/payout-account");
  if (error) return failure(error, "Failed to load Stripe Connect status");
  const parsed = creatorPayoutAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load Stripe Connect status", sessionExpired: false };
  }
  return { ok: true, account: parsed.data };
}

export async function apiCreatorSavePayoutMethod(body: {
  type: "bank" | "paypal";
  details: Record<string, string>;
}): Promise<{ ok: true } | CreatorPayoutApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/creator/payout-method", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return failure(error, "Could not save payout method");
  if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
    return { ok: false, error: "Could not save payout method", sessionExpired: false };
  }
  return { ok: true };
}

export async function apiCreatorOnboard(): Promise<
  { ok: true; onboardingUrl: string } | CreatorPayoutApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/creator/payout-account/onboard", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (error) return failure(error, "Stripe Connect unavailable");
  const parsed = creatorOnboardResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Stripe Connect unavailable", sessionExpired: false };
  }
  return { ok: true, onboardingUrl: parsed.data.onboardingUrl };
}

export async function apiCreatorPayoutSnapshot(): Promise<
  | {
      ok: true;
      balance: CreatorBalance;
      methods: CreatorPayoutMethod[];
      withdrawals: CreatorWithdrawalRow[];
      ledger: CreatorLedgerRow[];
      account: CreatorPayoutAccount;
    }
  | CreatorPayoutApiFailure
> {
  const [balance, methods, withdrawals, ledger, account] = await Promise.all([
    apiCreatorBalance(),
    apiCreatorPayoutMethods(),
    apiCreatorWithdrawals(),
    apiCreatorLedger(),
    apiCreatorPayoutAccount(),
  ]);
  const failed = [balance, methods, withdrawals, ledger, account].find((item) => !item.ok);
  if (failed && !failed.ok) return failed;
  if (!balance.ok || !methods.ok || !withdrawals.ok || !ledger.ok || !account.ok) {
    return { ok: false, error: "Failed to load payout info", sessionExpired: false };
  }
  return {
    ok: true,
    balance: balance.balance,
    methods: methods.methods,
    withdrawals: withdrawals.withdrawals,
    ledger: ledger.ledger,
    account: account.account,
  };
}

export async function apiCreatorWithdrawGbp(body: {
  amount_pence: number;
  idempotency_key: string;
}): Promise<{ ok: true; status: string; already_exists: boolean } | CreatorPayoutApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/creator/withdraw-gbp", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return failure(error, "Withdraw failed");
  const parsed = creatorWithdrawResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Withdraw failed", sessionExpired: false };
  }
  return { ok: true, status: parsed.data.status, already_exists: parsed.data.already_exists };
}
