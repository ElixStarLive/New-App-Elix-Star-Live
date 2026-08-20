import { describe, expect, it } from "vitest";
import { applyScore, canStart, emptyBattle, startBattle, tick } from "./state.js";

describe("battle", () => {
  it("starts 1x1 only with host and opponent", () => {
    const waiting = emptyBattle("s", "1x1", "h");
    expect(canStart(waiting)).toBe(false);
    const ready = { ...waiting, seats: { ...waiting.seats, opponent: "o" } };
    expect(canStart(ready)).toBe(true);
  });

  it("requires four people for 2x2", () => {
    const waiting = emptyBattle("s", "2x2", "h");
    expect(canStart({ ...waiting, seats: { ...waiting.seats, opponent: "o" } })).toBe(false);
  });

  it("does not double-count by applying each gift once", () => {
    let state = startBattle({
      ...emptyBattle("s", "1x1", "h"),
      seats: { host: "h", opponent: "o", player3: null, player4: null },
    });
    state = applyScore(state, "host", 10);
    state = applyScore(state, "opponent", 4);
    expect(state.teamAScore).toBe(10);
    expect(state.teamBScore).toBe(4);
  });

  it("ends when the timer reaches zero", () => {
    const started = startBattle(
      { ...emptyBattle("s", "1x1", "h"), seats: { host: "h", opponent: "o", player3: null, player4: null } },
      1_000,
    );
    const ended = tick(started, 1_000 + 5 * 60 * 1000);
    expect(ended.status).toBe("ENDED");
  });
});
