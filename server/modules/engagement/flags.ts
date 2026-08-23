function readEnabled(raw: string | undefined): boolean | null {
  const value = (raw ?? "").toString().trim().toLowerCase();
  if (!value) return null;
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return null;
}

export function isEngagementHubEnabled(): boolean {
  const resolved =
    readEnabled(process.env.ENGAGEMENT_HUB_ENABLED) ?? readEnabled(process.env.VITE_ENGAGEMENT_HUB_ENABLED);
  return resolved === true;
}
