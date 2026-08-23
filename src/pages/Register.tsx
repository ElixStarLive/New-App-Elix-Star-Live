import { useCallback, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, User } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";
import { AuthPasswordField } from "@/components/AuthPasswordField";
import { authSaveConsent } from "@/features/auth/authSession";
import { showToast } from "@/lib/toast";
import { containerReturnState } from "@/lib/settingsNav";
import { REGISTER_WELCOME_STARTER } from "@shared/contracts";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const signUpWithPassword = useAuthStore((state) => state.signUpWithPassword);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useIsMountedRef();
  const submitLock = useRef(false);

  const toggleTerms = useCallback(() => {
    setAcceptedTerms((value) => !value);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;

    setError(null);
    setInfo(null);

    if (!acceptedTerms) {
      setError("You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);

    try {
      const handle = username.trim() || undefined;
      const res = await signUpWithPassword(email.trim(), password, handle);
      if (!isMounted.current) return;
      if (res.error) {
        if (res.error === "aborted" || res.error.toLowerCase().includes("aborted")) {
          submitLock.current = false;
          setIsSubmitting(false);
          return;
        }
        submitLock.current = false;
        setError(res.error);
        setIsSubmitting(false);
        return;
      }
      if (res.needsEmailConfirmation) {
        submitLock.current = false;
        setInfo("Please check your email to confirm your account.");
        setIsSubmitting(false);
        return;
      }

      const consent = await authSaveConsent(email.trim());
      if (!isMounted.current) return;
      if (!consent.ok) {
        submitLock.current = false;
        setError(
          consent.error ||
            "Account created but consent could not be saved. Please try again from settings.",
        );
        setIsSubmitting(false);
        return;
      }

      showToast(res.welcomeMessage || REGISTER_WELCOME_STARTER);
      navigate(from, { replace: true });
    } catch (err) {
      if (!isMounted.current) return;
      const message = err instanceof Error ? err.message : "";
      if (err instanceof Error && (err.name === "AbortError" || message.toLowerCase().includes("aborted"))) {
        submitLock.current = false;
        setIsSubmitting(false);
        return;
      }
      submitLock.current = false;
      setError("Failed to create account");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-transparent text-white flex items-center justify-center p-4 xs:p-3 sm:p-4 overflow-y-auto pt-[calc(var(--safe-top)+46px)] pb-[calc(var(--safe-bottom)+var(--nav-height))]">
      <div className="elix-auth-form w-full max-w-[420px] xs:max-w-[320px] sm:max-w-[380px] bg-white/5 border border-white/10 rounded-2xl p-6 xs:p-4 sm:p-5">
        <div className="flex justify-center mb-3">
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
        </div>
        <h1 className="text-fluid-xl font-bold mb-4 xs:mb-3 sm:mb-4 text-center">Create Account</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3 sm:space-y-4" autoComplete="off">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Username (optional)</label>
            <div className="relative">
              <User className="elix-auth-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="username"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Email</label>
            <div className="relative">
              <Mail className="elix-auth-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="you@email.com"
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
            autoComplete="new-password"
          />

          <AuthPasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            showPassword={showConfirmPassword}
            onToggleShow={() => setShowConfirmPassword((v) => !v)}
            autoComplete="new-password"
            placeholder="Confirm password"
          />

          <div
            role="checkbox"
            tabIndex={0}
            onClick={toggleTerms}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleTerms();
              }
            }}
            className="flex items-start gap-3 cursor-pointer select-none min-h-[44px] touch-manipulation"
            aria-checked={acceptedTerms}
            aria-label="Confirm age 13+, Terms of Service and Privacy Policy"
          >
            <div
              className={`mt-0.5 w-6 h-6 min-w-[24px] min-h-[24px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                acceptedTerms ? "border-[#D8D9DD] bg-[#E6E9EE]" : "border-white/30 bg-white/10"
              }`}
            >
              {acceptedTerms ? (
                <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
            </div>
            <span className="text-fluid-xs text-white/70 leading-5 pt-0.5">
              I confirm I am at least 13 years old and agree to the{" "}
              <Link
                to="/terms"
                state={containerReturnState("/register")}
                className="text-[#F5F5F7] underline"
                onClick={(e) => e.stopPropagation()}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                state={containerReturnState("/register")}
                className="text-[#F5F5F7] underline"
                onClick={(e) => e.stopPropagation()}
              >
                Privacy Policy
              </Link>
            </span>
          </div>

          {error ? (
            <div className="text-fluid-sm text-rose-300 bg-white/20/10 border border-rose-500/20 rounded-xl p-3 xs:p-2.5">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="text-fluid-sm text-white/70 bg-white/5 border border-white/10 rounded-xl p-3 xs:p-2.5">
              {info}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="mt-6 xs:mt-4 text-center space-y-2 px-1">
          <Link to="/login" state={{ from }} className="text-fluid-sm text-white hover:underline">
            Already have an account? Sign in
          </Link>
          <div className="mx-auto max-w-[280px] space-y-0.5 text-[11px] leading-relaxed tracking-wide text-white/45">
            <p>Created by Andrei Ionut Berica</p>
            <p>© 2026 · Owner &amp; Developer · All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
