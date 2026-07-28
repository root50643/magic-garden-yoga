import { describe, expect, it } from "vitest";
import { HoldTracker } from "./holdTracker";

describe("HoldTracker", () => {
  it("defaults to a three-second continuous hold", () => {
    const tracker = new HoldTracker();

    expect(tracker.update(true, 100).progress).toBe(0);
    expect(tracker.update(true, 1_600).progress).toBe(0.5);
    const completed = tracker.update(true, 3_100);

    expect(completed.elapsedMs).toBe(3_000);
    expect(completed.progress).toBe(1);
    expect(completed.completed).toBe(true);
  });

  it("pauses for a brief incorrect gap and excludes it from progress", () => {
    const tracker = new HoldTracker({ holdSeconds: 3, graceMs: 500 });

    tracker.update(true, 0);
    tracker.update(true, 1_000);
    const paused = tracker.update(false, 1_200);
    expect(paused.elapsedMs).toBe(1_200);
    expect(paused.inGracePeriod).toBe(true);

    const resumed = tracker.update(true, 1_600);
    expect(resumed.elapsedMs).toBe(1_200);
    expect(resumed.completed).toBe(false);

    expect(tracker.update(true, 3_400).completed).toBe(true);
  });

  it("preserves progress when the gap is exactly the grace duration", () => {
    const tracker = new HoldTracker({ holdSeconds: 2, graceMs: 500 });

    tracker.update(true, 0);
    tracker.update(false, 800);
    const resumed = tracker.update(true, 1_300);

    expect(resumed.elapsedMs).toBe(800);
    expect(resumed.progress).toBe(0.4);
  });

  it("resets after an incorrect gap longer than the grace duration", () => {
    const tracker = new HoldTracker({ holdSeconds: 3, graceMs: 500 });

    tracker.update(true, 0);
    tracker.update(true, 1_000);
    tracker.update(false, 1_100);
    const reset = tracker.update(false, 1_601);

    expect(reset.elapsedMs).toBe(0);
    expect(reset.progress).toBe(0);
    expect(reset.inGracePeriod).toBe(false);

    tracker.update(true, 1_700);
    expect(tracker.update(true, 4_700).completed).toBe(true);
  });

  it("exposes reset and keeps completion sticky until reset", () => {
    const tracker = new HoldTracker({ holdSeconds: 1 });

    tracker.update(true, 10);
    tracker.update(true, 1_010);
    expect(tracker.update(false, 2_000).completed).toBe(true);

    const reset = tracker.reset();
    expect(reset).toMatchObject({
      elapsedMs: 0,
      progress: 0,
      completed: false,
      holding: false,
      inGracePeriod: false,
    });
  });

  it("rejects invalid options and non-monotonic timestamps", () => {
    expect(() => new HoldTracker({ holdSeconds: 0 })).toThrow(RangeError);
    expect(() => new HoldTracker({ graceMs: -1 })).toThrow(RangeError);

    const tracker = new HoldTracker();
    tracker.update(true, 100);
    expect(() => tracker.update(true, 99)).toThrow(RangeError);
    expect(() => tracker.update(true, Number.NaN)).toThrow(TypeError);
  });
});
