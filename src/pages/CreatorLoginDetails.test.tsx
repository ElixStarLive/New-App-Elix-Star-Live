import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { id: string; email: string; username: string; avatarUrl: string | null } | null,
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/authFeatures", () => ({ isPasswordResetEnabled: () => true }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth),
}));

import CreatorLoginDetails from "./CreatorLoginDetails";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { CREATOR_SAVED_ACCOUNTS_KEY } from "@/features/creatorLogin/creatorSavedAccounts";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry = "/creator/login-details") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/creator/login-details" element={<CreatorLoginDetails />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/profile" element={<LocationProbe />} />
          <Route path="/forgot-password" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.localStorage.clear();
  auth.user = null;
  auth.signInWithPassword.mockReset();
  auth.signOut.mockReset();
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-029 Creator login details", () => {
  it("lists saved identifiers, logs in through the shared auth API, and never stores a password", async () => {
    window.localStorage.setItem(
      CREATOR_SAVED_ACCOUNTS_KEY,
      JSON.stringify([{ identifier: "star@example.com", username: "star" }]),
    );
    const view = renderPage();
    root = view.root;
    container = view.container;
    const page = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(page.textContent).toContain("Creator Login Details");
    expect(page.textContent).toContain("Switch Accounts");
    expect(page.textContent).toContain("star");
    expect(page.textContent).toContain("Log in");
    expect(page.textContent).not.toContain("Create account");
    const password = page.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(password, "password12");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      const submit = Array.from(page.querySelectorAll("button")).find((btn) => btn.textContent === "Log in");
      submit?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith("star@example.com", "password12");
    expect(page.textContent).toContain("LOC /profile");
    expect(window.localStorage.getItem("creator_saved_password")).toBeNull();
    expect(window.localStorage.getItem(CREATOR_SAVED_ACCOUNTS_KEY)).not.toMatch(/password12/);
  });

  it("closes to Settings and uses named hardware back", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const close = container.querySelector('[aria-label="Close"]') as HTMLButtonElement | null;
    await act(async () => {
      close?.click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/creator/login-details")).toBe("/settings");
    expect(namedHardwareBackTarget("/creator/login-details", { returnTo: "/profile" })).toBe("/profile");
  });

  it("opens forgot-password for reset and recover", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const reset = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Reset password");
    await act(async () => {
      reset?.click();
    });
    expect(container.textContent).toContain("LOC /forgot-password");
  });

  it("shows Sign out when a session user is present", async () => {
    auth.user = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "star@example.com",
      username: "star",
      avatarUrl: null,
    };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Sign out");
    expect(container.textContent).not.toContain("Log in");
  });

  it("keeps the user on this page after Sign out", async () => {
    auth.user = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "star@example.com",
      username: "star",
      avatarUrl: null,
    };
    auth.signOut.mockImplementation(async () => {
      auth.user = null;
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const signOutBtn = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Sign out");
    await act(async () => {
      signOutBtn?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.signOut).toHaveBeenCalled();
    expect(container.textContent).toContain("Creator Login Details");
    expect(container.textContent).toContain("Log in");
    expect(container.textContent).not.toContain("LOC /");
  });
});
