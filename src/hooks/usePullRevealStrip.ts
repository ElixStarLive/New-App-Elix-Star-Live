import { useEffect, useState } from "react";

export function usePullRevealStrip(
  pageRef: { current: HTMLElement | null },
  opts?: { disabled?: boolean; initiallyVisible?: boolean },
) {
  const disabled = Boolean(opts?.disabled);
  const [visible, setVisible] = useState(Boolean(opts?.initiallyVisible));

  useEffect(() => {
    const root = pageRef.current;
    if (!root || disabled) return;
    let startY: number | null = null;
    const onDown = (e: PointerEvent) => {
      startY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 10) {
        setVisible(true);
        startY = e.clientY;
      } else if (dy < -10) {
        setVisible(false);
        startY = e.clientY;
      }
    };
    const onUp = () => {
      startY = null;
    };
    root.addEventListener("pointerdown", onDown, { capture: true });
    root.addEventListener("pointermove", onMove, { capture: true });
    root.addEventListener("pointerup", onUp, { capture: true });
    root.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("pointermove", onMove, true);
      root.removeEventListener("pointerup", onUp, true);
      root.removeEventListener("pointercancel", onUp, true);
    };
  }, [pageRef, disabled]);

  return { visible };
}
