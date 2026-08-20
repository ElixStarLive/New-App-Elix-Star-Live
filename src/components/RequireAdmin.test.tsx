import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RequireAdmin from "./RequireAdmin";

const authState = vi.hoisted(() => ({
  user: null as null | { isAdmin: boolean },
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
          <Route path="/" element={<div>home-destination</div>} />
          <Route path="/login" element={<div>login-destination</div>} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>admin-page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 RequireAdmin", () => {
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

  it("sends signed-in non-admins home", () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = { isAdmin: false };
    const mounted = renderGate("/admin");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.textContent).toBe("home-destination");
  });

  it("renders admin content for admins", () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = { isAdmin: true };
    const mounted = renderGate("/admin");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.textContent).toBe("admin-page");
  });
});
