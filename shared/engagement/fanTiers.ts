export const FAN_TIER_LADDER = [
  { name: "Bronze Fan", min: 0 },
  { name: "Silver Fan", min: 10 },
  { name: "Gold Fan", min: 20 },
  { name: "Diamond Fan", min: 30 },
  { name: "Elite Fan", min: 40 },
  { name: "Legend Fan", min: 50 },
] as const;

export type FanTierName = (typeof FAN_TIER_LADDER)[number]["name"];

export function fanTierForLevel(level: number): FanTierName {
  const lv = Math.max(0, Math.floor(level) || 0);
  if (lv >= 50) return "Legend Fan";
  if (lv >= 40) return "Elite Fan";
  if (lv >= 30) return "Diamond Fan";
  if (lv >= 20) return "Gold Fan";
  if (lv >= 10) return "Silver Fan";
  return "Bronze Fan";
}
