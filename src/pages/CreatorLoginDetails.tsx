import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { AvatarRing } from "@/components/AvatarRing";
import { isPasswordResetEnabled } from "@/lib/authFeatures";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function CreatorLoginDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signOut = useAuthStore((s) => s.signOut);
  const showPasswordReset = isPasswordResetEnabled();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveDetails, setSaveDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });

  return (
    <div className="page-above-bottom-nav text-white">
      <div className="page-above-bottom-nav__inner elix-settings-write flex flex-col min-h-0">
        <header className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "var(--page-header-top)" }}>
          <span className="w-10" />
          <h1 className="text-[16px] font-bold">Login details</h1>
          <button type="button" onClick={close} className="p-1" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="px-4 pb-6 overflow-y-auto">
          {user ? (
            <div className="flex flex-col items-center pt-4 pb-6">
              <AvatarRing src={user.avatarUrl} alt={user.displayName} size={72} />
              <p className="mt-3 font-bold">{user.displayName}</p>
              <p className="text-sm text-white/50">{user.email}</p>
              <p className="text-sm text-white/50">@{user.username}</p>
              <button
                type="button"
                className="mt-4 border border-white/15 rounded-xl px-5 py-2 text-sm"
                onClick={() => void signOut().then(() => navigate("/login"))}
              >
                Log out
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 max-w-[90%] mx-auto mb-6">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${mode === "signin" ? "bg-[#E6E9EE] text-black border-[#D8D9DD]" : "bg-transparent text-white border-white/10"}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    navigate("/register");
                  }}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${mode === "signup" ? "bg-[#E6E9EE] text-black border-[#D8D9DD]" : "bg-transparent text-white border-white/10"}`}
                >
                  Create account
                </button>
              </div>
              <form
                className="space-y-4 max-w-[90%] mx-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError(null);
                  void signInWithPassword(email.trim(), password).then((res) => {
                    setBusy(false);
                    if (res.error) setError(res.error);
                    else {
                      if (saveDetails) window.localStorage.setItem("login_saved_email", email.trim());
                      showToast("Signed in");
                      navigate("/profile", { replace: true });
                    }
                  });
                }}
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-[#D8D9DD]/50"
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm outline-none focus:border-[#D8D9DD]/50"
                      placeholder="Enter your password"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} />
                  Save login details
                </label>
                {error ? <p className="text-rose-300 text-sm">{error}</p> : null}
                <button type="submit" disabled={busy} className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold">
                  {busy ? "Signing in..." : "Sign in"}
                </button>
                {showPasswordReset ? (
                  <button type="button" className="w-full text-center text-xs text-white/50" onClick={() => navigate("/forgot-password")}>
                    Forgot password?
                  </button>
                ) : null}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
