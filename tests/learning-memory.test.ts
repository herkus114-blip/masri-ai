import assert from "node:assert/strict";
import test from "node:test";
import { mergeFocusWord, type SavedItem } from "../app/lib/storage";

test("a CORE focus word from conversation is remembered", () => {
  const item = mergeFocusWord(undefined, { arabic: "لسه", english: "still / not yet", priority: "CORE" }, 1000);
  assert.equal(item?.priority, "CORE");
  assert.equal(item?.seenCount, 1);
  assert.equal(item?.lastSeenAt, 1000);
});

test("a HIGH focus word from conversation is remembered", () => {
  const item = mergeFocusWord(undefined, { arabic: "ميعاد", english: "appointment", priority: "HIGH" }, 1000);
  assert.equal(item?.priority, "HIGH");
  assert.equal(item?.arabic, "ميعاد");
});

test("a LOW focus word is not automatically remembered", () => {
  const item = mergeFocusWord(undefined, { arabic: "نادر", english: "rare", priority: "LOW" }, 1000);
  assert.equal(item, null);
});

test("seeing the same word increments exposure without resetting review progress", () => {
  const existing: SavedItem = {
    id: "لسه", arabic: "لسه", english: "still", kind: "word", priority: "CORE",
    createdAt: 500, lastSeenAt: 1000, seenCount: 3, nextReview: 987654, interval: 8.8, reviews: 5,
  };
  const item = mergeFocusWord(existing, { arabic: "لسه", english: "still / not yet", priority: "CORE" }, 2000);
  assert.equal(item?.seenCount, 4);
  assert.equal(item?.lastSeenAt, 2000);
  assert.equal(item?.createdAt, 500);
  assert.equal(item?.nextReview, 987654);
  assert.equal(item?.interval, 8.8);
  assert.equal(item?.reviews, 5);
});
