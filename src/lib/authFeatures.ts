export function isAppleSignInEnabled(): boolean {
  const fromVite = (import.meta.env.VITE_APPLE_SIGN_IN_ENABLED ?? "").toString().trim().toLowerCase();
  const fromRuntime = (typeof window !== "undefined" ? window.__ELIX_ENV?.VITE_APPLE_SIGN_IN_ENABLED : "")
    ?.toString()
    .trim()
    .toLowerCase();
  return fromVite === "true" || fromVite === "1" || fromRuntime === "true" || fromRuntime === "1";
}

export function isPasswordResetEnabled(): boolean {
  const raw = (
    import.meta.env.VITE_PASSWORD_RESET_ENABLED ??
    (typeof window !== "undefined" ? window.__ELIX_ENV?.VITE_PASSWORD_RESET_ENABLED : "") ??
    "true"
  )
    .toString()
    .trim()
    .toLowerCase();
  return raw !== "false" && raw !== "0";
}
