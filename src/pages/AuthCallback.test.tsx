import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";

const authVerifyEmail = vi.fn();

vi.mock("@/features/auth/authSession", () => ({
  authVerifyEmail: (token: string) => authVerifyEmail(token),
}));

function renderCallback(search: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    window.history.replaceState({}, "", `/auth/callback${search}`);
    root.render(
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<div>login-destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-003 AuthCallback", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    authVerifyEmail.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    window.history.replaceState({}, "", "/");
  });

  it("renders loading chrome then success without creating a local session", async () => {
    let resolveVerify: ((value: { ok: true; alreadyConfirmed: boolean }) => void) | undefined;
    authVerifyEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const mounted = renderCallback("?token=fresh-verify-token");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    expect(page.querySelector("h1")?.textContent).toBe("Auth Callback");
    expect(page.textContent).toContain("Working...");
    expect(page.textContent).toContain("Confirming your email...");
    expect(page.textContent).toContain("Go to Login");
    expect(authVerifyEmail).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveVerify?.({ ok: true, alreadyConfirmed: false });
    });
    expect(page.textContent).toContain("Done.");
    expect(page.textContent).toContain("Email confirmed. You can sign in now.");
  });

  it("does not verify when the token is missing", async () => {
    const mounted = renderCallback("");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    expect(authVerifyEmail).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Something went wrong.");
    expect(page.textContent).toContain("No confirmation token found. Try signing in again.");
  });

  it("shows invalid/expired server errors honestly", async () => {
    authVerifyEmail.mockResolvedValue({ ok: false, error: "This confirmation link has expired." });
    const mounted = renderCallback("?token=expired-token-value");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    expect(page.textContent).toContain("Something went wrong.");
    expect(page.textContent).toContain("This confirmation link has expired.");
  });

  it("treats oauth error params as failure without verifying", async () => {
    const mounted = renderCallback("?error=access_denied&error_description=User%20cancelled");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    expect(authVerifyEmail).not.toHaveBeenCalled();
    expect(page.textContent).toContain("User cancelled");
  });

  it("navigates to Login from the button", async () => {
    authVerifyEmail.mockResolvedValue({ ok: true, alreadyConfirmed: true });
    const mounted = renderCallback("?token=already-done");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    const button = [...page.querySelectorAll("button")].find((el) => el.textContent?.includes("Go to Login"));
    act(() => {
      button?.click();
    });
    expect(page.textContent).toContain("login-destination");
  });

  it("does not treat network failure as success", async () => {
    authVerifyEmail.mockResolvedValue({ ok: false, error: "Network error" });
    const mounted = renderCallback("?token=fresh-verify-token");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    expect(page.textContent).toContain("Something went wrong.");
    expect(page.textContent).toContain("Network error");
    expect(page.textContent).not.toContain("Email confirmed");
  });
});
