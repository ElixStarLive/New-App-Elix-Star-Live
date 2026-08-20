import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { authForgotPassword } from "@/features/auth/authSession";
import { isPasswordResetEnabled } from "@/lib/authFeatures";
import { useIsMountedRef } from "@/hooks/useIsMountedRef";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isMounted = useIsMountedRef();
  const submitLock = useRef(false);

  if (!isPasswordResetEnabled()) {
    return <Navigate to="/login" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setIsSubmitting(true);
    if (!email.trim()) {
      submitLock.current = false;
      setError("Email is required.");
      setIsSubmitting(false);
      return;
    }
    try {
      const result = await authForgotPassword(email);
      if (!isMounted.current) return;
      if (result.ok === false) {
        submitLock.current = false;
        setError(result.error);
        setIsSubmitting(false);
        return;
      }
      setSuccess(true);
      setIsSubmitting(false);
    } catch {
      if (isMounted.current) {
        submitLock.current = false;
        setError("Network error. Please check your connection and try again.");
        setIsSubmitting(false);
      }
    }
  };

  if (success) {
    return (
      <div className="bg-transparent text-white flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-white mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
          <p className="text-sm text-white/60 mb-6">
            We've sent a password reset link to <strong>{email}</strong>.
            Check your inbox and follow the link to reset your password.
          </p>
          <Link
            to="/login"
            className="inline-block w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 text-sm text-center"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-transparent text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-2xl p-6">
        <Link to="/login" className="flex items-center gap-2 text-white/60 text-sm mb-4 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </Link>

        <h1 className="text-2xl font-bold mb-2">Forgot Password</h1>
        <p className="text-sm text-white/60 mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/70">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {error ? (
            <div className="text-sm text-rose-300 bg-white/20/10 border border-rose-500/20 rounded-xl p-3">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 text-sm disabled:opacity-60"
          >
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
