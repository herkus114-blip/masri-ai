"use client";

import Dexie, { type EntityTable } from "dexie";
import type { DictionaryResult, TutorTurn } from "./schemas";

export interface SavedItem {
  id: string;
  arabic: string;
  english: string;
  kind: "word" | "phrase";
  priority: "CORE" | "HIGH" | "MEDIUM" | "LOW";
  createdAt: number;
  nextReview: number;
  interval: number;
  reviews: number;
  lastSeenAt: number;
  seenCount: number;
}

export type SavedItemInput = Pick<SavedItem, "arabic" | "english" | "kind" | "priority">;

export interface ConversationRecord {
  id?: number;
  userArabic: string;
  replyArabic: string;
  meaning: string;
  scores: TutorTurn["scores"];
  mistakeTag: string | null;
  focusWords: TutorTurn["focusWords"];
  createdAt: number;
}

export interface DictionaryCache {
  query: string;
  mode: "word" | "phrase";
  result: DictionaryResult;
  createdAt: number;
}

export interface Metric {
  key: string;
  value: number;
}

class MasriDatabase extends Dexie {
  saved!: EntityTable<SavedItem, "id">;
  conversations!: EntityTable<ConversationRecord, "id">;
  dictionary!: EntityTable<DictionaryCache, "query">;
  metrics!: EntityTable<Metric, "key">;

  constructor() {
    super("masri-ai");
    this.version(1).stores({
      saved: "id, kind, priority, nextReview, createdAt",
      conversations: "++id, mistakeTag, createdAt",
      dictionary: "query, mode, createdAt",
      metrics: "key",
    });
    this.version(2).stores({
      saved: "id, kind, priority, nextReview, createdAt, lastSeenAt",
      conversations: "++id, mistakeTag, createdAt",
      dictionary: "query, mode, createdAt",
      metrics: "key",
    }).upgrade((transaction) => transaction.table("saved").toCollection().modify((item: Partial<SavedItem>) => {
      item.lastSeenAt ??= item.createdAt ?? Date.now();
      item.seenCount ??= 1;
    }));
  }
}

let instance: MasriDatabase | null = null;
export function db() {
  instance ??= new MasriDatabase();
  return instance;
}

export function savedItemId(arabic: string) {
  return arabic.trim().replace(/\p{M}/gu, "").replace(/\u0640/g, "").replace(/\s+/g, " ");
}

const priorityRank: Record<SavedItem["priority"], number> = { CORE: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function mergeSavedItem(existing: SavedItem | undefined, item: SavedItemInput, now = Date.now()): SavedItem {
  const id = savedItemId(item.arabic);
  if (!existing) {
    return { ...item, id, arabic: item.arabic.trim(), createdAt: now, lastSeenAt: now, seenCount: 1, nextReview: now, interval: 1, reviews: 0 };
  }
  return {
    ...existing,
    english: item.english.trim() || existing.english,
    priority: priorityRank[item.priority] > priorityRank[existing.priority] ? item.priority : existing.priority,
    lastSeenAt: now,
    seenCount: (existing.seenCount ?? 1) + 1,
  };
}

export function mergeFocusWord(existing: SavedItem | undefined, focusWord: TutorTurn["focusWords"][number], now = Date.now()) {
  if (focusWord.priority !== "CORE" && focusWord.priority !== "HIGH") return null;
  const arabic = focusWord.arabic.trim();
  const english = focusWord.english.trim();
  if (!arabic || !english) return null;
  return mergeSavedItem(existing, {
    arabic,
    english,
    kind: arabic.split(/\s+/).length > 1 ? "phrase" : "word",
    priority: focusWord.priority,
  }, now);
}

export function sortSavedByRecent(items: SavedItem[]) {
  return [...items].sort((left, right) => (right.lastSeenAt ?? right.createdAt) - (left.lastSeenAt ?? left.createdAt));
}

export async function saveItem(item: SavedItemInput) {
  const id = savedItemId(item.arabic);
  await db().transaction("rw", db().saved, async () => {
    await db().saved.put(mergeSavedItem(await db().saved.get(id), item));
  });
}

export async function rememberFocusWords(focusWords: TutorTurn["focusWords"]) {
  await db().transaction("rw", db().saved, async () => {
    for (const focusWord of focusWords) {
      const id = savedItemId(focusWord.arabic);
      const merged = mergeFocusWord(await db().saved.get(id), focusWord);
      if (merged) await db().saved.put(merged);
    }
  });
}

export async function recordTurn(turn: TutorTurn) {
  await db().conversations.add({
    userArabic: turn.transcript,
    replyArabic: turn.replyArabic,
    meaning: turn.meaning,
    scores: turn.scores,
    mistakeTag: turn.mistakeTag,
    focusWords: turn.focusWords,
    createdAt: Date.now(),
  });
  const spoken = (await db().metrics.get("minutesSpoken"))?.value ?? 0;
  await db().metrics.put({ key: "minutesSpoken", value: spoken + 0.45 });
}

export async function reviewItem(id: string, remembered: boolean) {
  const item = await db().saved.get(id);
  if (!item) return;
  const nextInterval = remembered ? Math.min(item.interval * 2.2, 60) : 1;
  await db().saved.update(id, {
    reviews: item.reviews + 1,
    interval: nextInterval,
    nextReview: Date.now() + nextInterval * 86400000,
  });
}

export async function exportLearningData() {
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    saved: await db().saved.toArray(),
    conversations: await db().conversations.toArray(),
    dictionary: await db().dictionary.toArray(),
    metrics: await db().metrics.toArray(),
  }, null, 2);
}
