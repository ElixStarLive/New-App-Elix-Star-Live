import { useEffect, useMemo, useSyncExternalStore } from "react";
import { normalizeUploadKind, type UploadKind } from "@shared/uploadContract";
import { createUploadPublishSession, type UploadPublishSession, type UploadPublishState } from "./uploadSession";

export function useUploadPublishSession(
  kind: UploadKind,
  fallbackSoundId?: string | null,
): {
  state: UploadPublishState;
  session: UploadPublishSession;
} {
  const session = useMemo(
    () => createUploadPublishSession({ kind: normalizeUploadKind(kind) }),
    [kind],
  );
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  useEffect(() => {
    session.intake(fallbackSoundId ?? null);
    return () => session.dispose();
  }, [session, fallbackSoundId]);

  return { state, session };
}
