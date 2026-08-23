import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound, Shield, ShieldCheck } from "lucide-react";
import { nativePrompt } from "@/components/NativeDialog";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  apiDisableTwoFactor,
  apiEnrollTwoFactor,
  apiGetTwoFactorStatus,
  apiVerifyTwoFactor,
} from "@/features/security/securityApi";
import {
  createSecuritySession,
  securityTwoFactorDescription,
} from "@/features/security/securitySession";
import { isPasswordResetEnabled } from "@/lib/authFeatures";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export const SECURITY_HOME = "/settings/security";

function SecurityRow({
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

export default function SecuritySettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const showReset = isPasswordResetEnabled();
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || SECURITY_HOME);

  const session = useMemo(
    () =>
      createSecuritySession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadStatus: apiGetTwoFactorStatus,
        enroll: apiEnrollTwoFactor,
        verify: apiVerifyTwoFactor,
        disable: apiDisableTwoFactor,
        prompt: nativePrompt,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
      }),
    [],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    void session.load(userId);
  }, [session, userId]);

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
    <SettingsOptionSheet onClose={exit} title="Security">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          {showReset ? (
            <SecurityRow
              icon={<KeyRound size={14} />}
              label="Password"
              description="Reset your password via email."
              onPress={() => go("/forgot-password")}
            />
          ) : (
            <div className="px-2.5 py-2.5 text-xs text-[#8B9099] leading-relaxed">
              Password reset is unavailable until transactional email is configured on the server.
            </div>
          )}
          <SecurityRow
            icon={<Shield size={14} />}
            label="Blocked accounts"
            description="Manage people you have blocked."
            onPress={() => go("/settings/blocked")}
          />
          <SecurityRow
            icon={<ShieldCheck size={14} />}
            label="Two-factor authentication"
            description={securityTwoFactorDescription(view)}
            onPress={() => {
              void session.toggle();
            }}
          />
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
