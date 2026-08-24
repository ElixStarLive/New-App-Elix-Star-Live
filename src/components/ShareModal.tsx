import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  Flag,
  MessageCircle,
  QrCode,
  Send,
  Share2,
  TrendingUp,
  Users2,
  Search,
} from "lucide-react";
import { apiFollowList, apiTrackInteraction } from "@/features/feed/feedApi";
import { apiEnsureDmThread, apiSendThreadMessage } from "@/features/chat/chatApi";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { getPublicWebOrigin } from "@/lib/api";
import { nativeShareUrl, openExternalLink } from "@/lib/platform";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const SHARE_PANEL_AVATAR_PX = 36;
const SHARE_PANEL_ITEM_WIDTH_PX = 48;
const SHARE_PANEL_ACTION_DISC_PX = 40;
const SHARE_PANEL_ACTION_ICON_PX = 22;

type ShareContact = {
  userId: string;
  username: string;
  avatarUrl: string | null;
};

export default function ShareModal({
  isOpen,
  onClose,
  videoId,
  caption,
  onReport,
  onPromote,
  onDownload,
}: {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  caption: string;
  onReport: () => void;
  onPromote: () => void;
  onDownload: () => void;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [shareQuery, setShareQuery] = useState("");
  const [contacts, setContacts] = useState<ShareContact[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const videoUrl = `${getPublicWebOrigin()}/video/${videoId}`;
  const shareText = caption ? `${caption} ${videoUrl}` : videoUrl;

  useEffect(() => {
    if (!isOpen) return;
    setCopiedLink(false);
    setShowQrCode(false);
    setShareQuery("");
    setSentTo(new Set());
    let cancelled = false;
    const selfId = user?.id;
    if (!selfId) {
      setContacts([]);
      return;
    }
    void Promise.all([apiFollowList(selfId, "following"), apiFollowList(selfId, "followers")]).then(
      ([following, followers]) => {
        if (cancelled) return;
        const dedup = new Map<string, ShareContact>();
        for (const row of [...following.users, ...followers.users]) {
          if (!row.id || row.id === selfId) continue;
          const label = row.displayName || row.username;
          if (!label) continue;
          dedup.set(row.id, {
            userId: row.id,
            username: label,
            avatarUrl: row.avatarUrl,
          });
        }
        setContacts(Array.from(dedup.values()));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.id]);

  const filtered = useMemo(() => {
    const q = shareQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((row) => row.username.toLowerCase().includes(q));
  }, [contacts, shareQuery]);

  const markShared = useCallback(() => {
    void apiTrackInteraction(videoId, "share");
  }, [videoId]);

  const sendShareTo = useCallback(
    (targetId: string) => {
      void apiEnsureDmThread(targetId).then((thread) => {
        if (!thread.threadId) {
          showToast(thread.error || "Could not send");
          return;
        }
        void apiSendThreadMessage(thread.threadId, shareText).then((sent) => {
          if (sent.error) {
            showToast(sent.error);
            return;
          }
          markShared();
          setSentTo((prev) => new Set(prev).add(targetId));
          showToast("Sent");
        });
      });
    },
    [markShared, shareText],
  );

  const handleCopyLink = useCallback(() => {
    void navigator.clipboard.writeText(videoUrl).then(
      () => {
        setCopiedLink(true);
        markShared();
        showToast("Link copied!");
      },
      () => showToast("Could not copy link"),
    );
  }, [markShared, videoUrl]);

  const shareNative = useCallback(() => {
    void nativeShareUrl({ title: "Elix Star Live", text: shareText, url: videoUrl }).then((ok) => {
      if (ok) markShared();
    });
  }, [markShared, shareText, videoUrl]);

  if (!isOpen) return null;

  const social = [
    {
      name: "WhatsApp",
      icon: MessageCircle,
      run: () => {
        markShared();
        openExternalLink(`https://wa.me/?text=${encodeURIComponent(`${shareText}`)}`);
      },
    },
    {
      name: "Facebook",
      icon: Share2,
      run: () => {
        markShared();
        openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(videoUrl)}`);
      },
    },
    {
      name: "Twitter",
      icon: Share2,
      run: () => {
        markShared();
        openExternalLink(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(videoUrl)}`,
        );
      },
    },
    { name: "Copy Link", icon: copiedLink ? Check : Copy, run: handleCopyLink },
    {
      name: "Email",
      icon: Send,
      run: () => {
        markShared();
        openExternalLink(`mailto:?subject=Check out this video&body=${encodeURIComponent(`${shareText}`)}`);
      },
    },
  ] as const;

  const actions = [
    { name: "Duet", icon: Users2, run: () => navigate("/create") },
    { name: "Promote", icon: TrendingUp, run: onPromote },
    { name: "Report", icon: Flag, run: onReport },
    { name: "Share", icon: Share2, run: shareNative },
    { name: "Download", icon: Download, run: onDownload },
    { name: "QR Code", icon: QrCode, run: () => setShowQrCode((open) => !open) },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-modals bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="elix-panel elix-share-sheet bottom-sheet-above-nav w-full max-w-[480px] rounded-t-2xl overflow-hidden flex flex-col h-[calc(38vh-13mm)] border border-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-col px-4 pt-0.5 pb-2 border-b border-white/10 flex-shrink-0">
          <div className="flex justify-center pb-2" aria-hidden>
            <div className="w-10 h-1 rounded-full bg-white/25 flex-shrink-0" />
          </div>
          <div className="absolute left-4 top-0 flex items-center gap-1 z-10" style={{ transform: "translateY(1mm)" }}>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-[#D8D9DD]/35">
              <Search className="w-3.5 h-3.5 text-[#F5F5F7]" />
            </div>
            <input
              value={shareQuery}
              onChange={(e) => setShareQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-[#F5F5F7]/90 text-xs outline-none w-[72px] placeholder:text-[#F5F5F7]/45"
              aria-label="Search"
            />
          </div>
          <h3 className="text-[#F5F5F7] font-bold text-sm text-center w-full">Share to</h3>
        </div>

        <div className="flex gap-3 overflow-x-auto overflow-y-hidden pt-2 pb-3 flex-shrink-0 px-4 no-scrollbar">
          {filtered.map((row) => (
            <button
              key={row.userId}
              type="button"
              className="flex-shrink-0 flex flex-col items-center gap-1 active:scale-95 transition-transform overflow-visible"
              style={{ width: SHARE_PANEL_ITEM_WIDTH_PX, minWidth: SHARE_PANEL_ITEM_WIDTH_PX }}
              onClick={() => sendShareTo(row.userId)}
            >
              <StoryGoldRingAvatar
                size={SHARE_PANEL_AVATAR_PX}
                src={row.avatarUrl || ""}
                alt={row.username}
              />
              <span className="text-white/80 text-[11px] font-medium truncate w-full text-center">
                {sentTo.has(row.userId) ? "Sent" : row.username}
              </span>
            </button>
          ))}
        </div>

        <div className="mx-4 border-t border-[#D8D9DD]/45 flex-shrink-0" aria-hidden />

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 pb-2 flex flex-col no-scrollbar" style={{ scrollbarWidth: "none" }}>
          {showQrCode ? (
            <div className="pt-2 pb-3 flex flex-col items-center gap-2 border-b border-white/10 mb-2">
              <div className="flex items-center justify-between w-full">
                <span className="text-white/80 text-sm font-medium">Scan to open video</span>
                <button type="button" onClick={() => setShowQrCode(false)} className="text-white/70 text-xs px-2 py-1 rounded">
                  Close
                </button>
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(videoUrl)}`}
                alt="QR code for video link"
                className="w-28 h-28 rounded-lg bg-white p-1.5"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 auto-rows-fr" style={{ paddingTop: "3mm" }}>
            {social.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => item.run()}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <span
                  className="relative royce-glow-disc flex-shrink-0"
                  style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }}
                >
                  <item.icon size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                </span>
                <span className="text-[10px] font-semibold text-[#F5F5F7]">{item.name}</span>
              </button>
            ))}
            {actions.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  onClose();
                  item.run();
                }}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <span
                  className="relative royce-glow-disc flex-shrink-0"
                  style={{ width: SHARE_PANEL_ACTION_DISC_PX, height: SHARE_PANEL_ACTION_DISC_PX }}
                >
                  <item.icon size={SHARE_PANEL_ACTION_ICON_PX} className="royce-icon-gold" strokeWidth={2} />
                </span>
                <span className="text-[10px] font-semibold text-[#F5F5F7]">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
