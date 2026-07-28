import { describe, expect, it } from "vitest";
import {
  initialGameState,
  isScoredPhase,
  reduceGameState,
  type GameEvent,
  type GameState,
} from "./gameState";

function play(state: GameState, event: GameEvent): GameState {
  return reduceGameState(state, event);
}

describe("game flow state machine", () => {
  it("runs five configurable poses through countdown and transitions", () => {
    let state = play(initialGameState, { type: "CONFIG_LOADED" });
    state = play(state, { type: "START" });
    expect(state.phase).toBe("countdown");

    state = play(state, { type: "COUNTDOWN_FINISHED" });
    expect(state.phase).toBe("playing");

    for (let poseIndex = 0; poseIndex < 5; poseIndex += 1) {
      state = play(state, { type: "POSE_FINISHED", skipped: false });
      expect(state.phase).toBe("transition");
      state = play(state, {
        type: "TRANSITION_FINISHED",
        challengeComplete: poseIndex === 4,
      });
    }

    expect(state).toEqual({
      phase: "complete",
      eligibleForLeaderboard: true,
    });
  });

  it("keeps countdown and transitions out of the scored timer", () => {
    expect(isScoredPhase("countdown")).toBe(false);
    expect(isScoredPhase("transition")).toBe(false);
    expect(isScoredPhase("playing")).toBe(true);
  });

  it("makes a skipped run ineligible until restart", () => {
    let state: GameState = {
      phase: "playing",
      eligibleForLeaderboard: true,
    };
    state = play(state, { type: "POSE_FINISHED", skipped: true });
    state = play(state, {
      type: "TRANSITION_FINISHED",
      challengeComplete: true,
    });
    expect(state.eligibleForLeaderboard).toBe(false);

    state = play(state, { type: "RESTART" });
    expect(state).toEqual({
      phase: "ready",
      eligibleForLeaderboard: true,
    });
  });

  it("ignores stale events and accepts a fatal load failure", () => {
    expect(play(initialGameState, { type: "COUNTDOWN_FINISHED" })).toBe(
      initialGameState,
    );
    expect(play(initialGameState, { type: "FATAL_ERROR" }).phase).toBe(
      "error",
    );
  });
});

