import type { LeaderboardEntry } from "../types";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface EnumerableStorageLike extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
}

export interface LeaderboardSubmission {
  challengeId: string;
  displayName: string;
  elapsedMs: number;
  completedAt?: string;
  id?: string;
}

export interface LeaderboardRules {
  limit: number;
  nameMaxLength: number;
}

export interface LeaderboardStore {
  list(challengeId: string, limit?: number): LeaderboardEntry[];
  submit(
    submission: LeaderboardSubmission,
    rules: LeaderboardRules,
  ): LeaderboardEntry[];
  clear(challengeId: string): void;
}

export const LEADERBOARD_STORAGE_PREFIX = "magic-garden-yoga:leaderboard:";

export function leaderboardStorageKey(challengeId: string): string {
  const id = challengeId.trim();
  if (!id) {
    throw new Error("排行榜的 challengeId 不可為空白。");
  }
  return `${LEADERBOARD_STORAGE_PREFIX}${encodeURIComponent(id)}`;
}

/**
 * During development, keep only the active challenge's leaderboard.
 *
 * The cleanup is deliberately scoped to LEADERBOARD_STORAGE_PREFIX. Other
 * localStorage values (including the game's muted preference) are never
 * touched. Storage access can fail in privacy-restricted browsers, so cleanup
 * is best-effort and must not prevent the game from loading.
 */
export function removeStaleLeaderboardChallenges(
  storage: StorageLike,
  activeChallengeId: string,
): number {
  const activeKey = leaderboardStorageKey(activeChallengeId);
  const enumerableStorage = storage as Partial<EnumerableStorageLike>;

  let keyCount: number;
  try {
    if (
      typeof enumerableStorage.key !== "function" ||
      typeof enumerableStorage.length !== "number"
    ) {
      return 0;
    }
    keyCount = enumerableStorage.length;
  } catch {
    return 0;
  }

  if (!Number.isSafeInteger(keyCount) || keyCount < 0) {
    return 0;
  }

  // Collect first because removing an item changes Storage's numeric indexes.
  const staleKeys = new Set<string>();
  for (let index = 0; index < keyCount; index += 1) {
    let key: string | null;
    try {
      key = enumerableStorage.key(index);
    } catch {
      continue;
    }
    if (
      key !== null &&
      key !== activeKey &&
      key.startsWith(LEADERBOARD_STORAGE_PREFIX)
    ) {
      staleKeys.add(key);
    }
  }

  let removedCount = 0;
  for (const key of staleKeys) {
    try {
      storage.removeItem(key);
      removedCount += 1;
    } catch {
      // One inaccessible key must not block cleanup of the remaining keys.
    }
  }
  return removedCount;
}

function unicodeCharacters(value: string): string[] {
  return Array.from(value);
}

/**
 * Normalises text entered by a child, removes invisible control characters,
 * collapses whitespace, and limits by Unicode code point rather than UTF-16
 * code unit so emoji and non-ASCII names are not accidentally split.
 */
export function sanitizePlayerName(value: string, maxLength: number): string {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new Error("排行榜的名字長度上限必須是大於 0 的整數。");
  }

  const cleaned = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  const characters = unicodeCharacters(cleaned);
  if (characters.length === 0) {
    throw new Error("請輸入至少 1 個字的名字。");
  }
  return characters.slice(0, maxLength).join("");
}

function normalizedNameKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-TW");
}

function validChallengeId(challengeId: string): string {
  const value = challengeId.trim();
  if (!value) {
    throw new Error("排行榜的 challengeId 不可為空白。");
  }
  return value;
}

function validLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("排行榜筆數上限必須是大於 0 的整數。");
  }
  return limit;
}

function parseStoredEntry(
  value: unknown,
  challengeId: string,
): LeaderboardEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<LeaderboardEntry>;
  if (
    typeof candidate.id !== "string" ||
    !candidate.id ||
    typeof candidate.displayName !== "string" ||
    !candidate.displayName.trim() ||
    typeof candidate.elapsedMs !== "number" ||
    !Number.isFinite(candidate.elapsedMs) ||
    candidate.elapsedMs < 0 ||
    candidate.challengeId !== challengeId ||
    typeof candidate.completedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.completedAt))
  ) {
    return undefined;
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    elapsedMs: candidate.elapsedMs,
    challengeId,
    completedAt: new Date(candidate.completedAt).toISOString(),
  };
}

function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    a.elapsedMs - b.elapsedMs ||
    Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
    a.displayName.localeCompare(b.displayName, "zh-TW")
  );
}

function bestEntries(
  entries: readonly LeaderboardEntry[],
  limit: number,
): LeaderboardEntry[] {
  const bestByName = new Map<string, LeaderboardEntry>();

  for (const entry of entries) {
    const key = normalizedNameKey(entry.displayName);
    const current = bestByName.get(key);
    if (!current || compareEntries(entry, current) < 0) {
      bestByName.set(key, entry);
    }
  }

  return [...bestByName.values()].sort(compareEntries).slice(0, limit);
}

function readStoredArray(storage: StorageLike, key: string): unknown[] {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null) {
    return [];
  }

  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function readLeaderboard(
  storage: StorageLike,
  challengeId: string,
  limit = 10,
): LeaderboardEntry[] {
  const id = validChallengeId(challengeId);
  const maximum = validLimit(limit);
  const values = readStoredArray(storage, leaderboardStorageKey(id));
  const entries = values
    .map((value) => parseStoredEntry(value, id))
    .filter((entry): entry is LeaderboardEntry => entry !== undefined);
  return bestEntries(entries, maximum);
}

function createEntryId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeCompletedAt(value: string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("排行榜完成時間必須是有效的日期時間。");
  }
  return new Date(milliseconds).toISOString();
}

export function submitLeaderboardEntry(
  storage: StorageLike,
  submission: LeaderboardSubmission,
  rules: LeaderboardRules,
): LeaderboardEntry[] {
  const challengeId = validChallengeId(submission.challengeId);
  const limit = validLimit(rules.limit);
  if (
    typeof submission.elapsedMs !== "number" ||
    !Number.isFinite(submission.elapsedMs) ||
    submission.elapsedMs < 0
  ) {
    throw new Error("排行榜完成時間必須是大於或等於 0 的有限毫秒數。");
  }

  const entry: LeaderboardEntry = {
    id: submission.id?.trim() || createEntryId(),
    displayName: sanitizePlayerName(
      submission.displayName,
      rules.nameMaxLength,
    ),
    elapsedMs: submission.elapsedMs,
    challengeId,
    completedAt: normalizeCompletedAt(submission.completedAt),
  };

  const existing = readLeaderboard(storage, challengeId, Number.MAX_SAFE_INTEGER);
  const result = bestEntries([...existing, entry], limit);
  storage.setItem(leaderboardStorageKey(challengeId), JSON.stringify(result));
  return result;
}

export function clearLeaderboard(
  storage: StorageLike,
  challengeId: string,
): void {
  storage.removeItem(leaderboardStorageKey(validChallengeId(challengeId)));
}

export function createLeaderboardStore(storage: StorageLike): LeaderboardStore {
  return {
    list: (challengeId, limit = 10) =>
      readLeaderboard(storage, challengeId, limit),
    submit: (submission, rules) =>
      submitLeaderboardEntry(storage, submission, rules),
    clear: (challengeId) => clearLeaderboard(storage, challengeId),
  };
}
