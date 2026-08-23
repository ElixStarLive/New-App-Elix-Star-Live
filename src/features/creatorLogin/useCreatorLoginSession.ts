import { useSyncExternalStore } from "react";
import type { CreatorLoginSession, CreatorLoginSnapshot } from "./creatorLoginSession";

const empty: CreatorLoginSnapshot = {
  accounts: [],
  savePref: false,
  email: "",
  username: "",
  password: "",
  showPassword: false,
  error: null,
  info: null,
  showResend: false,
  submitting: false,
  resending: false,
  switching: false,
};

export function useCreatorLoginSession(session: CreatorLoginSession): CreatorLoginSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
