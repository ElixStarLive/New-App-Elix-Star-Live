/** Frozen PAGE-078 Admin Progression labels. User surfaces stay PAGE-047–054. */

export const ADMIN_PROGRESSION_TITLE = "Starter Coins & XP";
export const ADMIN_PROGRESSION_BACK = "Back";
export const ADMIN_PROGRESSION_PARENT = "/admin";
export const ADMIN_PROGRESSION_HOME = "/admin/progression";
export const ADMIN_PROGRESSION_LOADING = "Loading…";
export const ADMIN_PROGRESSION_ERROR = "Failed to load progression controls";
export const ADMIN_PROGRESSION_FLAGS_LOADING = "Loading flags…";
export const ADMIN_PROGRESSION_MISSIONS_EMPTY = "No missions loaded (run migrate).";
export const ADMIN_PROGRESSION_AUDIT_EMPTY = "No audit rows loaded.";
export const ADMIN_PROGRESSION_PHASE_TITLE = "Engagement Phase 1 + 1.5 (live)";
export const ADMIN_PROGRESSION_PHASE_MIGRATION = "20260722250000_engagement_admin_and_gifts_mission.sql";
export const ADMIN_PROGRESSION_FLAGS_TITLE = "Feature flags";
export const ADMIN_PROGRESSION_MISSIONS_TITLE = "Missions";
export const ADMIN_PROGRESSION_DAILY_TITLE = "Daily login rewards";
export const ADMIN_PROGRESSION_ENERGY_TITLE = "Battle Energy caps";
export const ADMIN_PROGRESSION_XP_TITLE = "XP rewards";
export const ADMIN_PROGRESSION_LEVELS_TITLE = "Level requirements";
export const ADMIN_PROGRESSION_USER_TITLE = "User audit & abuse correction";
export const ADMIN_PROGRESSION_ADMIN_AUDIT_TITLE = "Engagement admin audit";
export const ADMIN_PROGRESSION_SAVE = "Save";
export const ADMIN_PROGRESSION_ARCHIVE = "Archive";
export const ADMIN_PROGRESSION_LOAD = "Load";
export const ADMIN_PROGRESSION_ADJUST_XP = "Adjust XP";
export const ADMIN_PROGRESSION_ADJUST_STARTER = "Adjust Starter";
export const ADMIN_PROGRESSION_SAVE_POLICY = "Save daily policy";
export const ADMIN_PROGRESSION_SAVE_CAPS = "Save energy caps";
export const ADMIN_PROGRESSION_FLAG_ON = "ON";
export const ADMIN_PROGRESSION_FLAG_OFF = "OFF";
export const ADMIN_PROGRESSION_USER_ID = "User ID";
export const ADMIN_PROGRESSION_REASON = "Required audit reason";
export const ADMIN_PROGRESSION_AMOUNT = "+/- amount";
export const ADMIN_PROGRESSION_NEED_FIELDS = "User ID, integer amount, and reason are required";
export const ADMIN_PROGRESSION_XP_SAVED = "XP reward updated";
export const ADMIN_PROGRESSION_LEVEL_SAVED = "Level requirement updated";
export const ADMIN_PROGRESSION_MISSION_SAVED = "Mission saved";
export const ADMIN_PROGRESSION_MISSION_ARCHIVED = "Mission archived";
export const ADMIN_PROGRESSION_DAILY_SAVED = "Daily reward saved";
export const ADMIN_PROGRESSION_POLICY_SAVED = "Daily policy saved";
export const ADMIN_PROGRESSION_CAPS_SAVED = "Energy caps saved";
export const ADMIN_PROGRESSION_FLAG_SAVED = "Flag updated";
export const ADMIN_PROGRESSION_XP_ADJUSTED = "XP adjusted";
export const ADMIN_PROGRESSION_STARTER_ADJUSTED = "Starter Coins adjusted";
export const ADMIN_PROGRESSION_CLAIMS_NOTE = "Claims already recorded keep the reward awarded at claim time.";
export const ADMIN_PROGRESSION_ENERGY_NOTE = "Score/battle only — never affects Diamonds.";
export const ADMIN_PROGRESSION_HIGH_IMPACT_FLAGS = [
  "engagementNeonApproved",
  "promotionalCoinsEnabled",
  "promoGiftSpendEnabled",
  "battleEnergyEnabled",
] as const;

export const ADMIN_PROGRESSION_MISSION_AUDIENCES = [
  { value: "all_authenticated", label: "All authenticated" },
  { value: "creators_only", label: "Creators only" },
  { value: "viewers_only", label: "Viewers only" },
  { value: "new_users", label: "New users" },
] as const;

export const ADMIN_PROGRESSION_ENERGY_FIELDS = [
  "watchAmount",
  "commentAmount",
  "shareAmount",
  "watchCap",
  "commentCap",
  "shareCap",
  "storageCap",
  "sessionCap",
  "dailyCap",
  "minimumBoost",
  "fanEnergyThreshold",
  "scoreMultiplier",
  "boostDurationSec",
] as const;
