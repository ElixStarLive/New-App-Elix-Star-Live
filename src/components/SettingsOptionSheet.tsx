import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { RoyceCloseIcon } from "@/components/royce";

type SettingsOptionSheetProps = {
  children: ReactNode;
  onClose: () => void;
  title?: string;
  headerLeft?: ReactNode;
};

export default function SettingsOptionSheet({
  children,
  onClose,
  title,
  headerLeft,
}: SettingsOptionSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);

  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    setDragY(Math.max(0, event.clientY - dragStartY.current));
  };

  const onHandlePointerEnd = () => {
    if (dragStartY.current == null) return;
    const shouldClose = dragY > 100;
    dragStartY.current = null;
    setDragging(false);
    if (shouldClose) onClose();
    else setDragY(0);
  };

  return (
    <div className="app-live-column-host elix-sheet-host z-[9999]" style={{ bottom: "var(--bottom-ui-reserve)" }}>
      <div className="absolute inset-0 elix-page-glass" onClick={onClose} aria-hidden />
      <div
        className="app-live-column elix-page-glass elix-full-page-panel elix-settings-write text-white"
        style={{
          ...(dragY > 0 || dragging ? { transform: `translateY(${dragY}px)` } : null),
          transition: dragging ? "none" : "transform 0.22s ease",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className="relative flex-shrink-0 bg-transparent border-b border-white/10"
          style={{
            paddingTop: "var(--safe-top)",
            minHeight: "calc(var(--safe-top) + 44px)",
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 top-[calc(var(--safe-top)+6px)] z-10 touch-none cursor-grab active:cursor-grabbing py-2 px-6"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            aria-hidden
          >
            <div className="w-10 h-1 bg-white/35 rounded-full" />
          </div>
          <div className="h-11 flex items-center justify-between px-2 pt-2">
            <div className="min-w-10 shrink-0 flex items-center">{headerLeft ?? <div className="w-10" aria-hidden />}</div>
            {title ? (
              <h1 className="flex-1 text-center text-[13px] font-bold leading-none truncate px-2 text-white">{title}</h1>
            ) : (
              <div className="flex-1" aria-hidden />
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              aria-label="Close"
              title="Close"
            >
              <RoyceCloseIcon />
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
}
