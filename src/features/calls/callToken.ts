import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

const CALL_ROOM_RE = /^call_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallMediaCreds = {
  callId: string;
  roomName: string;
  token: string;
  url: string;
};

export async function apiFetchCallToken(callId: string): Promise<{
  creds: CallMediaCreds | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/calls/${encodeURIComponent(callId)}/token`, {
    method: "POST",
  });
  if (error) return { creds: null, error: error.message };
  if (
    !isRecord(data) ||
    typeof data.callId !== "string" ||
    typeof data.roomName !== "string" ||
    typeof data.token !== "string" ||
    typeof data.url !== "string" ||
    !CALL_ROOM_RE.test(data.roomName) ||
    data.callId !== callId
  ) {
    return { creds: null, error: "Call media authorization failed" };
  }
  return {
    creds: {
      callId: data.callId,
      roomName: data.roomName,
      token: data.token,
      url: data.url,
    },
    error: null,
  };
}
