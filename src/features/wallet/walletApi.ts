import { walletBalanceSchema, type WalletMoneyBalances } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export type WalletFetchResult =
  | { balances: WalletMoneyBalances; error: null; status: number }
  | { balances: null; error: string; status: number };

/** Single GET /api/wallet normalizer. Missing paid/starter/promo is an error, never 0. */
export function parseWalletResponse(data: unknown): WalletMoneyBalances | null {
  const parsed = walletBalanceSchema.safeParse(data);
  if (!parsed.success) return null;
  if (isRecord(data) && (data.testCoins != null || data.test_coins != null || data.test_balance != null)) {
    return null;
  }
  if (isRecord(data) && (data.starter_coins != null || data.promotional_coins != null)) {
    return null;
  }
  return {
    paidCoins: parsed.data.coin_balance,
    starterCoins: parsed.data.starter_balance,
    promoCoins: parsed.data.promotional_balance,
  };
}

export async function apiFetchWallet(): Promise<WalletFetchResult> {
  const { data, error } = await apiRequest<unknown>("/api/wallet");
  if (error) {
    return {
      balances: null,
      error: error.message || "Wallet fetch failed",
      status: error.status,
    };
  }
  const balances = parseWalletResponse(data);
  if (!balances) {
    return { balances: null, error: "Invalid wallet response", status: 200 };
  }
  return { balances, error: null, status: 200 };
}
