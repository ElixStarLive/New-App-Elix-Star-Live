import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TopNav } from "./TopNav";

function renderNav(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <TopNav />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 TopNav", () => {
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

  it("renders For You tabs only on /feed", () => {
    const mounted = renderNav("/feed");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.querySelector('button[aria-label="LIVE"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="STEM"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="Explore"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="Following"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="Shop"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="Search"]')).toBeTruthy();
  });

  it("hides on STEM", () => {
    const mounted = renderNav("/stem");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeNull();
  });

  it("hides while the user profile overlay is open", () => {
    document.body.setAttribute("data-user-profile-open", "");
    const mounted = renderNav("/feed");
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeNull();
    document.body.removeAttribute("data-user-profile-open");
  });
});
