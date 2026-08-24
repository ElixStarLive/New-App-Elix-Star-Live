import type { ProfileEditUser } from "@shared/contracts";
import {
  apiFetchEditProfile,
  apiSaveEditProfile,
  apiUploadEditAvatar,
  editAvatarFileError,
  editUsernameError,
  normalizeEditUsername,
} from "./editProfileApi";

export type EditProfilePhase = "idle" | "loading" | "ready" | "error";

export type EditProfileSnapshot = {
  phase: EditProfilePhase;
  error: string | null;
  errorStatus: number | null;
  username: string;
  displayName: string;
  bio: string;
  website: string;
  instagram: string;
  youtube: string;
  tiktok: string;
  avatarUrl: string;
  saving: boolean;
  uploading: boolean;
};

type Listener = () => void;

const empty: EditProfileSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  username: "",
  displayName: "",
  bio: "",
  website: "",
  instagram: "",
  youtube: "",
  tiktok: "",
  avatarUrl: "",
  saving: false,
  uploading: false,
};

function applyProfile(profile: ProfileEditUser) {
  return {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    website: profile.website,
    instagram: profile.instagram,
    youtube: profile.youtube,
    tiktok: profile.tiktok,
    avatarUrl: profile.avatarUrl ?? "",
  };
}

export function createEditProfileSession() {
  let phase: EditProfilePhase = "idle";
  let error: string | null = null;
  let errorStatus: number | null = null;
  let username = "";
  let displayName = "";
  let bio = "";
  let website = "";
  let instagram = "";
  let youtube = "";
  let tiktok = "";
  let avatarUrl = "";
  let saving = false;
  let uploading = false;
  let loadGen = 0;
  const listeners = new Set<Listener>();
  let cached: EditProfileSnapshot = { ...empty };

  const snapshot = (): EditProfileSnapshot => cached;

  const notify = () => {
    cached = {
      phase,
      error,
      errorStatus,
      username,
      displayName,
      bio,
      website,
      instagram,
      youtube,
      tiktok,
      avatarUrl,
      saving,
      uploading,
    };
    for (const fn of listeners) fn();
  };

  const hydrate = (profile: ProfileEditUser) => {
    const next = applyProfile(profile);
    username = next.username;
    displayName = next.displayName;
    bio = next.bio;
    website = next.website;
    instagram = next.instagram;
    youtube = next.youtube;
    tiktok = next.tiktok;
    avatarUrl = next.avatarUrl;
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    async load() {
      const gen = ++loadGen;
      phase = "loading";
      error = null;
      errorStatus = null;
      username = "";
      displayName = "";
      bio = "";
      website = "";
      instagram = "";
      youtube = "";
      tiktok = "";
      avatarUrl = "";
      saving = false;
      uploading = false;
      notify();
      const res = await apiFetchEditProfile();
      if (gen !== loadGen) return;
      if (res.error || !res.profile) {
        phase = "error";
        error = res.error || "Failed to load profile";
        errorStatus = res.status ?? null;
        notify();
        return;
      }
      hydrate(res.profile);
      phase = "ready";
      error = null;
      errorStatus = null;
      notify();
    },
    setUsername(value: string) {
      username = normalizeEditUsername(value);
      notify();
    },
    setDisplayName(value: string) {
      displayName = value.slice(0, 50);
      notify();
    },
    setBio(value: string) {
      bio = value.slice(0, 150);
      notify();
    },
    setWebsite(value: string) {
      website = value.slice(0, 100);
      notify();
    },
    setInstagram(value: string) {
      instagram = value.slice(0, 50);
      notify();
    },
    setYoutube(value: string) {
      youtube = value.slice(0, 50);
      notify();
    },
    setTiktok(value: string) {
      tiktok = value.slice(0, 50);
      notify();
    },
    async uploadAvatar(file: File): Promise<{ ok: true; avatarUrl: string } | { ok: false; error: string }> {
      if (uploading) return { ok: false, error: "busy" };
      const invalid = editAvatarFileError(file);
      if (invalid) return { ok: false, error: invalid };
      uploading = true;
      notify();
      const res = await apiUploadEditAvatar(file, file.name);
      uploading = false;
      if (res.error || !res.avatarUrl) {
        notify();
        return { ok: false, error: res.error || "Failed to upload avatar" };
      }
      avatarUrl = res.avatarUrl;
      notify();
      return { ok: true, avatarUrl: res.avatarUrl };
    },
    async save(): Promise<{ ok: true; profile: ProfileEditUser } | { ok: false; error: string; status?: number }> {
      if (saving) return { ok: false, error: "busy" };
      const usernameProblem = editUsernameError(username);
      if (usernameProblem) return { ok: false, error: usernameProblem, status: 400 };
      saving = true;
      notify();
      const res = await apiSaveEditProfile({
        username: normalizeEditUsername(username),
        displayName,
        bio,
        website,
        instagram,
        youtube,
        tiktok,
      });
      saving = false;
      if (res.error || !res.profile) {
        notify();
        return { ok: false, error: res.error || "Failed to save profile", status: res.status };
      }
      hydrate(res.profile);
      notify();
      return { ok: true, profile: res.profile };
    },
    dispose() {
      loadGen += 1;
      phase = "idle";
      error = null;
      errorStatus = null;
      username = "";
      displayName = "";
      bio = "";
      website = "";
      instagram = "";
      youtube = "";
      tiktok = "";
      avatarUrl = "";
      saving = false;
      uploading = false;
      notify();
    },
  };
}

export type EditProfileSession = ReturnType<typeof createEditProfileSession>;
