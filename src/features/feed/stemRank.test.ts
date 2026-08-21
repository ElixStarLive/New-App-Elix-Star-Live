import { describe, expect, it } from "vitest";
import type { FeedItem } from "@shared/contracts";
import { isStemExtraCaption, rankStemItems } from "./stemRank";

function video(partial: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    kind: "video",
    userId: "u1",
    username: "u",
    displayName: "U",
    avatarUrl: null,
    mediaUrl: "https://cdn.example.com/v.mp4",
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    viewCount: 0,
    ...partial,
  };
}

describe("PAGE-008 STEM rank", () => {
  it("puts highest views first and drops rows without media", () => {
    const ranked = rankStemItems([
      video({ id: "a", viewCount: 2, mediaUrl: "https://cdn.example.com/a.mp4" }),
      video({ id: "b", viewCount: 9, mediaUrl: "https://cdn.example.com/b.mp4" }),
      video({ id: "c", viewCount: 5, mediaUrl: "" }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("adds extra caption matches after the top-40 views slice", () => {
    const many = Array.from({ length: 41 }, (_, i) =>
      video({
        id: `v${i}`,
        viewCount: 41 - i,
        mediaUrl: `https://cdn.example.com/${i}.mp4`,
        caption: i === 40 ? "beach day" : "hello",
      }),
    );
    const ranked = rankStemItems(many);
    expect(ranked).toHaveLength(41);
    expect(ranked[40]?.id).toBe("v40");
    expect(isStemExtraCaption("beach day")).toBe(true);
  });
});
