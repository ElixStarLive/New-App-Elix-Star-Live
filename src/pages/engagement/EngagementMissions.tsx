import { EngagementListPage } from "./EngagementListPage";
export default function EngagementMissions() {
  return (
    <EngagementListPage
      title="Missions"
      path="/api/engagement/missions"
      claimPath={(id) => `/api/engagement/missions/${encodeURIComponent(id)}/claim`}
    />
  );
}
