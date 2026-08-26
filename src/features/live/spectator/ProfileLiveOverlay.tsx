/**
 * Full-screen profile overlay on top of an active watch session.
 * Live video/chat/WS stay mounted underneath — closing returns instantly.
 */

import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Profile from "@/pages/Profile";
import { watchSessionPathFromOverlay } from "@/lib/liveProfileNav";
import { isRecord } from "@/lib/isRecord";
import { wsClient } from "@/lib/wsClient";

export default function ProfileLiveOverlay() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const roomId = (streamId || "").trim();
  const watchPath =
    watchSessionPathFromOverlay(location.pathname, location.search) || (roomId ? `/watch/${roomId}` : "/feed");

  const closeToWatch = useCallback(() => {
    navigate(watchPath, { replace: true });
  }, [navigate, watchPath]);

  useEffect(() => {
    const onEnd = (data: unknown) => {
      const endedRoom = isRecord(data) && typeof data.roomId === "string" ? data.roomId.trim() : "";
      if (endedRoom && roomId && endedRoom !== roomId) return;
      closeToWatch();
    };
    wsClient.on("stream_ended", onEnd);
    return () => wsClient.off("stream_ended", onEnd);
  }, [closeToWatch, roomId]);

  return (
    <div className="fixed inset-0 z-[99999] bg-black" data-elix-live-profile="true">
      <Profile />
    </div>
  );
}
