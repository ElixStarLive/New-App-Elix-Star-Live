import { useCallback, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Ban,
  Bell,
  Bookmark,
  BookOpen,
  ChevronRight,
  Gift,
  Globe,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  Radio,
  Shield,
  Trash2,
  User,
  Video,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import LanguagePickerSheet from "@/components/LanguagePickerSheet";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import { isEngagementHubEnabled } from "@/config/engagementFlags";
import { requestSettingsDeleteAccount, requestSettingsLogout } from "@/features/settings/settingsSession";
import { LANGUAGE_SHORT, useT } from "@/lib/i18n";
import {
  ENGAGEMENT_HOME,
  SETTINGS_EXIT_TO,
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

function SettingsRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <button type="button" onClick={onPress} className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md">
      {icon ? (
        <span className="royce-glow-disc shrink-0 [&_svg]:size-[18px]" style={{ width: 36, height: 36 }}>
          <span className="royce-icon-gold">{icon}</span>
        </span>
      ) : null}
      <span className="flex-1 min-w-0 text-[15px] leading-tight text-[#E6E9EE]">{label}</span>
      {value ? <span className="text-[12px] tabular-nums shrink-0 text-[#C8CDD5]">{value}</span> : null}
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}

function SettingsSection({ label }: { label: string }) {
  return <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">{label}</div>;
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useT();
  const [languageOpen, setLanguageOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const liveNotifications = useSettingsStore((state) => state.liveNotifications);
  const setLiveNotifications = useSettingsStore((state) => state.setLiveNotifications);
  const muteAllSounds = useSettingsStore((state) => state.muteAllSounds);
  const setMuteAllSounds = useSettingsStore((state) => state.setMuteAllSounds);
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || SETTINGS_HOME);

  const exitSettings = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_EXIT_TO), { replace: true });
  }, [navigate, location.state]);

  const go = useCallback(
    (path: string) => {
      navigate(path, { state: childReturnState });
    },
    [navigate, childReturnState],
  );

  const handleLogout = async () => {
    try {
      const outcome = await requestSettingsLogout(signOut);
      if (!outcome.started) return;
      const serverError = useAuthStore.getState().lastError;
      if (serverError) showToast(serverError);
      navigate("/login", { replace: true });
    } catch {
      showToast("Sign out failed");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const outcome = await requestSettingsDeleteAccount(signOut);
      if ("cancelled" in outcome && outcome.cancelled) return;
      if (!outcome.ok) {
        showToast(outcome.error);
        return;
      }
      navigate("/login", { replace: true });
    } catch {
      showToast("Something went wrong. Please try again.");
    }
  };

  return (
    <SettingsOptionSheet onClose={exitSettings} title={t("settings.title")}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <div className="flex flex-col items-center pb-3">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
          </div>

          <SettingsSection label={t("settings.section.account")} />
          <SettingsRow icon={<User size={14} />} label={t("settings.editProfile")} onPress={() => go("/edit-profile")} />
          <SettingsRow icon={<Lock size={14} />} label={t("settings.privacy")} onPress={() => go("/settings/safety")} />
          <SettingsRow icon={<Shield size={14} />} label={t("settings.security")} onPress={() => go("/settings/security")} />
          <SettingsRow icon={<Trash2 size={14} />} label={t("settings.deleteAccount")} onPress={() => void handleDeleteAccount()} />
          <SettingsRow icon={<Wallet size={14} />} label="Creator payout" onPress={() => go("/settings/payout")} />
          {isEngagementHubEnabled() ? (
            <SettingsRow icon={<Gift size={14} />} label="Engagement Hub" onPress={() => go(ENGAGEMENT_HOME)} />
          ) : null}
          {user?.isAdmin === true ? <SettingsRow icon={<LayoutDashboard size={14} />} label="Admin" onPress={() => go("/admin")} /> : null}

          <SettingsSection label={t("settings.section.preferences")} />
          <SettingsRow icon={<Bell size={14} />} label={t("settings.notifications")} onPress={() => go("/settings/notifications")} />
          <SettingsRow
            icon={<Radio size={14} />}
            label={t("settings.liveNotifications")}
            value={liveNotifications ? t("common.on") : t("common.off")}
            onPress={() => setLiveNotifications(!liveNotifications)}
          />
          <SettingsRow
            icon={muteAllSounds ? <VolumeX size={14} /> : <Volume2 size={14} />}
            label="Mute all sounds"
            value={muteAllSounds ? t("common.on") : t("common.off")}
            onPress={() => {
              const next = !muteAllSounds;
              setMuteAllSounds(next);
              showToast(next ? "All app sounds muted" : "App sounds on");
            }}
          />
          <SettingsRow
            icon={<Moon size={14} />}
            label={t("settings.darkMode")}
            value={t("common.on")}
            onPress={() => showToast(t("toast.darkModeAlwaysOn"))}
          />
          <SettingsRow
            icon={<Globe size={14} />}
            label={t("settings.language")}
            value={LANGUAGE_SHORT[lang]}
            onPress={() => setLanguageOpen(true)}
          />

          <SettingsSection label={t("settings.section.content")} />
          <SettingsRow
            icon={<Video size={14} />}
            label={t("settings.videoQuality")}
            value={t("common.auto")}
            onPress={() => showToast(t("toast.videoQualityAuto"))}
          />
          <SettingsRow icon={<Heart size={14} />} label={t("settings.likedVideos")} onPress={() => go("/profile?tab=liked")} />
          <SettingsRow icon={<Bookmark size={14} />} label="Saved videos" onPress={() => go("/saved")} />

          <SettingsSection label={t("settings.section.safety")} />
          <SettingsRow icon={<Ban size={14} />} label={t("settings.blockedAccounts")} onPress={() => go("/settings/blocked")} />
          <SettingsRow icon={<Shield size={14} />} label={t("settings.safetyCenter")} onPress={() => go("/settings/safety")} />

          <SettingsSection label={t("settings.section.support")} />
          <SettingsRow icon={<BookOpen size={14} />} label="How the app works" onPress={() => go("/how-it-works")} />
          <SettingsRow icon={<HelpCircle size={14} />} label={t("settings.helpSupport")} onPress={() => go("/support")} />

          <div className="grid grid-cols-3 gap-1 mt-auto pt-4 px-0.5">
            <button
              type="button"
              onClick={() => go("/terms")}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight text-[#E6E9EE]"
            >
              {t("common.terms")}
            </button>
            <button
              type="button"
              onClick={() => go("/privacy")}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight text-[#E6E9EE]"
            >
              {t("common.privacy")}
            </button>
            <button
              type="button"
              onClick={() => go("/guidelines")}
              className="text-[12px] py-2 rounded-md active:bg-white/5 text-center leading-tight text-[#E6E9EE]"
            >
              {t("common.guidelines")}
            </button>
          </div>

          <div className="mt-3 pt-2.5 flex items-center justify-center gap-6 border-t border-white/10">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex items-center gap-1.5 py-1.5 text-[13px] active:bg-white/5 px-2.5 rounded-md text-[#E6E9EE]"
            >
              <LogOut size={15} className="royce-icon-gold" /> {t("common.logout")}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              className="flex items-center gap-1.5 py-1.5 text-[13px] active:bg-white/20/10 px-2.5 rounded-md text-[#E6E9EE]"
            >
              <Trash2 size={15} className="royce-icon-gold" /> {t("common.delete")}
            </button>
          </div>
          <div className="text-center text-[9px] pt-1.5 pb-0.5 text-[#8B9099] opacity-40">v1.0.0</div>
        </div>
      </div>
      {languageOpen ? <LanguagePickerSheet onClose={() => setLanguageOpen(false)} /> : null}
    </SettingsOptionSheet>
  );
}
