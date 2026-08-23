import { useSyncExternalStore } from "react";
import { createAlertsSession, emptyAlertsSnapshot, type AlertsSession, type AlertsSnapshot } from "./alertsSession";

export function useAlertsSession(session: AlertsSession): AlertsSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => emptyAlertsSnapshot);
}

export { createAlertsSession };
