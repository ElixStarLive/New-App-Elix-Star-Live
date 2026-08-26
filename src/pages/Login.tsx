import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Check, User } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { isAppleSignInEnabled, isPasswordResetEnabled } from "@/lib/authFeatures";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";
import { AuthPasswordField } from "@/components/AuthPasswordField";
import { isAbortLike } from "@/features/auth/abortLike";

const REMEMBER_EMAIL_KEY = "login_saved_email";
/** Legacy key only — never write; always delete on read/write. */
const REMEMBER_PASSWORD_KEY = "login_saved_password";
const REMEMBER_FLAG_KEY = "login_save_details";

function readRememberedLogin(): { save: boolean; email: string } {
  try {
    // Security: never hydrate a password from localStorage.
    window.localStorage.removeItem(REMEMBER_PASSWORD_KEY);
    const flagRaw = window.localStorage.getItem(REMEMBER_FLAG_KEY);
    // Default Remember on so email stays unless the user turns it off.
    const save = flagRaw === null ? true : flagRaw === "true";
    const email = window.localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
    return { save, email };
  } catch {
    return { save: true, email: "" };
  }
}

/** Email/username may persist. Password is never stored. */
function writeRememberedLogin(save: boolean, email: string): void {
  try {
    window.localStorage.removeItem(REMEMBER_PASSWORD_KEY);
    const trimmed = email.trim();
    if (trimmed) {
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, trimmed);
    }
    window.localStorage.setItem(REMEMBER_FLAG_KEY, save ? "true" : "false");
    if (!save) {
      // Flag off still keeps email for convenience when user returns — matches prior email-only path.
    }
  } catch {
    /* storage may be unavailable */
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, signInWithApple } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveDetails, setSaveDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const isMounted = useIsMountedRef();
  const submitLock = useRef(false);
  const showAppleSignIn = isAppleSignInEnabled();
  const showPasswordReset = isPasswordResetEnabled();

  const goRegister = useCallback(() => {
    navigate("/register", { state: { from } });
  }, [navigate, from]);

  useEffect(() => {
    const remembered = readRememberedLogin();
    setSaveDetails(remembered.save);
    if (remembered.email) setEmail(remembered.email);
  }, []);

  const unlockSubmit = useCallback(() => {
    submitLock.current = false;
    if (isMounted.current) setIsSubmitting(false);
  }, [isMounted]);

  const goAfterAuth = useCallback(() => {
    if (isMounted.current) {
      navigate(from, { replace: true });
    }
  }, [from, isMounted, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await signInWithPassword(email.trim(), password);
      if (res.error) {
        if (!isMounted.current) return;
        if (res.error === "aborted" || res.error.toLowerCase().includes("aborted")) {
          unlockSubmit();
          return;
        }
        const message =
          res.error === "System error: Authentication not configured."
            ? "Please refresh the page and try again. If the problem continues, ensure the app is updated and the server is running."
            : res.error;
        setError(message);
        unlockSubmit();
        return;
      }
      // Email/username may be remembered; password is never persisted.
      writeRememberedLogin(saveDetails, email.trim());
      goAfterAuth();
    } catch (err) {
      if (isAbortLike(err)) {
        unlockSubmit();
        return;
      }
      if (isMounted.current) {
        setError("An unexpected error occurred. Please try again.");
        unlockSubmit();
      }
    }
  };

  const onApple = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: err } = await signInWithApple();
      if (err) {
        if (!isMounted.current) return;
        setError(err);
        unlockSubmit();
        return;
      }
      writeRememberedLogin(saveDetails, email.trim());
      goAfterAuth();
    } catch {
      if (isMounted.current) {
        setError("Apple sign-in failed. Please try again.");
        unlockSubmit();
      }
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-transparent text-white flex items-center justify-center p-4 xs:p-3 sm:p-4 overflow-y-auto pt-[calc(var(--safe-top)+46px)] pb-[calc(var(--safe-bottom)+var(--nav-height))]">
      <div className="elix-auth-form w-full max-w-[420px] xs:max-w-[320px] sm:max-w-[380px] bg-white/5 border border-white/10 rounded-2xl p-6 xs:p-4 sm:p-5">
        <div className="flex justify-center mb-4">
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-24 h-24 object-contain" />
        </div>
        <h1 className="text-fluid-xl font-bold mb-4 xs:mb-3 sm:mb-4 text-center">Login</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Email or Username</label>
            <div className="relative">
              <Mail className="elix-auth-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="username or you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <AuthPasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            showPassword={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            autoComplete="current-password"
          />

          <label className="flex items-center gap-3 px-3 xs:px-2 py-3 xs:py-2.5 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={saveDetails}
                onChange={(e) => setSaveDetails(e.target.checked)}
                className="peer sr-only"
              />
              <div
                className={`w-5 h-5 xs:w-4 xs:h-4 rounded-md border transition-all flex items-center justify-center ${
                  saveDetails ? "bg-[#E6E9EE] border-[#D8D9DD]" : "bg-white/10 border-white/30 group-hover:border-white/50"
                }`}
              >
                {saveDetails && <Check className="w-3.5 h-3.5 xs:w-3 xs:h-3 text-black stroke-[3]" />}
              </div>
            </div>
            <span className="text-fluid-sm text-white/70 select-none">Remember password</span>
          </label>

          {error ? (
            <div className="text-fluid-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 xs:p-2.5">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white/40">New here?</span>
          </div>
          <button
            type="button"
            onClick={goRegister}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/8 hover:bg-white/15 text-white text-sm font-semibold py-2.5 border border-white/15 transition"
          >
            <User className="elix-auth-icon w-4 h-4" />
            Sign up
          </button>
        </div>

        {showAppleSignIn ? (
          <>
            <div className="relative my-5 flex items-center">
              <div className="flex-1 border-t border-white/10" />
              <span className="px-3 text-white/40 text-xs">or</span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void onApple()}
              className="w-full flex items-center justify-center gap-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm hover:bg-white/10 transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Sign in with Apple
            </button>
          </>
        ) : null}

        <div className="mt-4 xs:mt-3 text-center space-y-2 px-1">
          {showPasswordReset ? (
            <Link to="/forgot-password" className="block text-fluid-sm text-white/60 hover:text-white hover:underline">
              Forgot your password?
            </Link>
          ) : null}
          <div className="mx-auto max-w-[280px] space-y-0.5 text-[11px] leading-relaxed tracking-wide text-white/45">
            <p>Created by Andrei Ionut Berica</p>
            <p>© 2026 · Owner &amp; Developer · All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
