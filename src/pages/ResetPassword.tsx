import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, CheckCircle } from "lucide-react";
import { authResetPassword } from "@/features/auth/authSession";
import { isAbortLike } from "@/features/auth/abortLike";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";
import { AuthFormErrorAndSubmit } from "@/components/AuthFormErrorAndSubmit";

/**
 * PAGE-005 — independently written against OLD visual/behaviour contract.
 * Does not import or copy OLD source.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isMounted = useIsMountedRef();
  const submitLock = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goLogin = useCallback(() => navigate("/login", { replace: true }), [navigate]);

  useEffect(() => {
    if (!resetToken) {
      setError("Invalid or missing reset link. Please request a new password reset.");
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [resetToken]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    setError(null);

    if (!resetToken) {
      setError("Invalid or missing reset link. Please request a new password reset.");
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

    submitLock.current = true;
    setIsSubmitting(true);
    try {
      const result = await authResetPassword(resetToken, password);
      if (!isMounted.current) return;
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      redirectTimerRef.current = setTimeout(() => goLogin(), 3000);
    } catch (err) {
      if (!isMounted.current) return;
      if (isAbortLike(err)) return;
      setError("Failed to reset password. Please try again.");
    } finally {
      submitLock.current = false;
      if (isMounted.current) setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-transparent text-white flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-white mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Password Reset!</h1>
          <p className="text-sm text-white/60">Your password has been updated. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
        <p className="text-sm text-white/60 mb-6">Enter your new password below.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/70">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[#D8D9DD]/50"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/70">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[#D8D9DD]/50"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          </div>

          <AuthFormErrorAndSubmit
            error={error}
            isSubmitting={isSubmitting}
            submittingLabel="Updating..."
            idleLabel="Reset Password"
          />
        </form>
      </div>
    </div>
  );
}
