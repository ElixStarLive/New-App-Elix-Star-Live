import { useLocation, useNavigate } from "react-router-dom";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export function LegalDocPage({ title, src }: { title: string; src: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <PageScaffold title={title} onClose={() => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true })}>
      <iframe title={title} src={src} className="w-full min-h-[80dvh] bg-transparent border-0" />
    </PageScaffold>
  );
}
