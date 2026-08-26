import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceCloseIcon } from "@/components/royce";
import { createCreatorLoginSession } from "@/features/creatorLogin/creatorLoginSession";
import { useCreatorLoginSession } from "@/features/creatorLogin/useCreatorLoginSession";
import { isPasswordResetEnabled } from "@/lib/authFeatures";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function CreatorLoginDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signOut = useAuthStore((s) => s.signOut);
  const showPasswordReset = isPasswordResetEnabled();
  const sessionRef = useRef(createCreatorLoginSession());
  const session = sessionRef.current;
  const snap = useCreatorLoginSession(session);
  const bootUserRef = useRef(user);

  useEffect(() => {
    const bootUser = bootUserRef.current;
    session.hydrate(
      bootUser?.email,
      bootUser
        ? {
            username: bootUser.username,
            avatarUrl: bootUser.avatarUrl,
          }
        : undefined,
    );
    return () => {
      session.dispose();
    };
  }, [session]);

  useEffect(() => {
    if (!user?.email) return;
    session.hydrate(user.email, {
      username: user.username,
      avatarUrl: user.avatarUrl,
    });
  }, [session, user?.id, user?.email, user?.username, user?.avatarUrl]);

  const goBack = () => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  const goProfile = () => navigate("/profile", { replace: true });
  const goForgotPassword = () => navigate("/forgot-password");

  const onSignOut = () => {
    void session.signOutAndStay(signOut).catch(() => {
      showToast("Sign out failed");
    });
  };

  const onSwitch = (identifier: string) => {
    if (user?.email === identifier || snap.switching || snap.submitting) return;
    void session.signOutAndStay(signOut).then(() => {
      session.selectAccount(identifier);
    }).catch(() => {
      showToast("Sign out failed");
    });
  };

  const onAdd = () => {
    if (snap.switching || snap.submitting) return;
    void session.signOutAndStay(signOut).then(() => {
      session.clearForAdd();
    }).catch(() => {
      showToast("Sign out failed");
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-transparent text-white flex justify-center">
      <div className="w-full max-w-[480px] h-full elix-panel elix-page-glass flex flex-col overflow-y-auto p-4">
        <header className="relative flex flex-col items-center mb-5 pt-[max(0px,var(--safe-top))]">
          <button
            type="button"
            onClick={goBack}
            className="absolute top-[max(0px,var(--safe-top))] right-0 w-9 h-9 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform z-10"
            aria-label="Close"
          >
            <RoyceCloseIcon />
          </button>
          <div className="flex flex-col items-center">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-16 h-16 object-contain" />
            <h1 className="font-bold text-base mt-1">Creator Login Details</h1>
          </div>
        </header>

        {snap.accounts.length > 0 ? (
          <div className="mb-6">
            <h3 className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-2 pl-1">Switch Accounts</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 px-1">
              {snap.accounts.map((acc) => {
                const isActive = user?.email === acc.identifier;
                return (
                  <div
                    key={acc.identifier}
                    onClick={() => {
                      if (!isActive) onSwitch(acc.identifier);
                    }}
                    className={`flex-shrink-0 w-14 flex flex-col items-center gap-1.5 group cursor-pointer ${
                      isActive ? "opacity-100" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="relative">
                      <AvatarRing src={acc.avatar || "/elix-logo.png"} alt={acc.username} size={40} />
                      {isActive ? (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#FFFFFF] rounded-full border-[1.5px] border-black" />
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            session.removeAccount(acc.identifier);
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-white/20 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove ${acc.username}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] font-medium truncate w-full text-center text-white">{acc.username}</p>
                  </div>
                );
              })}
              <div
                onClick={() => onAdd()}
                className="flex-shrink-0 w-14 flex flex-col items-center gap-1.5 group cursor-pointer opacity-60 hover:opacity-100"
              >
                <div className="w-10 h-10 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center group-hover:bg-white/5 transition-colors">
                  <span className="text-lg text-white/50 font-light">+</span>
                </div>
                <p className="text-[9px] font-medium text-white/50">Add</p>
              </div>
            </div>
          </div>
        ) : null}

        {!user ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void session.login(signInWithPassword).then((res) => {
                if (res.ok) goProfile();
              });
            }}
            className="space-y-4 mb-6 max-w-[90%] mx-auto"
          >
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="email"
                  value={snap.email}
                  onChange={(event) => session.setEmail(event.target.value)}
                  className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#D8D9DD]/50 transition-all"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type={snap.showPassword ? "text" : "password"}
                  value={snap.password}
                  onChange={(event) => session.setPassword(event.target.value)}
                  className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#D8D9DD]/50 transition-all"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => session.toggleShowPassword()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {snap.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="save-login"
                  checked={snap.savePref}
                  onChange={(event) => session.setSavePref(event.target.checked)}
                  className="peer h-4 w-4 rounded-full border border-white/30 bg-transparent appearance-none checked:border-[#D8D9DD] checked:bg-[#FFFFFF] transition-all cursor-pointer"
                />
                <svg
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <label htmlFor="save-login" className="text-xs text-white/60 cursor-pointer select-none">
                Save login info
              </label>
            </div>
            {showPasswordReset ? (
              <div className="flex flex-col gap-1.5 pt-1">
                <button type="button" onClick={goForgotPassword} className="text-left text-xs text-white/60 hover:text-white hover:underline">
                  Reset password
                </button>
                <button type="button" onClick={goForgotPassword} className="text-left text-xs text-white/60 hover:text-white hover:underline">
                  Recover account
                </button>
              </div>
            ) : null}
            {snap.error ? <div className="text-xs text-rose-300">{snap.error}</div> : null}
            {snap.info ? <div className="text-xs text-white/70">{snap.info}</div> : null}
            {snap.showResend ? (
              <button
                type="button"
                disabled={snap.resending}
                className="w-full bg-transparent border border-white/10 rounded-xl py-2 text-sm disabled:opacity-60"
                onClick={() => {
                  void session.resendConfirmation();
                }}
              >
                {snap.resending ? "Sending..." : "Resend confirmation email"}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={snap.submitting}
              className="w-full bg-[#E6E9EE] text-white font-bold rounded-xl py-3 text-sm disabled:opacity-60 shadow-[0_0_15px_rgba(230,179,106,0.3)] hover:shadow-[0_0_20px_rgba(230,179,106,0.5)] transition-all active:scale-[0.98]"
            >
              {snap.submitting ? "Signing in..." : "Log in"}
            </button>
          </form>
        ) : (
          <div className="space-y-4 mb-6 max-w-[90%] mx-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="email"
                  value={snap.email}
                  onChange={(event) => session.setEmail(event.target.value)}
                  className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#D8D9DD]/50 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-white/50 font-medium uppercase tracking-wider pl-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type={snap.showPassword ? "text" : "password"}
                  value={snap.password}
                  onChange={(event) => session.setPassword(event.target.value)}
                  className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#D8D9DD]/50 transition-all"
                  placeholder="Enter password to save"
                />
                <button
                  type="button"
                  onClick={() => session.toggleShowPassword()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {snap.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="save-login-user"
                  checked={snap.savePref}
                  onChange={(event) =>
                    session.setSavePref(event.target.checked, {
                      email: user.email,
                      username: user.username,
                      avatarUrl: user.avatarUrl,
                    })
                  }
                  className="peer h-4 w-4 rounded-full border border-white/30 bg-transparent appearance-none checked:border-[#D8D9DD] checked:bg-[#FFFFFF] transition-all cursor-pointer"
                />
                <svg
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <label htmlFor="save-login-user" className="text-xs text-white/60 cursor-pointer select-none">
                Save login info
              </label>
            </div>
            {showPasswordReset ? (
              <div className="flex flex-col gap-1.5 pt-1">
                <button type="button" onClick={goForgotPassword} className="text-left text-xs text-white/60 hover:text-white hover:underline">
                  Reset password
                </button>
                <button type="button" onClick={goForgotPassword} className="text-left text-xs text-white/60 hover:text-white hover:underline">
                  Recover account
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="w-full bg-transparent border border-white/10 rounded-xl py-3 text-sm font-semibold hover:bg-white/5 transition-colors"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
