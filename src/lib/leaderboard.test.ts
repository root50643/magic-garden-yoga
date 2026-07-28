import { describe, expect, it } from "vitest";

import {
  clearLeaderboard,
  createLeaderboardStore,
  leaderboardStorageKey,
  readLeaderboard,
  removeStaleLeaderboardChallenges,
  sanitizePlayerName,
  submitLeaderboardEntry,
  type StorageLike,
} from "./leaderboard";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const RULES = { limit: 3, nameMaxLength: 4 };

describe("sanitizePlayerName", () => {
  it("normalizes, removes control characters, and collapses whitespace", () => {
    expect(sanitizePlayerName("  Ａ\u0000  小明  ", 12)).toBe("A 小明");
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(sanitizePlayerName("🌻小明同學", 3)).toBe("🌻小明");
  });

  it("requires a non-empty name and a valid maximum", () => {
    expect(() => sanitizePlayerName("\u0000 \n", 12)).toThrow(
      /至少 1 個字/,
    );
    expect(() => sanitizePlayerName("小明", 0)).toThrow(/大於 0 的整數/);
  });
});

describe("leaderboard persistence", () => {
  it("removes only stale challenge leaderboards and preserves unrelated data", () => {
    const storage = new MemoryStorage();
    const activeKey = leaderboardStorageKey("garden/current");
    const staleKey = leaderboardStorageKey("garden-old");
    const anotherStaleKey = leaderboardStorageKey("garden-v1");
    storage.setItem(activeKey, "active");
    storage.setItem(staleKey, "stale");
    storage.setItem(anotherStaleKey, "also stale");
    storage.setItem("magic-garden-yoga:muted", "true");
    storage.setItem("another-app:leaderboard:garden-old", "foreign");

    expect(removeStaleLeaderboardChallenges(storage, " garden/current ")).toBe(
      2,
    );
    expect(storage.getItem(activeKey)).toBe("active");
    expect(storage.getItem(staleKey)).toBeNull();
    expect(storage.getItem(anotherStaleKey)).toBeNull();
    expect(storage.getItem("magic-garden-yoga:muted")).toBe("true");
    expect(storage.getItem("another-app:leaderboard:garden-old")).toBe(
      "foreign",
    );
  });

  it("tolerates unavailable enumeration and individual removal failures", () => {
    const unavailableStorage: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(
      removeStaleLeaderboardChallenges(unavailableStorage, "garden"),
    ).toBe(0);

    const activeKey = leaderboardStorageKey("garden");
    const inaccessibleKey = leaderboardStorageKey("old-inaccessible");
    const removableKey = leaderboardStorageKey("old-removable");
    const values = new Map([
      [activeKey, "active"],
      [inaccessibleKey, "stale"],
      [removableKey, "stale"],
    ]);
    const partiallyUnavailableStorage: StorageLike & {
      readonly length: number;
      key(index: number): string | null;
    } = {
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        if (key === inaccessibleKey) {
          throw new Error("storage blocked");
        }
        values.delete(key);
      },
    };

    expect(
      removeStaleLeaderboardChallenges(
        partiallyUnavailableStorage,
        "garden",
      ),
    ).toBe(1);
    expect(values.get(activeKey)).toBe("active");
    expect(values.get(inaccessibleKey)).toBe("stale");
    expect(values.has(removableKey)).toBe(false);
  });

  it("stores separate rankings under each challengeId", () => {
    const storage = new MemoryStorage();
    submitLeaderboardEntry(
      storage,
      {
        challengeId: "garden-a",
        displayName: "小明",
        elapsedMs: 5000,
        completedAt: "2026-07-28T01:00:00.000Z",
        id: "a",
      },
      RULES,
    );
    submitLeaderboardEntry(
      storage,
      {
        challengeId: "garden-b",
        displayName: "小美",
        elapsedMs: 4000,
        completedAt: "2026-07-28T01:00:00.000Z",
        id: "b",
      },
      RULES,
    );

    expect(readLeaderboard(storage, "garden-a")).toHaveLength(1);
    expect(readLeaderboard(storage, "garden-a")[0].displayName).toBe("小明");
    expect(readLeaderboard(storage, "garden-b")[0].displayName).toBe("小美");
  });

  it("keeps the fastest result per normalized case-insensitive name", () => {
    const storage = new MemoryStorage();
    const base = {
      challengeId: "garden",
      completedAt: "2026-07-28T01:00:00.000Z",
    };

    submitLeaderboardEntry(
      storage,
      { ...base, displayName: "Ａlice", elapsedMs: 8000, id: "slow" },
      RULES,
    );
    submitLeaderboardEntry(
      storage,
      { ...base, displayName: "alice", elapsedMs: 9000, id: "slower" },
      RULES,
    );
    const result = submitLeaderboardEntry(
      storage,
      { ...base, displayName: "ALICE", elapsedMs: 7000, id: "fast" },
      RULES,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "fast",
      displayName: "ALIC",
      elapsedMs: 7000,
    });
  });

  it("sorts by elapsed time, then earlier completion, and caps the limit", () => {
    const storage = new MemoryStorage();
    const submit = (
      id: string,
      elapsedMs: number,
      completedAt: string,
    ) =>
      submitLeaderboardEntry(
        storage,
        {
          challengeId: "garden",
          displayName: id,
          elapsedMs,
          completedAt,
          id,
        },
        RULES,
      );

    submit("later", 2000, "2026-07-28T02:00:00.000Z");
    submit("early", 2000, "2026-07-28T01:00:00.000Z");
    submit("fast", 1000, "2026-07-28T03:00:00.000Z");
    const result = submit("cut", 3000, "2026-07-28T00:00:00.000Z");

    expect(result.map((entry) => entry.id)).toEqual([
      "fast",
      "early",
      "later",
    ]);
  });

  it("ignores malformed saved data and supports clear", () => {
    const storage = new MemoryStorage();
    const key = leaderboardStorageKey("garden");
    storage.setItem(key, "{bad json");
    expect(readLeaderboard(storage, "garden")).toEqual([]);

    storage.setItem(
      key,
      JSON.stringify([
        { bad: true },
        {
          id: "ok",
          displayName: "小美",
          elapsedMs: 3000,
          challengeId: "garden",
          completedAt: "2026-07-28T01:00:00.000Z",
        },
      ]),
    );
    expect(readLeaderboard(storage, "garden")).toHaveLength(1);

    clearLeaderboard(storage, "garden");
    expect(storage.getItem(key)).toBeNull();
  });

  it("offers a storage-bound interface for browser or Node callers", () => {
    const storage = new MemoryStorage();
    const store = createLeaderboardStore(storage);

    store.submit(
      {
        challengeId: "garden",
        displayName: "小華",
        elapsedMs: 1234,
        completedAt: "2026-07-28T01:00:00.000Z",
        id: "entry",
      },
      RULES,
    );
    expect(store.list("garden")).toHaveLength(1);
    store.clear("garden");
    expect(store.list("garden")).toEqual([]);
  });
});
