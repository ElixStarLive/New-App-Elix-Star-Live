let toastHandler: ((message: string) => void) | null = null;

export function setToastHandler(handler: ((message: string) => void) | null): void {
  toastHandler = handler;
}

export function showToast(message: string): void {
  if (toastHandler) {
    toastHandler(message);
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("elix-toast", { detail: { message } }));
  }
}
