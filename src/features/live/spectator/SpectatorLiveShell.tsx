import { Outlet, useParams } from "react-router-dom";
import { LiveRoomScreen } from "@/features/live/LiveRoomScreen";

export default function SpectatorLiveShell() {
  const { streamId } = useParams();
  return (
    <>
      <LiveRoomScreen key={streamId || "watch"} streamId={streamId || ""} role="spectator" />
      <Outlet />
    </>
  );
}
