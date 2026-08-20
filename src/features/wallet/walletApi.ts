import { walletBalanceSchema, type WalletBalance } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export async function apiFetchWallet(): Promise<{
  balances: WalletBalance | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/wallet");
  if (error) return { balances: null, error: error.message || "Wallet fetch failed" };
  const direct = walletBalanceSchema.safeParse(data);
  if (direct.success) return { balances: direct.data, error: null };
  if (!isRecord(data)) return { balances: null, error: "Wallet response missing paid balance" };
  const nested = walletBalanceSchema.safeParse(data.balances ?? data.wallet);
  if (!nested.success) return { balances: null, error: "Wallet response missing paid balance" };
  return { balances: nested.data, error: null };
}

export async function apiIssueTestCoins(password: string, amount: number): Promise<{
  testCoins: number | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/wallet/test-coins", {
    method: "POST",
    body: JSON.stringify({ password, amount }),
  });
  if (error) return { testCoins: null, error: error.message };
  if (!isRecord(data) || typeof data.testCoins !== "number") {
    return { testCoins: null, error: "Test coins were not issued" };
  }
  return { testCoins: data.testCoins, error: null };
}
