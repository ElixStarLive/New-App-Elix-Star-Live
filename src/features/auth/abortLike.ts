/** Shared abort detection for auth form submit handlers. */
export function isAbortLike(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!err || typeof err !== "object") return false;
  const rec = err as { name?: unknown; message?: unknown };
  if (rec.name === "AbortError") return true;
  return typeof rec.message === "string" && rec.message.toLowerCase().includes("aborted");
}
