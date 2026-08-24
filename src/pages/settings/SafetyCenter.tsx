import { useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Ban, ChevronRight, Eye, Flag, HelpCircle, Lock } from "lucide-react";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";

export const SAFETY_HOME = "/settings/safety";
export const SAFETY_REPORT_HREF = "/report?type=support&id=support_ticket";

function SafetyRow({
  icon,
  label,
  description,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <button type="button" onClick={onPress} className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md">
      <span className="royce-glow-disc shrink-0 [&_svg]:size-[18px]" style={{ width: 36, height: 36 }}>
        <span className="royce-icon-gold">{icon}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{label}</span>
        <span className="block text-xs text-[#8B9099] mt-0.5">{description}</span>
      </span>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}

function SafetySection({ label }: { label: string }) {
  return <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">{label}</div>;
}

export default function SafetyCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || SAFETY_HOME);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const go = useCallback(
    (path: string) => {
      navigate(path, { state: childReturnState });
    },
    [navigate, childReturnState],
  );

  return (
    <SettingsOptionSheet onClose={exit} title="Safety Center">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <SafetySection label="Quick Actions" />
          <SafetyRow
            icon={<Ban size={14} />}
            label="Blocked Accounts"
            description="Manage users you've blocked."
            onPress={() => go("/settings/blocked")}
          />
          <SafetyRow
            icon={<Flag size={14} />}
            label="Report a Problem"
            description="Report users or content violating guidelines."
            onPress={() => go(SAFETY_REPORT_HREF)}
          />

          <SafetySection label="Privacy Controls" />
          <SafetyRow
            icon={<Lock size={14} />}
            label="Account Privacy"
            description="Control who can see your content."
            onPress={() => go("/edit-profile")}
          />
          <SafetyRow
            icon={<Eye size={14} />}
            label="Data & Personalization"
            description="Manage how your data is used."
            onPress={() => go("/privacy")}
          />

          <SafetySection label="Resources" />
          <SafetyRow
            icon={<AlertTriangle size={14} />}
            label="Community Guidelines"
            description="Read what is allowed on Elix Star."
            onPress={() => go("/guidelines")}
          />
          <SafetyRow
            icon={<HelpCircle size={14} />}
            label="Safety Tips"
            description="Open online safety best practices."
            onPress={() => go("/guidelines")}
          />

          <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">
            Need Immediate Help?
          </div>
          <div className="px-2.5 py-2.5 text-xs text-[#C8CDD5] leading-relaxed">
            If you or someone you know is in immediate danger, contact emergency services.
            <div className="text-[#8B9099] mt-2">US: 911&nbsp;&nbsp;|&nbsp;&nbsp;UK: 999&nbsp;&nbsp;|&nbsp;&nbsp;EU: 112</div>
          </div>

          <SafetySection label="Support" />
          <SafetyRow
            icon={<HelpCircle size={14} />}
            label="Contact Support"
            description="Send us a message and we will respond."
            onPress={() => go("/support")}
          />
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
