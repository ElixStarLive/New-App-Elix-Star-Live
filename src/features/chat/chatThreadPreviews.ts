import { useEffect, useRef, useState } from "react";
import { apiFetchProfile, apiFetchVideoById } from "@/features/feed/feedApi";
import { firstAppShare } from "./chatThreadLinks";

export type ChatLinkPreview = {
  type: "video" | "live" | "profile";
  id: string;
  thumbnail?: string;
  username?: string;
  description?: string;
};

/** Fetch OLD-parity link cards for shared video/live/profile URLs in thread messages. */
export function useChatLinkPreviews(bodies: string[]): Record<string, ChatLinkPreview> {
  const [previews, setPreviews] = useState<Record<string, ChatLinkPreview>>({});
  const fetchedRef = useRef(new Set<string>());

  useEffect(() => {
    const toFetch: { key: string; type: ChatLinkPreview["type"]; id: string }[] = [];
    for (const body of bodies) {
      const share = firstAppShare(body);
      if (!share) continue;
      const key = `${share.type}:${share.id}`;
      if (fetchedRef.current.has(key)) continue;
      fetchedRef.current.add(key);
      toFetch.push({ key, type: share.type, id: share.id });
    }
    if (toFetch.length === 0) return;

    for (const item of toFetch) {
      if (item.type === "profile") {
        void apiFetchProfile(item.id).then(({ profile }) => {
          if (!profile) return;
          setPreviews((prev) => ({
            ...prev,
            [item.key]: {
              type: "profile",
              id: item.id,
              thumbnail: profile.avatarUrl || "",
              username: profile.displayName || profile.username || "Profile",
            },
          }));
        });
        continue;
      }
      if (item.type === "video") {
        void apiFetchVideoById(item.id).then(({ video }) => {
          if (!video) return;
          setPreviews((prev) => ({
            ...prev,
            [item.key]: {
              type: "video",
              id: item.id,
              thumbnail: video.thumbnail || undefined,
              username: video.user?.username || "",
              description: video.description || "",
            },
          }));
        });
        continue;
      }
      setPreviews((prev) => ({
        ...prev,
        [item.key]: { type: "live", id: item.id },
      }));
    }
  }, [bodies]);

  return previews;
}
