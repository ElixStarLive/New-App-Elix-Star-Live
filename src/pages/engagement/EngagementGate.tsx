import { Navigate, Outlet } from "react-router-dom";
import { isEngagementHubEnabled } from "@/config/engagementFlags";
import { SETTINGS_HOME } from "@/lib/settingsNav";

export default function EngagementGate() {
  if (!isEngagementHubEnabled()) {
    return <Navigate to={SETTINGS_HOME} replace />;
  }
  return <Outlet />;
}
