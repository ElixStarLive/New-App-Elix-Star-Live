import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiPatchProfile, apiUploadAvatar } from "@/features/feed/feedApi";
import { PageScaffold } from "@/components/PageScaffold";
import { AvatarRing } from "@/components/AvatarRing";
import { EDIT_PROFILE_EXIT_TO, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function EditProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setUsername(user?.username ?? "");
    setBio(user?.bio ?? "");
  }, [user]);

  const save = () => {
    setBusy(true);
    void apiPatchProfile({ displayName, username, bio }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      updateUser({ displayName, username, bio });
      navigate(exitToFromLocationState(location.state, EDIT_PROFILE_EXIT_TO), { replace: true });
    });
  };

  return (
    <PageScaffold title="Edit Profile" headerBorder={false} left={<span className="w-16" />} onClose={() => navigate(exitToFromLocationState(location.state, EDIT_PROFILE_EXIT_TO), { replace: true })}>
      <div className="px-4 py-3 flex items-center justify-between">
        <button type="button" onClick={save} disabled={busy} className="px-4 py-1.5 rounded-full text-sm font-semibold disabled:opacity-50 bg-white/10 border border-white/25 text-white">
          {busy ? "Saving..." : "Save"}
        </button>
        <span className="w-[64px]" aria-hidden />
      </div>
      <div className="px-4 pt-2 pb-4 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => fileRef.current?.click()}>
              <AvatarRing src={user?.avatarUrl} alt="Avatar" size={96} />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/15 border border-white/25"
              aria-label="Change photo"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (e.target) e.target.value = "";
                if (!file) return;
                setUploading(true);
                void apiUploadAvatar(file, file.name).then((res) => {
                  setUploading(false);
                  if (res.error || !res.avatarUrl) showToast(res.error || "Avatar upload failed");
                  else updateUser({ avatarUrl: res.avatarUrl });
                });
              }}
            />
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-[#C8CDD5]">
            Change Photo
          </button>
          {uploading ? <p className="text-xs text-[#8B9099]">Uploading...</p> : null}
        </div>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value.replace(/^@+/, ""))} maxLength={30} placeholder="your_username" className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] bg-white/5 border border-white/10" />
        </Field>
        <Field label="Display Name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Your display name" className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] bg-white/5 border border-white/10" />
        </Field>
        <Field label="Bio">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150} placeholder="Tell us about yourself..." rows={3} className="w-full elix-surface rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] bg-white/5 border border-white/10 resize-none" />
          <p className="text-[11px] text-[#8B9099] mt-1 text-right">{bio.length}/150</p>
        </Field>
      </div>
    </PageScaffold>
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
