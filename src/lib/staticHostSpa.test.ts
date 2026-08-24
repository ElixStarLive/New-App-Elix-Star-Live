import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(resolve(process.cwd(), "public/static-host-spa.js"), "utf8");
const notFound = readFileSync(resolve(process.cwd(), "public/404.html"), "utf8");
const entry = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function loadSpa(locationLike: {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  replace: (url: string) => void;
}) {
  const historyCalls: string[] = [];
  const sandbox = {
    window: {
      location: locationLike,
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          historyCalls.push(url);
        },
      },
      ElixStaticHostSpa: undefined as
        | {
            bounceMissingFileToAppEntry: (loc?: typeof locationLike) => void;
            restoreAppEntryFromQuery: (loc?: typeof locationLike) => void;
          }
        | undefined,
    },
  };
  const runner = new Function("window", `${script}\nreturn window.ElixStaticHostSpa;`);
  const api = runner(sandbox.window) as NonNullable<(typeof sandbox.window)["ElixStaticHostSpa"]>;
  return { api, historyCalls };
}

describe("static-host SPA path contract", () => {
  it("is the single owner used by 404 and index", () => {
    expect(notFound).toContain("/static-host-spa.js");
    expect(notFound).toContain("bounceMissingFileToAppEntry");
    expect(notFound).not.toContain("pathSegmentsToKeep");
    expect(entry).toContain("/static-host-spa.js");
    expect(entry).toContain("restoreAppEntryFromQuery");
    expect(entry).not.toContain("~and~");
  });

  it("encodes a missing file path into ?/ with ~and~", () => {
    let replaced = "";
    const { api } = loadSpa({
      protocol: "https:",
      hostname: "www.elixstarlive.co.uk",
      port: "",
      pathname: "/app/watch/room-1",
      search: "?ref=a&b=1",
      hash: "#top",
      replace: (url) => {
        replaced = url;
      },
    });
    api.bounceMissingFileToAppEntry();
    expect(replaced).toBe("https://www.elixstarlive.co.uk/app/?/watch/room-1&ref=a~and~b=1#top");
  });

  it("restores a ?/ search back onto the entry path", () => {
    const { api, historyCalls } = loadSpa({
      protocol: "https:",
      hostname: "www.elixstarlive.co.uk",
      port: "",
      pathname: "/app/",
      search: "?/watch/room-1&ref=a~and~b=1",
      hash: "#top",
      replace: () => undefined,
    });
    api.restoreAppEntryFromQuery();
    expect(historyCalls).toEqual(["/app/watch/room-1?ref=a&b=1#top"]);
  });
})
