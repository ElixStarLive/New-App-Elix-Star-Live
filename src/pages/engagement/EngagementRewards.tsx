import { EngagementListPage } from "./EngagementListPage";
export default function EngagementRewards() {
  return (
    <EngagementListPage
      title="Rewards"
      path="/api/engagement/rewards"
      claimPath={(id) => `/api/engagement/missions/${encodeURIComponent(id)}/claim`}
    />
  );
}
