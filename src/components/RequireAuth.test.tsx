import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RequireAuth from "./RequireAuth";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: () => authState,
}));

function renderGate(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login-destination</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/feed" element={<div>protected-feed</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 RequireAuth", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("redirects unauthenticated users to login", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    const mounted = renderGate("/feed");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.textContent).toBe("login-destination");
  });

  it("renders protected content when authenticated", () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    const mounted = renderGate("/feed");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.textContent).toBe("protected-feed");
  });
});
