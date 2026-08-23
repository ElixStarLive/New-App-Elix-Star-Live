import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";
import { useAuthStore } from "@/store/useAuthStore";

const authVerifyEmail = vi.fn();
const checkUser = vi.fn(async () => undefined);
const setSessionToken = vi.fn();

vi.mock("@/features/auth/authSession", () => ({
  authVerifyEmail: (token: string) => authVerifyEmail(token),
}));

vi.mock("@/lib/sessionToken", () => ({
  setSessionToken: (token: string | null) => setSessionToken(token),
}));

vi.mock("@/store/useAuthStore", () => {
  const state = {
    session: null as { token: string } | null,
    user: null as unknown,
    isAuthenticated: false,
    isLoading: false,
    checkUser: () => checkUser(),
  };
  const store = Object.assign(() => state, {
    getState: () => state,
    setState: (partial: Partial<typeof state>) => Object.assign(state, partial),
    __reset: () => {
      state.session = null;
      state.user = null;
      state.isAuthenticated = false;
      state.isLoading = false;
    },
  });
  return { useAuthStore: store };
});

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
          <Route path="/profile" element={<div>profile-destination</div>} />
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
    checkUser.mockClear();
    setSessionToken.mockClear();
    (useAuthStore as unknown as { __reset: () => void }).__reset();
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

  it("verifies, seeds session, hydrates /me, and navigates to profile", async () => {
    let resolveVerify:
      | ((value: {
          ok: true;
          kind: "session";
          accessToken: string;
          user: { id: string; email: string };
          alreadyConfirmed: boolean;
        }) => void)
      | undefined;
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
    expect(authVerifyEmail).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveVerify?.({
        ok: true,
        kind: "session",
        accessToken: "session-token",
        user: { id: "u1", email: "a@b.co" },
        alreadyConfirmed: false,
      });
    });
    expect(setSessionToken).toHaveBeenCalledWith("session-token");
    expect(checkUser).toHaveBeenCalledTimes(1);
    expect(page.textContent).toContain("profile-destination");
  });

  it("does not verify when the token is missing", async () => {
    const mounted = renderCallback("");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    await act(async () => undefined);
    expect(authVerifyEmail).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Something went wrong.");
    expect(page.textContent).toContain("No confirmation token found");
  });

  it("shows an honest error when verification fails", async () => {
    authVerifyEmail.mockResolvedValue({
      ok: false,
      error: "Invalid or expired confirmation link.",
    });
    const mounted = renderCallback("?token=bad-token");
    root = mounted.root;
    container = mounted.container;
    await act(async () => undefined);
    expect(mounted.container.textContent).toContain("Invalid or expired confirmation link.");
    expect(mounted.container.textContent).toContain("Something went wrong.");
  });
});
