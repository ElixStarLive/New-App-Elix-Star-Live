import { useNavigate } from "react-router-dom";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME } from "@/lib/settingsNav";

export default function Copyright() {
  const navigate = useNavigate();
  return (
    <PageScaffold title="Copyright" onClose={() => navigate(SETTINGS_HOME, { replace: true })}>
      <div className="px-4 py-3 text-sm text-[#E6E9EE] space-y-2">
        <p>Report copyright issues through Support. Repeat infringement may result in account action.</p>
      </div>
    </PageScaffold>
  );
}
