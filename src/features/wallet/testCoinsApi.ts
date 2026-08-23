import { testCoinBalanceSchema } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type TestCoinsFetchResult =
  | { balance: number; error: null; status: number }
  | { balance: null; error: string; status: number };

export function parseTestCoinBalance(data: unknown): number | null {
  const parsed = testCoinBalanceSchema.safeParse(data);
  return parsed.success ? parsed.data.balance : null;
}

export async function apiFetchTestCoinsBalance(): Promise<TestCoinsFetchResult> {
  const { data, error } = await apiRequest<unknown>("/api/test-coins/balance");
  if (error) {
    return {
      balance: null,
      error: error.message || "Test coin fetch failed",
      status: error.status,
    };
  }
  const balance = parseTestCoinBalance(data);
  if (balance == null) {
    return { balance: null, error: "Invalid test coin response", status: 200 };
  }
  return { balance, error: null, status: 200 };
}
