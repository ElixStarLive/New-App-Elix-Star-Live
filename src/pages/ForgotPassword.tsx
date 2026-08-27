import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import { forgotPassword } from '../features/auth/authApi';

const showPasswordReset = true;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!showPasswordReset) {
    return <Navigate to="/login" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const { error: apiError } = await forgotPassword(email.trim().toLowerCase());
    setSubmitting(false);

    if (apiError && apiError.code !== 'aborted') {
      setError(apiError.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="bg-transparent text-white flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-[420px] bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-white mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Check your email</h1>
          <p className="text-sm text-white/60 mb-6">
            We've sent a password reset link to <strong>{email}</strong>. Check your inbox and
            follow the link to reset your password.
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
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {error !== null && (
            <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      </div>
    </div>
  );
}
