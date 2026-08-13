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
}

export interface ConversationRecord {
  id?: number;
  userArabic: string;
  replyArabic: string;
  meaning: string;
  scores: TutorTurn["scores"];
  mistakeTag: string | null;
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
  }
}

let instance: MasriDatabase | null = null;
export function db() {
  instance ??= new MasriDatabase();
  return instance;
}

export async function seedLearningData() {
  if (await db().saved.count()) return;
  const now = Date.now();
  await db().saved.bulkAdd([
    { id: "مشغول", arabic: "مشغول", english: "busy", kind: "word", priority: "CORE", createdAt: now, nextReview: now, interval: 1, reviews: 0 },
    { id: "لسه", arabic: "لسه", english: "still / not yet", kind: "word", priority: "CORE", createdAt: now, nextReview: now + 86400000, interval: 1, reviews: 0 },
    { id: "ميعاد", arabic: "ميعاد", english: "appointment / time", kind: "word", priority: "HIGH", createdAt: now, nextReview: now + 172800000, interval: 1, reviews: 0 },
  ]);
}

export async function saveItem(item: Omit<SavedItem, "id" | "createdAt" | "nextReview" | "interval" | "reviews">) {
  const now = Date.now();
  await db().saved.put({ ...item, id: item.arabic, createdAt: now, nextReview: now, interval: 1, reviews: 0 });
}

export async function recordTurn(turn: TutorTurn) {
  await db().conversations.add({
    userArabic: turn.transcript,
    replyArabic: turn.replyArabic,
    meaning: turn.meaning,
    scores: turn.scores,
    mistakeTag: turn.mistakeTag,
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
    version: 1,
    exportedAt: new Date().toISOString(),
    saved: await db().saved.toArray(),
    conversations: await db().conversations.toArray(),
    dictionary: await db().dictionary.toArray(),
    metrics: await db().metrics.toArray(),
  }, null, 2);
}
