const NATIVE_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function isAllowedOrigin(
  origin: string,
  opts: { clientUrl?: string | null; isProduction: boolean },
): boolean {
  const normalized = normalizeOrigin(origin);
  if (NATIVE_ORIGINS.has(normalized)) return true;

  const configuredOrigins = (opts.clientUrl ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
  if (configuredOrigins.includes(normalized)) return true;

  if (!opts.isProduction && /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+$/i.test(normalized)) {
    return true;
  }

  return false;
}
