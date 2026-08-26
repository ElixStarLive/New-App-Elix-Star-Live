import { describe, expect, it } from "vitest";
import { routeParam } from "./param.js";

describe("routeParam", () => {
  it("reads a string param", () => {
    expect(routeParam({ params: { id: "abc" } }, "id")).toBe("abc");
  });

  it("takes the first entry of a repeated param", () => {
    expect(routeParam({ params: { id: ["first", "second"] } }, "id")).toBe("first");
  });

  it("returns an empty string for missing or empty values", () => {
    expect(routeParam({ params: {} }, "id")).toBe("");
    expect(routeParam({ params: { id: undefined } }, "id")).toBe("");
    expect(routeParam({ params: { id: [] } }, "id")).toBe("");
  });
});
