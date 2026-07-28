export type GamePhase =
  | "boot"
  | "ready"
  | "countdown"
  | "playing"
  | "transition"
  | "complete"
  | "error";

export interface GameState {
  phase: GamePhase;
  eligibleForLeaderboard: boolean;
}

export type GameEvent =
  | { type: "CONFIG_LOADED" }
  | { type: "FATAL_ERROR" }
  | { type: "START" }
  | { type: "COUNTDOWN_FINISHED" }
  | { type: "POSE_FINISHED"; skipped: boolean }
  | { type: "TRANSITION_FINISHED"; challengeComplete: boolean }
  | { type: "RESTART" };

export const initialGameState: GameState = {
  phase: "boot",
  eligibleForLeaderboard: true,
};

/**
 * Pure game-flow state machine. Invalid or stale events are deliberately
 * ignored, which prevents late timers and camera frames from skipping screens.
 */
export function reduceGameState(
  state: GameState,
  event: GameEvent,
): GameState {
  if (event.type === "FATAL_ERROR") {
    return { ...state, phase: "error" };
  }

  switch (state.phase) {
    case "boot":
      return event.type === "CONFIG_LOADED"
        ? { phase: "ready", eligibleForLeaderboard: true }
        : state;

    case "ready":
      return event.type === "START"
        ? { phase: "countdown", eligibleForLeaderboard: true }
        : state;

    case "countdown":
      return event.type === "COUNTDOWN_FINISHED"
        ? { ...state, phase: "playing" }
        : state;

    case "playing":
      return event.type === "POSE_FINISHED"
        ? {
            phase: "transition",
            eligibleForLeaderboard:
              state.eligibleForLeaderboard && !event.skipped,
          }
        : state;

    case "transition":
      return event.type === "TRANSITION_FINISHED"
        ? {
            ...state,
            phase: event.challengeComplete ? "complete" : "playing",
          }
        : state;

    case "complete":
      return event.type === "RESTART"
        ? { phase: "ready", eligibleForLeaderboard: true }
        : state;

    case "error":
      return state;
  }
}

export function isScoredPhase(phase: GamePhase): boolean {
  return phase === "playing";
}

