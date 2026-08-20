import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BottomNav } from "./BottomNav";

function renderNav(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <BottomNav />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function renderNavWithRoutes(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/feed"
            element={
              <>
                <div>feed-here</div>
                <BottomNav />
              </>
            }
          />
          <Route
            path="/friends"
            element={
              <>
                <div>friends-here</div>
                <BottomNav />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 BottomNav", () => {
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

  it("renders Home Friends Create Inbox Profile with 26px icons", () => {
    const mounted = renderNav("/feed");
    root = mounted.root;
    container = mounted.container;
    const labels = [...mounted.container.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual(["Home", "Friends", "Create", "Inbox", "Profile"]);
    expect(mounted.container.querySelector('button[aria-current="page"]')?.getAttribute("aria-label")).toBe("Home");
    const homeIcon = mounted.container.querySelector('button[aria-label="Home"] svg');
    expect(homeIcon?.getAttribute("width") || homeIcon?.getAttribute("height")).toBe("26");
  });

  it("marks Profile active on nested profile routes", () => {
    const mounted = renderNav("/profile/user-1");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.querySelector('button[aria-current="page"]')?.getAttribute("aria-label")).toBe("Profile");
  });

  it("does not render on live routes", () => {
    const mounted = renderNav("/live/broadcast");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("navigates once and ignores a second tap on the current tab", () => {
    const mounted = renderNavWithRoutes("/feed");
    root = mounted.root;
    container = mounted.container;
    const friends = mounted.container.querySelector('button[aria-label="Friends"]') as HTMLButtonElement;
    act(() => {
      friends.click();
    });
    expect(mounted.container.textContent).toContain("friends-here");
    const friendsAgain = mounted.container.querySelector('button[aria-label="Friends"]') as HTMLButtonElement;
    act(() => {
      friendsAgain.click();
      friendsAgain.click();
    });
    expect(mounted.container.textContent).toContain("friends-here");
    expect(mounted.container.textContent).not.toContain("feed-here");
    const home = mounted.container.querySelector('button[aria-label="Home"]') as HTMLButtonElement;
    act(() => {
      home.click();
    });
    expect(mounted.container.textContent).toContain("feed-here");
  });
});
