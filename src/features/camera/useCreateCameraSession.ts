import { useEffect, useMemo, useSyncExternalStore, type RefObject } from "react";
import { browserCameraSessionDeps, createCameraSession, type CameraSessionState, type CreateCameraSession } from "./createCameraSession";

export function useCreateCameraSession(videoRef: RefObject<HTMLVideoElement | null>): {
  state: CameraSessionState;
  session: CreateCameraSession;
} {
  const session = useMemo(
    () => createCameraSession(browserCameraSessionDeps(() => videoRef.current)),
    [videoRef],
  );
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  useEffect(() => {
    void session.open();
    const onVisibility = () => {
      if (document.hidden) session.onBackground();
      else session.onForeground();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      session.release();
    };
  }, [session]);

  return { state, session };
}
