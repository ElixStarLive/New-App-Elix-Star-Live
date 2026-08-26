import { apiRequest } from "@/lib/apiClient";
import { apiMutate, type MutationResult } from "@/lib/apiResult";
import { isRecord } from "@/lib/isRecord";

export type CallInvite = {
  callId: string;
  roomName: string;
  livekitUrl: string;
  livekitToken: string;
};

export async function apiStartCall(userId: string): Promise<{
  invite: CallInvite | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/calls/start", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (error) return { invite: null, error: error.message };
  if (
    !isRecord(data) ||
    typeof data.callId !== "string" ||
    typeof data.roomName !== "string" ||
    typeof data.livekitUrl !== "string" ||
    typeof data.livekitToken !== "string"
  ) {
    return { invite: null, error: "Call could not be started" };
  }
  return {
    invite: {
      callId: data.callId,
      roomName: data.roomName,
      livekitUrl: data.livekitUrl,
      livekitToken: data.livekitToken,
    },
    error: null,
  };
}

export async function apiCallAction(
  callId: string,
  action: "accept" | "reject" | "end",
): Promise<MutationResult> {
  return apiMutate(`/api/calls/${encodeURIComponent(callId)}/${action}`);
}
