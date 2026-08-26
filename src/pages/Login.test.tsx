import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const signInWithPassword = vi.fn();
const signInWithApple = vi.fn();

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: () => ({
    signInWithPassword,
    signInWithApple,
  }),
}));

vi.mock("@/lib/authFeatures", () => ({
  isAppleSignInEnabled: () => true,
  isPasswordResetEnabled: () => true,
}));

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function fillCredentials(container: HTMLElement, email: string, password: string): void {
  const emailInput = container.querySelector('input[autocomplete="email"]') as HTMLInputElement;
  const passwordInput = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
  act(() => {
    setInputValue(emailInput, email);
    setInputValue(passwordInput, password);
  });
}

function submitForm(container: HTMLElement): void {
  const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
  act(() => {
    button.click();
  });
}

function renderLogin(from?: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: from ? { from } : undefined }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/inbox" element={<div>inbox-destination</div>} />
          <Route path="/register" element={<div>register-destination</div>} />
          <Route path="/forgot-password" element={<div>forgot-destination</div>} />
          <Route path="/" element={<div>root-destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-001 Login", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    signInWithPassword.mockReset();
    signInWithApple.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("renders approved login chrome without totp or guest", () => {
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    expect(container.querySelector("h1")?.textContent).toBe("Login");
    expect(container.querySelector('img[alt="Elix Star Live"]')).toBeTruthy();
    expect(container.firstElementChild?.className).not.toContain("elix-page-glass");
    expect(container.textContent).toContain("Remember password");
    expect(container.textContent).toContain("Sign up");
    expect(container.textContent).toContain("Sign in with Apple");
    expect(container.textContent).toContain("Forgot your password?");
    expect(container.textContent).toContain("Created by Andrei Ionut Berica");
    expect(container.textContent).not.toContain("Authenticator code");
    expect(container.textContent).not.toContain("Guest");
    expect(container.textContent).not.toContain("Google");
  });

  it("prefills saved username and deletes legacy remembered password", () => {
    window.localStorage.setItem("login_save_details", "true");
    window.localStorage.setItem("login_saved_email", "saved-user");
    window.localStorage.setItem("login_saved_password", "saved-secret");
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const emailInput = container.querySelector('input[autocomplete="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    expect(emailInput.value).toBe("saved-user");
    expect(passwordInput.value).toBe("");
    expect(window.localStorage.getItem("login_saved_password")).toBeNull();
  });

  it("prefills username even when Remember password is off", () => {
    window.localStorage.setItem("login_save_details", "false");
    window.localStorage.setItem("login_saved_email", "always-user");
    window.localStorage.removeItem("login_saved_password");
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const emailInput = container.querySelector('input[autocomplete="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    expect(emailInput.value).toBe("always-user");
    expect(passwordInput.value).toBe("");
  });

  it("blocks duplicate submit and surfaces wrong credentials", async () => {
    let resolveSignIn: ((value: { error: string | null }) => void) | undefined;
    signInWithPassword.mockImplementation(
      () =>
        new Promise<{ error: string | null }>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const mounted = renderLogin("/inbox");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "andrei", "secret-password");
    submitForm(page);
    submitForm(page);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(page.textContent).toContain("Signing in...");
    await act(async () => {
      resolveSignIn?.({ error: "Incorrect email/username or password." });
    });
    expect(page.textContent).toContain("Incorrect email/username or password.");
    expect(page.textContent).toContain("Sign in");
  });

  it("clears the previous error when retrying", async () => {
    signInWithPassword
      .mockResolvedValueOnce({ error: "Incorrect email/username or password." })
      .mockResolvedValueOnce({ error: null });
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "andrei", "secret-password");
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).toContain("Incorrect email/username or password.");
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).not.toContain("Incorrect email/username or password.");
    expect(page.textContent).toContain("root-destination");
  });

  it("persists remembered email even if login unmounts after success", async () => {
    signInWithPassword.mockImplementation(async () => {
      act(() => {
        root?.unmount();
      });
      return { error: null };
    });
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "keep-after-unmount", "secret-password");
    const remember = page.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (!remember.checked) {
      act(() => {
        remember.click();
      });
    }
    await act(async () => {
      submitForm(page);
    });
    expect(window.localStorage.getItem("login_saved_email")).toBe("keep-after-unmount");
    expect(window.localStorage.getItem("login_saved_password")).toBeNull();
    expect(window.localStorage.getItem("login_save_details")).toBe("true");
  });

  it("stores username only when Remember is checked after success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "keep-me", "secret-password");
    const remember = page.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (!remember.checked) {
      act(() => {
        remember.click();
      });
    }
    await act(async () => {
      submitForm(page);
    });
    expect(window.localStorage.getItem("login_saved_email")).toBe("keep-me");
    expect(window.localStorage.getItem("login_saved_password")).toBeNull();
    expect(window.localStorage.getItem("login_save_details")).toBe("true");
  });

  it("saves username by default without toggling Remember and never stores password", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "default-save", "secret-password");
    await act(async () => {
      submitForm(page);
    });
    expect(window.localStorage.getItem("login_saved_email")).toBe("default-save");
    expect(window.localStorage.getItem("login_saved_password")).toBeNull();
    expect(window.localStorage.getItem("login_save_details")).toBe("true");
  });

  it("always stores username and clears password when Remember is off after success", async () => {
    window.localStorage.setItem("login_saved_email", "old-user");
    window.localStorage.setItem("login_saved_password", "old-secret");
    window.localStorage.setItem("login_save_details", "true");
    signInWithPassword.mockResolvedValue({ error: null });
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const remember = page.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (remember.checked) {
      act(() => {
        remember.click();
      });
    }
    fillCredentials(page, "forget-pass", "secret-password");
    await act(async () => {
      submitForm(page);
    });
    expect(window.localStorage.getItem("login_saved_email")).toBe("forget-pass");
    expect(window.localStorage.getItem("login_saved_password")).toBeNull();
    expect(window.localStorage.getItem("login_save_details")).toBe("false");
  });
  it("navigates to from after a successful login", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const mounted = renderLogin("/inbox");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "andrei", "secret-password");
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).toContain("inbox-destination");
  });

  it("navigates to from after a successful Apple sign-in", async () => {
    signInWithApple.mockResolvedValue({ error: null });
    const mounted = renderLogin("/inbox");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const apple = [...page.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Sign in with Apple"),
    ) as HTMLButtonElement;
    await act(async () => {
      apple.click();
    });
    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(page.textContent).toContain("inbox-destination");
  });

  it("does not treat AbortError as a visible login failure", async () => {
    signInWithPassword.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillCredentials(page, "andrei", "secret-password");
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).not.toContain("An unexpected error occurred. Please try again.");
    expect(page.textContent).toContain("Sign in");
  });

  it("opens Sign up with the current from state", () => {
    const mounted = renderLogin("/inbox");
    root = mounted.root;
    container = mounted.container;
    const signUp = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Sign up"));
    act(() => {
      signUp?.click();
    });
    expect(container.textContent).toContain("register-destination");
  });

  it("toggles password visibility", () => {
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const passwordInput = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
    const toggle = passwordInput.parentElement?.querySelector("button");
    act(() => {
      toggle?.click();
    });
    expect(passwordInput.type).toBe("text");
  });

  it("requires email and password on the form fields", () => {
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const emailInput = container.querySelector('input[autocomplete="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    expect(emailInput.required).toBe(true);
    expect(passwordInput.required).toBe(true);
  });

  it("opens Forgot password when the reset flag is on", () => {
    const mounted = renderLogin();
    root = mounted.root;
    container = mounted.container;
    const forgot = container.querySelector('a[href="/forgot-password"]') as HTMLAnchorElement;
    act(() => {
      forgot.click();
    });
    expect(container.textContent).toContain("forgot-destination");
  });
});
