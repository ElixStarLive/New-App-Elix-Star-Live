export type WalletSurfaceStatus = "idle" | "loading" | "ready" | "error";

/** Presentation only. Never invents 0 for loading or error. */
export function formatWalletCount(
  value: number | null,
  status: WalletSurfaceStatus,
): string {
  if (status === "ready" && value != null && Number.isFinite(value)) {
    return Math.trunc(value).toLocaleString();
  }
  if (status === "error") return "unavailable";
  return "…";
}
