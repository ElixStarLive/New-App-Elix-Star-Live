import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NativeDialogProvider } from "./components/NativeDialog";
import "./index.css";

document.documentElement.classList.add("dark");

if (typeof document !== "undefined" && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("native-app");
  if (Capacitor.getPlatform() === "ios") {
    document.documentElement.classList.add("ios");
    void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
    void Keyboard.setScroll({ isDisabled: true }).catch(() => undefined);
  } else if (Capacitor.getPlatform() === "android") {
    document.documentElement.classList.add("android");
  }
}

if (typeof document !== "undefined") {
  try {
    const origin = window.location.origin || document.baseURI;
    const fundalHref = new URL("/elix-fundal-cosmic.png", origin.endsWith("/") ? origin : `${origin}/`).href;
    document.documentElement.style.setProperty("--elix-fundal-image", `url("${fundalHref}")`);
  } catch {
    document.documentElement.style.setProperty("--elix-fundal-image", 'url("/elix-fundal-cosmic.png")');
  }
}

window.addEventListener("error", (e) => {
  if (import.meta.env.DEV) console.error("[global error]", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason as { name?: string; message?: string } | undefined;
  if (reason?.name === "AbortError" || reason?.message?.includes("aborted")) {
    e.preventDefault();
    return;
  }
  if (import.meta.env.DEV) console.error("[unhandledrejection]", e.reason);
});

try {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <ErrorBoundary>
        <NativeDialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NativeDialogProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  const root = document.getElementById("root");
  if (root) {
    const rawMsg = e instanceof Error ? e.message : "Unexpected error";
    const msg = rawMsg.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
    );
    root.innerHTML = `<div style="padding:20px;color:red;font-family:-apple-system,sans-serif;background:#0B0B0F;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><h2 style="color:#FFFFFF">Something went wrong</h2><p style="color:#aaa;margin-top:8px">${msg}</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#FFFFFF;color:#000;border:none;border-radius:12px;font-weight:bold;cursor:pointer">Reload App</button></div>`;
  }
}
