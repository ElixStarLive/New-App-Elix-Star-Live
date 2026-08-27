import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, User } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { useAuthStore } from '../features/auth/authStore';

interface RegisterLocationState {
  from?: string;
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as RegisterLocationState | null)?.from ?? '/';
  const signUp = useAuthStore((state) => state.signUp);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setInfo(null);

    if (!acceptedTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const outcome = await signUp({
      email: email.trim(),
      password,
      username: username.trim() || undefined,
    });

    if (!outcome.success) {
      setError(outcome.error.message);
      setSubmitting(false);
      return;
    }

    if (outcome.needsVerification) {
      setInfo('Please check your email to confirm your account.');
      setSubmitting(false);
      return;
    }

    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-transparent text-white flex items-center justify-center p-4 xs:p-3 sm:p-4 overflow-y-auto pt-[calc(var(--safe-top)+46px)] pb-[calc(var(--safe-bottom)+var(--nav-height))]">
      <div className="w-full max-w-[420px] xs:max-w-[320px] sm:max-w-[380px] bg-white/5 border border-white/10 rounded-2xl p-6 xs:p-4 sm:p-5">
        <div className="flex justify-center mb-3">
          <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
        </div>
        <h1 className="text-fluid-xl font-bold mb-4 xs:mb-3 sm:mb-4 text-center">Create Account</h1>

        <form onSubmit={onSubmit} className="space-y-4 xs:space-y-3 sm:space-y-4" autoComplete="off">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Username (optional)</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="username"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 xs:w-3.5 xs:h-3.5 text-white/50" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 xs:pl-9 pr-3 py-3 xs:py-2.5 text-fluid-sm text-white outline-none focus:border-[#D8D9DD]/50 placeholder:text-white/40"
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />

          <PasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Confirm password"
          />

          <div
            role="checkbox"
            tabIndex={0}
            onClick={() => setAcceptedTerms((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setAcceptedTerms((current) => !current);
              }
            }}
            className="flex items-start gap-3 cursor-pointer select-none min-h-[44px] touch-manipulation"
            aria-label="Confirm age 13+, Terms of Service and Privacy Policy"
          >
            <div
              className={`mt-0.5 w-6 h-6 min-w-[24px] min-h-[24px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                acceptedTerms
                  ? 'border-[#D8D9DD] bg-[#E6E9EE]'
                  : 'border-white/30 bg-white/10'
              }`}
            >
              {acceptedTerms && (
                <svg
                  className="w-3.5 h-3.5 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <span className="text-fluid-xs text-white/70 leading-5 pt-0.5">
              I confirm I am at least 13 years old and agree to the{' '}
              <Link
                to="/terms"
                className="text-[#F5F5F7] underline"
                onClick={(event) => event.stopPropagation()}
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                to="/privacy"
                className="text-[#F5F5F7] underline"
                onClick={(event) => event.stopPropagation()}
              >
                Privacy Policy
              </Link>
            </span>
          </div>

          {error && (
            <div className="text-fluid-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 xs:p-2.5">
              {error}
            </div>
          )}

          {info && (
            <div className="text-fluid-sm text-white/70 bg-white/5 border border-white/10 rounded-xl p-3 xs:p-2.5">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold rounded-xl py-3 xs:py-2.5 text-fluid-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating account...' : 'Create account'}
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
