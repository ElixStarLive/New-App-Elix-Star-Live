import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveStreamCard } from "@shared/contracts";
import { apiLiveStreams } from "@/features/feed/feedApi";
import {
  createLiveSnapshotGate,
  liveEndedKeys,
  liveKey,
  parseLiveStartedCard,
  pruneEndedBefore,
  reconcileLiveSnapshot,
} from "@/features/feed/livePresence";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

type TrackedLive = LiveStreamCard & { discoveredAt: number };

export function useLiveDiscover() {
  const [streams, setStreams] = useState<TrackedLive[]>([]);
  const [loading, setLoading] = useState(true);
  const snapshotGate = useRef(createLiveSnapshotGate());
  const endedAtRef = useRef(new Map<string, number>());

  const loadSnapshot = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const ticket = snapshotGate.current.begin();
    const requestedAt = Date.now();
    const res = await apiLiveStreams();
    if (!snapshotGate.current.isCurrent(ticket)) return;
    if (res.error) {
      if (res.error.toLowerCase().includes("sign in") || res.error.toLowerCase().includes("unauthenticated")) {
        void useAuthStore.getState().checkUser();
      }
      if (!opts?.silent) showToast(res.error || "Could not load live streams");
      if (!opts?.silent) setLoading(false);
      return;
    }
    setStreams((prev) =>
      reconcileLiveSnapshot({
        snapshot: res.streams
          .filter((stream) => liveKey(stream))
          .map((stream) => ({ ...stream, discoveredAt: requestedAt })),
        previous: prev,
        keyOf: liveKey,
        discoveredAtOf: (row) => row.discoveredAt,
        requestedAt,
        endedAt: endedAtRef.current,
      }),
    );
    pruneEndedBefore(endedAtRef.current, requestedAt);
    if (!opts?.silent) setLoading(false);
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const onStarted = (data: unknown) => {
      const now = Date.now();
      const card = parseLiveStartedCard(data, now);
      if (!card) {
        void loadSnapshot({ silent: true });
        return;
      }
      for (const key of [liveKey(card), card.streamId]) {
        endedAtRef.current.delete(key);
      }
      setStreams((prev) => {
        if (prev.some((row) => liveKey(row) === liveKey(card) || row.streamId === card.streamId)) {
          return prev.map((row) =>
            liveKey(row) === liveKey(card) || row.streamId === card.streamId ? { ...row, ...card } : row,
          );
        }
        return [card, ...prev];
      });
    };
    const onEnded = (data: unknown) => {
      const keys = liveEndedKeys(data);
      if (keys.length === 0) {
        void loadSnapshot({ silent: true });
        return;
      }
      const now = Date.now();
      for (const key of keys) endedAtRef.current.set(key, now);
      setStreams((prev) =>
        prev.filter((row) => !keys.includes(liveKey(row)) && !keys.includes(row.streamId)),
      );
    };
    wsClient.on("stream_started", onStarted);
    wsClient.on("stream_ended", onEnded);
    return () => {
      wsClient.off("stream_started", onStarted);
      wsClient.off("stream_ended", onEnded);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === "visible") void loadSnapshot({ silent: true });
    };
    const onFocus = () => {
      void loadSnapshot({ silent: true });
    };
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadSnapshot]);

  return {
    streams,
    loading,
    reload: () => {
      void loadSnapshot();
    },
  };
}
