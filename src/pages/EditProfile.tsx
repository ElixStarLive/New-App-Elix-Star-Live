import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import { createEditProfileSession } from "@/features/profile/editProfileSession";
import { useEditProfileSession } from "@/features/profile/useEditProfileSession";
import { EDIT_PROFILE_EXIT_TO, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function EditProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((s) => s.user?.id);
  const updateUser = useAuthStore((s) => s.updateUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(createEditProfileSession());
  const session = sessionRef.current;
  const snap = useEditProfileSession(session);

  useEffect(() => {
    if (!userId) return;
    void session.load();
    return () => {
      session.dispose();
    };
  }, [session, userId]);

  const close = () => navigate(exitToFromLocationState(location.state, EDIT_PROFILE_EXIT_TO), { replace: true });

  const onSave = () => {
    void session.save().then((res) => {
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      updateUser({
        username: res.profile.username,
        displayName: res.profile.displayName,
        bio: res.profile.bio,
        avatarUrl: res.profile.avatarUrl,
      });
      showToast("Profile saved");
      close();
    });
  };

  return (
    <SettingsOptionSheet onClose={close}>
      <div className="w-full h-full overflow-hidden bg-transparent flex flex-col">
        <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between bg-transparent">
          <button
            type="button"
            onClick={onSave}
            disabled={snap.saving || snap.phase !== "ready"}
            className="px-4 py-1.5 rounded-full text-sm font-semibold disabled:opacity-50 transition bg-white/10 border border-white/25 text-white"
          >
            {snap.saving ? "Saving..." : "Save"}
          </button>
          <h1 className="text-lg font-bold text-center flex-1 text-white">Edit Profile</h1>
          <div className="w-[64px]" aria-hidden />
        </div>

        {snap.phase === "error" ? <p className="px-4 text-rose-300 text-sm">{snap.error}</p> : null}
        {snap.phase === "loading" ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}

        {snap.phase === "ready" ? (
          <div className="px-4 pt-2 pb-4 space-y-4 flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="relative group cursor-pointer">
                <button type="button" onClick={() => fileRef.current?.click()}>
                  <AvatarRing src={snap.avatarUrl || null} alt="Avatar" size={96} />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer bg-white/15 border border-white/25"
                  aria-label="Change photo"
                >
                  <Camera className="w-4 h-4 text-white" />
                </button>
                <input
                  ref={fileRef}
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (e.target) e.target.value = "";
                    if (!file) return;
                    void session.uploadAvatar(file).then((res) => {
                      if (!res.ok) showToast(res.error);
                      else updateUser({ avatarUrl: res.avatarUrl });
                    });
                  }}
                />
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-[#C8CDD5]">
                Change Photo
              </button>
              {snap.uploading ? <p className="text-xs text-[#8B9099]">Uploading...</p> : null}
            </div>

            <div className="space-y-3 flex-1 min-h-0">
              <Field label="Username">
                <input
                  value={snap.username}
                  onChange={(e) => session.setUsername(e.target.value)}
                  placeholder="your_username"
                  maxLength={30}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
              <Field label="Display Name">
                <input
                  value={snap.displayName}
                  onChange={(e) => session.setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={50}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
              <Field label="Bio">
                <textarea
                  value={snap.bio}
                  onChange={(e) => session.setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  maxLength={150}
                  rows={3}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-relaxed text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50 resize-none"
                />
                <p className="text-[11px] text-[#8B9099] mt-1 text-right leading-none">{snap.bio.length}/150</p>
              </Field>
              <Field label="Website">
                <input
                  value={snap.website}
                  onChange={(e) => session.setWebsite(e.target.value)}
                  placeholder="https://yoursite.com"
                  maxLength={100}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
              <div className="flex items-center gap-3 py-1.5">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-[#8B9099] font-semibold uppercase tracking-wider">Social Links</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <Field label="Instagram">
                <input
                  value={snap.instagram}
                  onChange={(e) => session.setInstagram(e.target.value)}
                  placeholder="@username"
                  maxLength={50}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
              <Field label="YouTube">
                <input
                  value={snap.youtube}
                  onChange={(e) => session.setYoutube(e.target.value)}
                  placeholder="@channelname"
                  maxLength={50}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
              <Field label="TikTok">
                <input
                  value={snap.tiktok}
                  onChange={(e) => session.setTiktok(e.target.value)}
                  placeholder="@username"
                  maxLength={50}
                  className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm leading-tight text-white placeholder:text-[#8B9099] focus:border-[#E6E9EE]/50"
                />
              </Field>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsOptionSheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="block text-sm font-semibold text-[#C8CDD5] mb-1.5">{label}</div>
      {children}
    </div>
  );
}
