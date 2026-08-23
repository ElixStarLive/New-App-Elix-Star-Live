import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceBackIcon } from "@/components/royce";
import type { InboxActivityItem } from "@shared/contracts";
import { inboxActivityActorName, inboxActivityLine } from "./inboxActivityLine";

export function InboxActivityOverlay({
  open,
  items,
  error,
  loading,
  onClose,
  onOpenVideo,
}: {
  open: boolean;
  items: InboxActivityItem[];
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onOpenVideo: (videoId: string) => void;
}) {
  if (!open) return null;

  let body: ReactNode = null;
  if (loading && items.length === 0 && !error) {
    body = null;
  } else if (error && items.length === 0) {
    body = <p className="text-rose-300 text-sm py-6 text-center px-4">{error}</p>;
  } else if (items.length === 0) {
    body = (
      <p className="text-gold-bright/50 text-sm py-6 text-center px-4">
        No activity yet. When someone likes, comments on, saves your video, or @mentions you, it will show here.
      </p>
    );
  } else {
    body = (
      <div className="space-y-0.5 pb-4 px-4 bg-transparent">
        {items.map((item) => {
          const actorName = inboxActivityActorName(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.videoId) onOpenVideo(item.videoId);
                else onClose();
              }}
              className="flex items-center gap-3 w-full text-left py-2.5 px-0 bg-transparent"
            >
              <AvatarRing src={item.actorAvatarUrl || ""} alt={actorName} size={48} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gold-bright truncate">{actorName}</p>
                <p className="text-gold-bright/70 text-xs truncate">
                  {inboxActivityLine(item)}
                  {item.videoId ? " · Tap to view" : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return createPortal(
    <div className="page-above-bottom-nav bg-transparent z-[101] pointer-events-auto">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
          <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
            <div className="w-8" aria-hidden />
            <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">Activity</h2>
            <button type="button" onClick={onClose} className="p-1 z-10" title="Close" aria-label="Close activity">
              <RoyceBackIcon />
            </button>
          </div>
          {body}
        </div>
      </div>
    </div>,
    document.body,
  );
}
