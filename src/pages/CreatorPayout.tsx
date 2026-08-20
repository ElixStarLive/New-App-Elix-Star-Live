import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { SettingsSubpage } from "./settings/SettingsSubpage";
import { showToast } from "@/lib/toast";

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function CreatorPayout() {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(0);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void apiRequest<unknown>("/api/creator/balance").then((res) => {
      if (res.error || !isRecord(res.data)) return;
      setAvailable(typeof res.data.availablePence === "number" ? res.data.availablePence : 0);
      setPending(typeof res.data.pendingPence === "number" ? res.data.pendingPence : 0);
    });
  }, []);

  return (
    <SettingsSubpage title="Creator payout">
      <p className="px-4 pt-3 text-sm text-white/60">
        Available {gbp(available)} · Pending {gbp(pending)}
      </p>
      <form
        className="p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const pence = Math.round(Number(amount) * 100);
          if (!Number.isFinite(pence) || pence <= 0) {
            showToast("Enter a valid amount");
            return;
          }
          setBusy(true);
          void apiRequest("/api/payouts/withdraw", {
            method: "POST",
            body: JSON.stringify({ amountPence: pence, idempotencyKey: crypto.randomUUID() }),
          }).then((res) => {
            setBusy(false);
            if (res.error) showToast(res.error.message);
            else {
              showToast("Withdrawal requested");
              setAvailable((prev) => Math.max(0, prev - pence));
            }
          });
        }}
      >
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount GBP" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" />
        <button type="submit" disabled={busy} className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold">{busy ? "Sending..." : "Withdraw"}</button>
      </form>
      <div className="px-4 pb-4">
        <button
          type="button"
          className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
          onClick={() => {
            void apiRequest<unknown>("/api/creator/payout-account/onboard", { method: "POST" }).then((res) => {
              if (res.error) showToast(res.error.message);
              else if (isRecord(res.data) && typeof res.data.url === "string") window.location.assign(res.data.url);
            });
          }}
        >
          Connect payout account
        </button>
      </div>
    </SettingsSubpage>
  );
}
