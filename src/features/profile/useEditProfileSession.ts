import { useSyncExternalStore } from "react";
import type { EditProfileSession, EditProfileSnapshot } from "./editProfileSession";

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

export function useEditProfileSession(session: EditProfileSession): EditProfileSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
