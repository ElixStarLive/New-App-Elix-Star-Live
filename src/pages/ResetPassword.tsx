import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Lock } from 'lucide-react';
import { resetPassword } from '../features/auth/authApi';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const goLogin = useCallback(() => navigate('/login', { replace: true }), [navigate]);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset link. Please request a new password reset.');
    }
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !token) return;
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: apiError } = await resetPassword(token, password);
    setSubmitting(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => goLogin(), 3_000);
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
                onChange={(event) => setPassword(event.target.value)}
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
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-sm text-white outline-none focus:border-[#D8D9DD]/50"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={6}
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
            disabled={submitting || !token}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Updating...' : 'Reset Password'}
          </button>

          <Link
            to="/login"
            className="block text-center text-sm text-white/60 hover:text-white hover:underline"
          >
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
}
