import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeDialogProvider } from "@/components/NativeDialog";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { SECURITY_HOME } from "./SecuritySettings";

const api = vi.hoisted(() => ({
  apiGetTwoFactorStatus: vi.fn(),
  apiEnrollTwoFactor: vi.fn(),
  apiVerifyTwoFactor: vi.fn(),
  apiDisableTwoFactor: vi.fn(),
}));
const prompt = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const resetEnabled = vi.hoisted(() => ({ current: true }));
const auth = vi.hoisted(() => ({
  user: { id: "user-a" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/security/securityApi", () => api);
vi.mock("@/components/NativeDialog", async () => {
  const actual = await vi.importActual<typeof import("@/components/NativeDialog")>("@/components/NativeDialog");
  return { ...actual, nativePrompt: (...args: unknown[]) => prompt(...args) };
});
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/lib/authFeatures", () => ({
  isPasswordResetEnabled: () => resetEnabled.current,
}));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

import SecuritySettings from "./SecuritySettings";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderSecurity(entry: string | { pathname: string; state?: unknown } = SECURITY_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NativeDialogProvider>
        <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
          <Routes>
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/settings" element={<LocationProbe />} />
            <Route path="/forgot-password" element={<LocationProbe />} />
            <Route path="/settings/blocked" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </NativeDialogProvider>,
    );
  });
  return { container, root };
}

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-042 Security", () => {
  beforeEach(() => {
    api.apiGetTwoFactorStatus.mockReset();
    api.apiEnrollTwoFactor.mockReset();
    api.apiVerifyTwoFactor.mockReset();
    api.apiDisableTwoFactor.mockReset();
    prompt.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    resetEnabled.current = true;
    auth.user = { id: "user-a" };
    api.apiGetTwoFactorStatus.mockResolvedValue({ ok: true, enabled: false });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the Settings option sheet and exact Security rows", async () => {
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Add an authenticator app code."));
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Security");
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    const labels = [...container.querySelectorAll("button")]
      .map((button) => (button.textContent || "").replace(/\s+/g, " ").trim())
      .filter((label) => label && label !== "Close");
    const indexOf = (needle: string) => labels.findIndex((label) => label.includes(needle));
    expect(indexOf("Password")).toBeLessThan(indexOf("Blocked accounts"));
    expect(indexOf("Blocked accounts")).toBeLessThan(indexOf("Two-factor authentication"));
    expect(container.textContent).toContain("Reset your password via email.");
    expect(container.textContent).toContain("Manage people you have blocked.");
    expect(container.textContent).not.toContain("Current password");
    expect(container.textContent).not.toContain("Enroll authenticator");
    expect(container.textContent).not.toContain("QR");
    expect(container.textContent).not.toContain("otpauth");
  });

  it("shows loading, then error, without flashing disabled", async () => {
    let resolveStatus: ((value: { ok: false; error: string; sessionExpired: boolean }) => void) | undefined;
    api.apiGetTwoFactorStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Checking status…");
    expect(container.textContent).not.toContain("Add an authenticator app code.");
    expect(container.textContent).not.toContain("Enabled — tap to disable.");
    await act(async () => {
      resolveStatus?.({ ok: false, error: "offline", sessionExpired: false });
    });
    await waitUntil(() => (container!.textContent || "").includes("Could not load 2FA status"));
    expect(container.textContent).not.toContain("Add an authenticator app code.");
    expect(container.textContent).not.toContain("Enabled — tap to disable.");
  });

  it("closes to Settings on named back and hardware back", async () => {
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Add an authenticator app code."));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget(SECURITY_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(SECURITY_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("hands Password and Blocked with Security return on a deep link", async () => {
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(row(container!, "Password")));
    act(() => {
      row(container!, "Password")?.click();
    });
    expect(container.textContent).toContain("LOC /forgot-password");
    expect(container.textContent).toContain(`STATE ${JSON.stringify({ returnTo: SECURITY_HOME })}`);
  });

  it("preserves Settings returnTo for children when opened from PAGE-040", async () => {
    const view = renderSecurity({ pathname: SECURITY_HOME, state: { returnTo: "/settings" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(row(container!, "Blocked accounts")));
    act(() => {
      row(container!, "Blocked accounts")?.click();
    });
    expect(container.textContent).toContain("LOC /settings/blocked");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
    expect(namedHardwareBackTarget("/settings/blocked", { returnTo: "/settings" })).toBe("/settings");
  });

  it("hides the password-reset row when the feature flag is off", async () => {
    resetEnabled.current = false;
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Two-factor authentication"));
    expect(container.textContent).toContain("Password reset is unavailable until transactional email is configured on the server.");
    expect(row(container, "Password")).toBeUndefined();
  });

  it("enables 2FA only after server verify and status", async () => {
    api.apiGetTwoFactorStatus
      .mockResolvedValueOnce({ ok: true, enabled: false })
      .mockResolvedValueOnce({ ok: true, enabled: true });
    api.apiEnrollTwoFactor.mockResolvedValueOnce({ ok: true, secret: "server-secret" });
    prompt.mockResolvedValueOnce("shown").mockResolvedValueOnce("123456");
    api.apiVerifyTwoFactor.mockResolvedValueOnce({ ok: true, enabled: true });
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Add an authenticator app code."));
    await act(async () => {
      row(container!, "Two-factor authentication")?.click();
    });
    await waitUntil(() => (container!.textContent || "").includes("Enabled — tap to disable."));
    expect(api.apiVerifyTwoFactor).toHaveBeenCalledWith("123456");
    expect(toast).toHaveBeenCalledWith("Two-factor authentication enabled");
    expect(container.textContent).not.toContain("server-secret");
  });

  it("keeps 2FA disabled after an invalid TOTP", async () => {
    api.apiEnrollTwoFactor.mockResolvedValueOnce({ ok: true, secret: "server-secret" });
    prompt.mockResolvedValueOnce("shown").mockResolvedValueOnce("000000");
    api.apiVerifyTwoFactor.mockResolvedValueOnce({
      ok: false,
      error: "Invalid authenticator code",
      sessionExpired: false,
    });
    const view = renderSecurity();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Add an authenticator app code."));
    await act(async () => {
      row(container!, "Two-factor authentication")?.click();
    });
    await waitUntil(() => toast.mock.calls.some((call) => String(call[0]).includes("Invalid authenticator code")));
    expect(container.textContent).toContain("Add an authenticator app code.");
    expect(container.textContent).not.toContain("Enabled — tap to disable.");
  });
});
