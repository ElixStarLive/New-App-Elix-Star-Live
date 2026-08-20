import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { SettingsSubpage } from "./SettingsSubpage";
import { showToast } from "@/lib/toast";

export default function SecuritySettings() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");

  const refresh = () => {
    void apiRequest<unknown>("/api/auth/2fa/status").then((res) => {
      if (res.error || !isRecord(res.data)) return;
      setEnabled(res.data.enabled === true);
      setEnrolled(res.data.enrolled === true);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <SettingsSubpage title="Security">
      <form
        className="p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void apiRequest("/api/auth/change-password", {
            method: "POST",
            body: JSON.stringify({ currentPassword: current, newPassword: next }),
          }).then((res) => {
            setBusy(false);
            if (res.error) showToast(res.error.message);
            else showToast("Password updated");
          });
        }}
      >
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" />
        <button type="submit" disabled={busy} className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold">
          {busy ? "Saving..." : "Update password"}
        </button>
      </form>
      <div className="p-4 space-y-3 border-t border-white/10">
        <p className="text-sm font-bold">Authenticator</p>
        <p className="text-[12px] text-white/50">{enabled ? "Enabled" : enrolled ? "Enrolled, not enabled" : "Not set up"}</p>
        {!enabled ? (
          <>
            <button
              type="button"
              className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
              onClick={() => {
                void apiRequest<unknown>("/api/auth/2fa/enroll", { method: "POST" }).then((res) => {
                  if (res.error) showToast(res.error.message);
                  else if (isRecord(res.data) && typeof res.data.secret === "string") {
                    setSecret(res.data.secret);
                    setEnrolled(true);
                  }
                });
              }}
            >
              Enroll authenticator
            </button>
            {secret ? <p className="text-[12px] break-all text-white/70">{secret}</p> : null}
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" maxLength={6} />
            <button
              type="button"
              className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
              onClick={() => {
                void apiRequest("/api/auth/2fa/verify", {
                  method: "POST",
                  body: JSON.stringify({ code }),
                }).then((res) => {
                  if (res.error) showToast(res.error.message);
                  else {
                    showToast("Authenticator enabled");
                    setCode("");
                    refresh();
                  }
                });
              }}
            >
              Verify and enable
            </button>
          </>
        ) : (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" maxLength={6} />
            <button
              type="button"
              className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
              onClick={() => {
                void apiRequest("/api/auth/2fa/disable", {
                  method: "POST",
                  body: JSON.stringify({ code }),
                }).then((res) => {
                  if (res.error) showToast(res.error.message);
                  else {
                    showToast("Authenticator disabled");
                    setCode("");
                    setSecret("");
                    refresh();
                  }
                });
              }}
            >
              Disable authenticator
            </button>
          </>
        )}
      </div>
    </SettingsSubpage>
  );
}
