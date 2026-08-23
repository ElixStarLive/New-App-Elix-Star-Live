import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { apiFetchMusicPlaylists, apiMusicTrackPreview, apiSearchMusicTracks } from "./musicApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("PAGE-016 music API client", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads playlists from GET /api/music/playlists", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        configured: true,
        playlists: [
          {
            id: "pl-1",
            name: "For You",
            coverUrl: null,
            tracks: [
              {
                id: "t1",
                title: "Night Drive",
                artist: "ES",
                duration: "0:45",
                coverUrl: null,
                clipStartSeconds: 0,
                clipEndSeconds: 45,
              },
            ],
          },
        ],
      },
      error: null,
    });
    const result = await apiFetchMusicPlaylists();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/music/playlists");
    expect(result.configured).toBe(true);
    expect(result.playlists[0]?.tracks[0]?.id).toBe("t1");
    expect(result.error).toBeNull();
  });

  it("searches with term and does not scan a catalog client-side", async () => {
    apiRequestMock.mockResolvedValue({
      data: { tracks: [{ id: "t2", title: "Found", artist: "A", duration: "0:30", clipStartSeconds: 0, clipEndSeconds: 30 }] },
      error: null,
    });
    const result = await apiSearchMusicTracks("found");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/music/search?term=found&limit=40");
    expect(result.tracks).toHaveLength(1);
  });

  it("maps empty-term local sounds tracks into MusicTrack rows", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        configured: false,
        tracks: [
          {
            id: "local-1",
            title: "Local Beat",
            artist: "Studio",
            duration: "",
            coverUrl: null,
            clipStartSeconds: 0,
            clipEndSeconds: 60,
          },
        ],
      },
      error: null,
    });
    const result = await apiSearchMusicTracks("");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/music/search");
    expect(result.tracks).toEqual([
      {
        id: "local-1",
        title: "Local Beat",
        artist: "Studio",
        duration: "",
        coverUrl: null,
        clipStartSeconds: 0,
        clipEndSeconds: 60,
      },
    ]);
  });

  it("loads preview JSON from GET /api/music/tracks/:id/preview", async () => {
    apiRequestMock.mockResolvedValue({ data: { url: "https://cdn.example/p.mp3", configured: true }, error: null });
    const result = await apiMusicTrackPreview("t1");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/music/tracks/t1/preview");
    expect(result.url).toBe("https://cdn.example/p.mp3");
  });
});
