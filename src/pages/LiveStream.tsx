import { useParams } from "react-router-dom";
import { LiveRoomScreen } from "@/features/live/LiveRoomScreen";

export default function LiveStream() {
  const { streamId } = useParams();
  return <LiveRoomScreen streamId={streamId || "broadcast"} role="host" />;
}
