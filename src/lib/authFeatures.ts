function runtimeFlag(key: "VITE_APPLE_SIGN_IN_ENABLED" | "VITE_EMAIL_CONFIGURED"): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.__ELIX_ENV?.[key];
  return value == null ? undefined : String(value);
}

export function isAppleSignInEnabled(): boolean {
  const runtime = runtimeFlag("VITE_APPLE_SIGN_IN_ENABLED");
  if (runtime === "true") return true;
  if (runtime === "false") return false;
  return import.meta.env.VITE_APPLE_SIGN_IN_ENABLED === "true";
}

export function isPasswordResetEnabled(): boolean {
  const runtime = runtimeFlag("VITE_EMAIL_CONFIGURED");
  if (runtime === "true") return true;
  if (runtime === "false") return false;
  return import.meta.env.VITE_EMAIL_CONFIGURED === "true";
}
