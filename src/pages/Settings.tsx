import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Ban,
  Bell,
  Bookmark,
  ChevronRight,
  Gift,
  Globe,
  Heart,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  Shield,
  Trash2,
  User,
  Video,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { authDeleteAccount } from "@/features/auth/authSession";
import {
  ENGAGEMENT_HOME,
  SETTINGS_EXIT_TO,
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { X } from "lucide-react";

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const liveNotifications = useSettingsStore((s) => s.liveNotifications);
  const setLiveNotifications = useSettingsStore((s) => s.setLiveNotifications);
  const muteAllSounds = useSettingsStore((s) => s.muteAllSounds);
  const setMuteAllSounds = useSettingsStore((s) => s.setMuteAllSounds);
  const [busy, setBusy] = useState(false);
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || SETTINGS_HOME);

  const Row = ({ ic, t, v, fn }: { ic: React.ReactNode; t: string; v?: string; fn: () => void }) => (
    <button type="button" onClick={fn} className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md">
      <span className="royce-glow-disc shrink-0" style={{ width: 36, height: 36 }}>{ic}</span>
      <span className="flex-1 min-w-0 text-[15px] leading-tight text-[#E6E9EE]">{t}</span>
      {v ? <span className="text-[12px] tabular-nums shrink-0 text-[#C8CDD5]">{v}</span> : null}
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
  const S = ({ t }: { t: string }) => (
    <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">{t}</div>
  );

  return (
    <div className="page-above-bottom-nav min-h-full">
      <div className="page-above-bottom-nav__inner elix-settings-write min-h-full flex flex-col">
        <header className="flex items-center justify-between px-3 pb-2 border-b border-[#D8D9DD]/45" style={{ paddingTop: "var(--page-header-top)" }}>
          <span className="w-10" />
          <h1 className="text-[16px] font-bold text-[#E6E9EE]">Settings</h1>
          <button type="button" className="royce-glow-disc" onClick={() => navigate(exitToFromLocationState(location.state, SETTINGS_EXIT_TO), { replace: true })} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-[3mm]">
          <div className="flex flex-col items-center pb-3">
            <img src="/elix-logo.png" alt="Elix Star Live" className="w-20 h-20 object-contain" />
          </div>
          <S t="Account" />
          <Row ic={<User size={14} />} t="Edit profile" fn={() => navigate("/edit-profile", { state: childReturnState })} />
          <Row ic={<Lock size={14} />} t="Privacy" fn={() => navigate("/settings/safety", { state: childReturnState })} />
          <Row ic={<Shield size={14} />} t="Security" fn={() => navigate("/settings/security", { state: childReturnState })} />
          <Row ic={<Wallet size={14} />} t="Creator payout" fn={() => navigate("/settings/payout", { state: childReturnState })} />
          <Row ic={<Gift size={14} />} t="Engagement Hub" fn={() => navigate(ENGAGEMENT_HOME, { state: childReturnState })} />
          {user?.isAdmin ? <Row ic={<LayoutDashboard size={14} />} t="Admin" fn={() => navigate("/admin", { state: childReturnState })} /> : null}

          <S t="Preferences" />
          <Row ic={<Bell size={14} />} t="Notifications" fn={() => navigate("/settings/notifications", { state: childReturnState })} />
          <Row ic={<Bell size={14} />} t="Live notifications" v={liveNotifications ? "On" : "Off"} fn={() => setLiveNotifications(!liveNotifications)} />
          <Row ic={muteAllSounds ? <VolumeX size={14} /> : <Volume2 size={14} />} t="Mute all sounds" v={muteAllSounds ? "On" : "Off"} fn={() => setMuteAllSounds(!muteAllSounds)} />
          <Row ic={<Moon size={14} />} t="Dark mode" v="On" fn={() => showToast("Dark mode is always on")} />
          <Row ic={<Globe size={14} />} t="Language" v="EN" fn={() => showToast("English")} />

          <S t="Content" />
          <Row ic={<Video size={14} />} t="Video quality" v="Auto" fn={() => showToast("Auto")} />
          <Row ic={<Heart size={14} />} t="Liked videos" fn={() => navigate("/profile?tab=liked", { state: childReturnState })} />
          <Row ic={<Bookmark size={14} />} t="Saved videos" fn={() => navigate("/saved", { state: childReturnState })} />

          <S t="Safety" />
          <Row ic={<Ban size={14} />} t="Blocked accounts" fn={() => navigate("/settings/blocked", { state: childReturnState })} />
          <Row ic={<Shield size={14} />} t="Safety Center" fn={() => navigate("/settings/safety", { state: childReturnState })} />

          <S t="Support" />
          <Row ic={<HelpCircle size={14} />} t="How the app works" fn={() => navigate("/how-it-works", { state: childReturnState })} />
          <Row ic={<HelpCircle size={14} />} t="Help & Support" fn={() => navigate("/support", { state: childReturnState })} />

          <div className="grid grid-cols-3 gap-1 mt-auto pt-4">
            <button type="button" onClick={() => navigate("/terms")} className="text-[12px] py-2 text-center text-[#E6E9EE]">Terms</button>
            <button type="button" onClick={() => navigate("/privacy")} className="text-[12px] py-2 text-center text-[#E6E9EE]">Privacy</button>
            <button type="button" onClick={() => navigate("/guidelines")} className="text-[12px] py-2 text-center text-[#E6E9EE]">Guidelines</button>
          </div>
          <div className="mt-3 pt-2.5 flex items-center justify-center gap-6 border-t border-white/10">
            <button type="button" onClick={() => void signOut().then(() => navigate("/login"))} className="flex items-center gap-1.5 py-1.5 text-[13px] px-2.5 text-[#E6E9EE]">
              <LogOut size={15} /> Logout
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Delete your account?")) return;
                setBusy(true);
                void authDeleteAccount().then((res) => {
                  setBusy(false);
                  if (!res.ok) showToast(res.error);
                  else void signOut().then(() => navigate("/login"));
                });
              }}
              className="flex items-center gap-1.5 py-1.5 text-[13px] px-2.5 text-[#E6E9EE]"
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
