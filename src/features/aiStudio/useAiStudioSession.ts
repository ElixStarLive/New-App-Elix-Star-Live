import { useSyncExternalStore } from "react";
import { type AiStudioSession, type AiStudioSnapshot } from "./aiStudioSession";

const empty: AiStudioSnapshot = {
  videoUrl: null,
  bgUrl: null,
  playing: false,
  toolsOpen: false,
  filterCss: "none",
  enhanceCss: "none",
  combinedFilter: undefined,
  panelBackground: null,
  exporting: false,
};

export function useAiStudioSession(session: AiStudioSession): AiStudioSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
