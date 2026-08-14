import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_SPEEDS,
  DEFAULT_CONVERSATION_SPEED,
  parseConversationSpeed,
  stepConversationSpeed,
} from "../app/lib/conversationSpeech";

test("Conversation speech exposes exactly 0.2x through 0.8x in 0.1 increments", () => {
  assert.deepEqual(CONVERSATION_SPEEDS, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  assert.equal(DEFAULT_CONVERSATION_SPEED, 0.6);
});

test("Conversation speech steps only through supported values and stops at boundaries", () => {
  assert.equal(stepConversationSpeed(0.6, -1), 0.5);
  assert.equal(stepConversationSpeed(0.6, 1), 0.7);
  assert.equal(stepConversationSpeed(0.2, -1), 0.2);
  assert.equal(stepConversationSpeed(0.8, 1), 0.8);
});

test("persisted Conversation speed accepts supported values and rejects unsupported ones", () => {
  assert.equal(parseConversationSpeed("0.2"), 0.2);
  assert.equal(parseConversationSpeed("0.8"), 0.8);
  assert.equal(parseConversationSpeed("1"), 0.6);
  assert.equal(parseConversationSpeed("not-a-number"), 0.6);
  assert.equal(parseConversationSpeed(null), 0.6);
});
