import { describe, expect, it } from "vitest";
import { escapeIlike, normalizeSearchCategory, SEARCH_BROWSE_CATEGORIES } from "./searchCategories";

describe("PAGE-012 search query helpers", () => {
  it("keeps the OLD browse category list and defaults unknown values to All", () => {
    expect(SEARCH_BROWSE_CATEGORIES[0]).toBe("All");
    expect(normalizeSearchCategory("Dance")).toBe("Dance");
    expect(normalizeSearchCategory("trending")).toBe("All");
    expect(normalizeSearchCategory("")).toBe("All");
  });

  it("escapes ILIKE wildcards", () => {
    expect(escapeIlike("100%_fun")).toBe("100\\%\\_fun");
  });
});
