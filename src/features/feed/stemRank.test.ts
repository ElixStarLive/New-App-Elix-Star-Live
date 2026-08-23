import { describe, expect, it } from "vitest";
import { isStemExtraCaption, isIndecentExploreCaption, rankStemItems } from "@shared/stemEligibility";

function video(partial: { id: string; url?: string; viewCount?: number; description?: string; hashtags?: string[] }) {
  return {
    id: partial.id,
    mediaUrl: partial.url ?? "https://cdn.example.com/v.mp4",
    viewCount: partial.viewCount ?? 0,
    caption: partial.description ?? "",
    hashtags: partial.hashtags ?? [],
  };
}

describe("PAGE-008 STEM rank", () => {
  it("puts highest views first and drops rows without media", () => {
    const ranked = rankStemItems([
      video({ id: "a", viewCount: 2, url: "https://cdn.example.com/a.mp4" }),
      video({ id: "b", viewCount: 9, url: "https://cdn.example.com/b.mp4" }),
      video({ id: "c", viewCount: 5, url: "" }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("adds extra caption matches after the top-40 views slice", () => {
    const many = Array.from({ length: 41 }, (_, i) =>
      video({
        id: `v${i}`,
        viewCount: 41 - i,
        url: `https://cdn.example.com/${i}.mp4`,
        description: i === 40 ? "beach day" : "hello",
      }),
    );
    const ranked = rankStemItems(many);
    expect(ranked).toHaveLength(41);
    expect(ranked[40]?.id).toBe("v40");
    expect(isStemExtraCaption("beach day")).toBe(true);
  });

  it("Discover trending uses indecent captions only, not STEM beach extras", () => {
    expect(isIndecentExploreCaption("nsfw night")).toBe(true);
    expect(isIndecentExploreCaption("beach day")).toBe(false);
    expect(isIndecentExploreCaption("hello", ["18+"])).toBe(true);
  });
});
