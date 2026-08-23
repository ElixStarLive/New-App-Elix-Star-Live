function readEnabled(raw: string | undefined): boolean | null {
  const value = (raw ?? "").toString().trim().toLowerCase();
  if (!value) return null;
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return null;
}

export function isEngagementHubEnabled(): boolean {
  const fromRuntime =
    typeof window !== "undefined" ? window.__ELIX_ENV?.VITE_ENGAGEMENT_HUB_ENABLED : undefined;
  const resolved =
    readEnabled(fromRuntime?.toString()) ?? readEnabled((import.meta.env.VITE_ENGAGEMENT_HUB_ENABLED ?? "").toString());
  return resolved === true;
}
