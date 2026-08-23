/**
 * Co-host video stage geometry (OLD parity).
 * For You preview clears TopNav via `--topbar-total`.
 */
export const LIVE_COHOST_STAGE_HEIGHT = "calc(30dvh + 6mm)" as const;

export const LIVE_COHOST_STAGE_BOTTOM =
  "calc(var(--safe-top) + 90px + 9mm + 30dvh + 6mm)" as const;

export const LIVE_HOST_COHOST_STAGE_BOTTOM = "calc(90px + 9mm + 36dvh + 10mm)" as const;

export const FOR_YOU_COHOST_STAGE_TOP = "var(--topbar-total)" as const;
