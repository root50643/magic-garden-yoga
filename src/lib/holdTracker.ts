export interface HoldTrackerOptions {
  /** Required continuous hold time. Defaults to three seconds. */
  holdSeconds?: number;
  /** Incorrect tracking time that may be ignored before resetting. */
  graceMs?: number;
}

export interface HoldTrackerSnapshot {
  elapsedMs: number;
  requiredMs: number;
  progress: number;
  completed: boolean;
  holding: boolean;
  inGracePeriod: boolean;
}

const DEFAULT_HOLD_SECONDS = 3;
const DEFAULT_GRACE_MS = 500;

/**
 * Tracks a continuous pose hold using monotonic, performance-like timestamps.
 *
 * An incorrect sample pauses progress. If correct tracking returns within the
 * grace window, time spent in the gap is excluded; a longer gap resets progress.
 */
export class HoldTracker {
  readonly requiredMs: number;
  readonly graceMs: number;

  private startedAtMs: number | null = null;
  private pausedAtMs: number | null = null;
  private totalPausedMs = 0;
  private currentElapsedMs = 0;
  private lastTimestampMs: number | null = null;
  private currentlyHolding = false;
  private isCompleted = false;

  constructor(options: HoldTrackerOptions = {}) {
    const holdSeconds = options.holdSeconds ?? DEFAULT_HOLD_SECONDS;
    const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    if (!Number.isFinite(holdSeconds) || holdSeconds <= 0) {
      throw new RangeError("holdSeconds must be a positive finite number");
    }
    if (!Number.isFinite(graceMs) || graceMs < 0) {
      throw new RangeError("graceMs must be a non-negative finite number");
    }
    this.requiredMs = holdSeconds * 1_000;
    this.graceMs = graceMs;
  }

  update(correct: boolean, timestampMs: number): HoldTrackerSnapshot {
    this.assertTimestamp(timestampMs);
    this.lastTimestampMs = timestampMs;
    this.currentlyHolding = correct;

    if (this.isCompleted) {
      return this.snapshot;
    }

    if (correct) {
      this.updateCorrect(timestampMs);
    } else {
      this.updateIncorrect(timestampMs);
    }

    return this.snapshot;
  }

  reset(): HoldTrackerSnapshot {
    this.startedAtMs = null;
    this.pausedAtMs = null;
    this.totalPausedMs = 0;
    this.currentElapsedMs = 0;
    this.lastTimestampMs = null;
    this.currentlyHolding = false;
    this.isCompleted = false;
    return this.snapshot;
  }

  get progress() {
    return this.requiredMs === 0
      ? 1
      : Math.min(1, this.currentElapsedMs / this.requiredMs);
  }

  get completed() {
    return this.isCompleted;
  }

  get snapshot(): HoldTrackerSnapshot {
    return {
      elapsedMs: this.currentElapsedMs,
      requiredMs: this.requiredMs,
      progress: this.progress,
      completed: this.isCompleted,
      holding: this.currentlyHolding,
      inGracePeriod:
        !this.currentlyHolding &&
        this.startedAtMs !== null &&
        this.pausedAtMs !== null,
    };
  }

  private updateCorrect(timestampMs: number) {
    if (this.startedAtMs === null) {
      this.startedAtMs = timestampMs;
      this.pausedAtMs = null;
      this.totalPausedMs = 0;
      this.currentElapsedMs = 0;
      return;
    }

    if (this.pausedAtMs !== null) {
      const gapMs = timestampMs - this.pausedAtMs;
      if (gapMs > this.graceMs) {
        this.restartAt(timestampMs);
        return;
      }
      this.totalPausedMs += gapMs;
      this.pausedAtMs = null;
    }

    this.currentElapsedMs = Math.min(
      this.requiredMs,
      Math.max(0, timestampMs - this.startedAtMs - this.totalPausedMs),
    );
    if (this.currentElapsedMs >= this.requiredMs) {
      this.isCompleted = true;
    }
  }

  private updateIncorrect(timestampMs: number) {
    if (this.startedAtMs === null) {
      this.currentElapsedMs = 0;
      return;
    }

    if (this.pausedAtMs === null) {
      this.pausedAtMs = timestampMs;
      this.currentElapsedMs = Math.min(
        this.requiredMs,
        Math.max(0, timestampMs - this.startedAtMs - this.totalPausedMs),
      );
      return;
    }

    if (timestampMs - this.pausedAtMs > this.graceMs) {
      this.clearActiveHold();
    }
  }

  private restartAt(timestampMs: number) {
    this.startedAtMs = timestampMs;
    this.pausedAtMs = null;
    this.totalPausedMs = 0;
    this.currentElapsedMs = 0;
  }

  private clearActiveHold() {
    this.startedAtMs = null;
    this.pausedAtMs = null;
    this.totalPausedMs = 0;
    this.currentElapsedMs = 0;
  }

  private assertTimestamp(timestampMs: number) {
    if (!Number.isFinite(timestampMs)) {
      throw new TypeError("timestampMs must be a finite number");
    }
    if (
      this.lastTimestampMs !== null &&
      timestampMs < this.lastTimestampMs
    ) {
      throw new RangeError("timestampMs must be monotonic");
    }
  }
}

export function createHoldTracker(options: HoldTrackerOptions = {}) {
  return new HoldTracker(options);
}
