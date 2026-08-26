import { apiRequest } from "./apiClient";
import { isRecord } from "./isRecord";

export type MutationResult = { ok: true } | { ok: false; error: string };

export type HttpMethod = "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Fire-and-forget request that only reports success or a message to show the user.
 * `fallbackError` is used when the server reports a failure with no message.
 */
export async function apiMutate(
  path: string,
  method: HttpMethod = "POST",
  body?: unknown,
  fallbackError?: string,
): Promise<MutationResult> {
  const { error } = await apiRequest<unknown>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (error) return { ok: false, error: error.message || fallbackError || "" };
  return { ok: true };
}

/**
 * Reads a list out of a response that may be either a bare array or an object
 * wrapping the array under `key`. Returns null when neither shape is present.
 */
export function listFrom(data: unknown, key: string): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data[key])) return data[key] as unknown[];
  return null;
}

/** `listFrom` plus per-item parsing, dropping entries the parser rejects. */
export function parseListFrom<T>(
  data: unknown,
  key: string,
  parse: (raw: unknown) => T | null,
): T[] | null {
  const list = listFrom(data, key);
  if (!list) return null;
  const parsed: T[] = [];
  for (const raw of list) {
    const item = parse(raw);
    if (item !== null) parsed.push(item);
  }
  return parsed;
}
