import { describe, expect, it } from "vitest";
import { formatClipLabel, licensedClipWindow } from "./query.js";

describe("PAGE-016 music clip contract", () => {
  it("labels licensed clip duration as m:ss", () => {
    expect(formatClipLabel(0, 60)).toBe("1:00");
    expect(formatClipLabel(12, 27)).toBe("0:15");
  });

  it("caps licensed clips at 60 seconds and never inverts the window", () => {
    expect(licensedClipWindow(180, 0, 90_000)).toEqual({ clipStartSeconds: 0, clipEndSeconds: 60 });
    expect(licensedClipWindow(40, 0, 90_000)).toEqual({ clipStartSeconds: 0, clipEndSeconds: 40 });
    expect(licensedClipWindow(3, 8000, 9000)).toEqual({ clipStartSeconds: 0, clipEndSeconds: 3 });
  });
});
