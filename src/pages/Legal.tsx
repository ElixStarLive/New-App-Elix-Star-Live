import { useNavigate } from "react-router-dom";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME } from "@/lib/settingsNav";

const LINKS = [
  ["/legal/audio", "Audio"],
  ["/legal/ugc", "UGC"],
  ["/legal/affiliate", "Affiliate"],
  ["/legal/dmca", "DMCA"],
  ["/legal/safety", "Safety"],
  ["/legal/supplier", "Supplier"],
] as const;

export default function Legal() {
  const navigate = useNavigate();
  return (
    <PageScaffold title="Legal" onClose={() => navigate(SETTINGS_HOME, { replace: true })}>
      <div className="px-3 py-2">
        {LINKS.map(([path, label]) => (
          <button key={path} type="button" className="w-full flex items-center justify-between py-3 border-b border-white/10" onClick={() => navigate(path)}>
            <span>{label}</span>
            <span className="text-white/30">›</span>
          </button>
        ))}
      </div>
    </PageScaffold>
  );
}
