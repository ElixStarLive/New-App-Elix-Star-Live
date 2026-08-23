import type { AlertItem } from "@shared/contracts";
import { apiListAlerts, apiMarkAlertsRead } from "./alertsApi";

export type AlertsPhase = "idle" | "loading" | "ready" | "error";

export type AlertsSnapshot = {
  phase: AlertsPhase;
  viewerId: string;
  items: AlertItem[];
  total: number;
  error: string | null;
  markError: string | null;
};

type Listener = () => void;

const empty: AlertsSnapshot = {
  phase: "idle",
  viewerId: "",
  items: [],
  total: 0,
  error: null,
  markError: null,
};

export function createAlertsSession() {
  let phase: AlertsPhase = "idle";
  let viewerId = "";
  let items: AlertItem[] = [];
  let total = 0;
  let error: string | null = null;
  let markError: string | null = null;
  let loadGen = 0;
  let markBusy = false;
  const listeners = new Set<Listener>();
  let cached: AlertsSnapshot = { ...empty };

  const snapshot = (): AlertsSnapshot => cached;

  const notify = () => {
    cached = { phase, viewerId, items, total, error, markError };
    for (const fn of listeners) fn();
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    async load(nextViewerId: string) {
      const gen = ++loadGen;
      const viewerChanged = viewerId !== nextViewerId;
      viewerId = nextViewerId;
      phase = "loading";
      error = null;
      markError = null;
      // Drop prior viewer alerts immediately so A→B never flashes A's rows.
      if (viewerChanged) {
        items = [];
        total = 0;
      }
      notify();
      const res = await apiListAlerts();
      if (gen !== loadGen) return;
      if (res.error) {
        error = res.error;
        if (items.length === 0) phase = "error";
        else phase = "ready";
        notify();
        return;
      }
      items = res.items;
      total = res.total;
      error = null;
      phase = "ready";
      notify();
      if (res.unreadIds.length === 0 || markBusy) return;
      markBusy = true;
      const marked = await apiMarkAlertsRead(res.unreadIds);
      markBusy = false;
      if (gen !== loadGen) return;
      if (!marked.ok) {
        markError = marked.error;
        notify();
      }
    },
    applyStreamEnded(hostId: string, roomId: string) {
      if (!hostId && !roomId) return;
      const next = items.filter((row) => {
        if (row.kind !== "live_started") return true;
        const url = row.actionUrl || "";
        if (roomId && url.includes(roomId)) return false;
        if (hostId && url.includes(hostId)) return false;
        return true;
      });
      if (next.length === items.length) return;
      items = next;
      notify();
    },
    dispose() {
      loadGen += 1;
      markBusy = false;
      phase = "idle";
      viewerId = "";
      items = [];
      total = 0;
      error = null;
      markError = null;
      notify();
    },
  };
}

export type AlertsSession = ReturnType<typeof createAlertsSession>;
export { empty as emptyAlertsSnapshot };
