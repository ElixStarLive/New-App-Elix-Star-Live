import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
}

export function PasswordField({ label, value, onChange, autoComplete, placeholder = 'Password' }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-fluid-sm text-white/70">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 py-3 pl-3 pr-10 text-fluid-sm text-white outline-none placeholder:text-white/40 focus:border-[#D8D9DD]/50 xs:py-2.5 xs:pr-9"
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
        >
          {revealed ? (
            <EyeOff className="h-4 w-4 xs:h-3.5 xs:w-3.5" />
          ) : (
            <Eye className="h-4 w-4 xs:h-3.5 xs:w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
