import { useNavigate } from "react-router-dom";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME } from "@/lib/settingsNav";

export default function Guidelines() {
  const navigate = useNavigate();
  return (
    <PageScaffold title="Guidelines" onClose={() => navigate(SETTINGS_HOME, { replace: true })}>
      <div className="px-4 py-3 text-sm text-[#E6E9EE] space-y-2">
        <p>Be respectful. No hate, exploitation, or illegal content. Lives are moderated. Child sexual content is banned.</p>
      </div>
    </PageScaffold>
  );
}
