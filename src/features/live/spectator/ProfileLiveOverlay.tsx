import { useNavigate, useParams } from "react-router-dom";
import Profile from "@/pages/Profile";

export default function ProfileLiveOverlay() {
  const { streamId, userId } = useParams();
  const navigate = useNavigate();
  if (!userId) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/70" onClick={() => navigate(`/watch/${streamId}`, { replace: true })}>
      <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <Profile />
      </div>
    </div>
  );
}
