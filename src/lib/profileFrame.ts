const CSS_PX_PER_MM = 96 / 25.4;

export function profileRingOuterAddMm(baseOuterPx: number, mm: number): number {
  return Math.max(16, Math.round(baseOuterPx + mm * CSS_PX_PER_MM));
}

const PROFILE_RING_SIZE_BUMP_MM = 3;

export const LIVE_MVP_PROFILE_RING_PX = 28;
export const MVP_GOLD = "#D9A62E";
export const MVP_RING_EMPTY_CLASS =
  "border-[#D9A62E] shadow-[0_0_6px_0_rgba(217,166,46,0.55)]" as const;
export const MVP_RING_PHOTO_CLASS =
  "rounded-full shadow-[0_0_6px_0_rgba(217,166,46,0.55)] ring-1 ring-[#D9A62E]" as const;
export const MVP_RING_PHOTO_SOFT_CLASS =
  "rounded-full shadow-[0_0_3px_0_rgba(217,166,46,0.30)] ring-1 ring-[#D9A62E]" as const;
export const MVP_BADGE_CLASS =
  "px-1 rounded-full bg-[#D9A62E] text-white text-[6px] font-black leading-none tracking-wide" as const;

export const BATTLE_MVP_SLOTS_PER_SIDE = 3;
export const BATTLE_MVP_CIRCLE_GAP_CLASS = "gap-[3mm]" as const;

export const LEVEL_BADGE_RING_PX = 26;
export const CHAT_PROFILE_RING_PX = LEVEL_BADGE_RING_PX;
export const SPECTATOR_MVP_PROFILE_RING_PX = 28;
export const LIVE_BATTLE_VIDEO_HEIGHT = "calc(44dvh - 3mm)" as const;
export const LIVE_BATTLE_STAGE_BOTTOM =
  "calc(var(--safe-top) + 112px - 2.5mm + 44dvh - 3mm)" as const;
export const LIVE_BATTLE_CHAT_HEIGHT =
  "calc(56dvh - env(safe-area-inset-top, 0px) - 164px + 3.5mm - 56px - 4mm - max(2px, env(safe-area-inset-bottom, 0px)))" as const;
export const LIVE_BOTTOM_ACTION_PADDING =
  "max(2px, calc(env(safe-area-inset-bottom, 0px) - var(--live-bottom-action-drop, 0mm)))" as const;
export const LIVE_BOTTOM_ACTION_RESERVE =
  "calc(52px + max(2px, env(safe-area-inset-bottom, 0px)))" as const;
export const LIVE_SOLO_CHAT_TOP_FROM_BOTTOM =
  "calc(52px + max(2px, env(safe-area-inset-bottom, 0px)) + 25dvh + 2cm + 4mm)" as const;
export const LIVE_TOP_AVATAR_RING_PX = 48;
export const INLINE_LIVE_PLACEHOLDER_AVATAR_PX = profileRingOuterAddMm(96, PROFILE_RING_SIZE_BUMP_MM);
export const PROFILE_PAGE_AVATAR_PX = 96;
export const LEVEL_BADGE_PILL_PX = 22;
export const CHAT_LEVEL_PILL_SIZE_PX = LEVEL_BADGE_PILL_PX;
