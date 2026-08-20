import { SettingsSubpage } from "./SettingsSubpage";

export default function SafetyCenter() {
  return (
    <SettingsSubpage title="Safety Center">
      <div className="px-4 py-3 text-sm text-[#E6E9EE] space-y-3">
        <p>Report harmful content, block accounts, and review community guidelines.</p>
        <p className="text-white/60">Child safety resources are available at /child-safety.html.</p>
      </div>
    </SettingsSubpage>
  );
}
