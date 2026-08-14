import assert from "node:assert/strict";
import test from "node:test";
import { demoDictionary } from "../app/lib/demo";
import { DictionaryResultSchema } from "../app/lib/schemas";

test("umbrella uses the ordinary Egyptian word instead of the MSA dictionary word", () => {
  const result = demoDictionary("umbrella");
  assert.equal(result.arabic, "شمسية");
  assert.notEqual(result.arabic, "مظلة");
  assert.equal(result.confidence, "HIGH");
});

test("legacy cached Dictionary results receive neutral confidence", () => {
  const result = DictionaryResultSchema.parse({
    arabic: "شمسية",
    english: "umbrella",
    forms: [],
    examples: [{ arabic: "خد الشمسيّة.", english: "Take the umbrella." }],
    alternatives: [],
    priority: "CORE",
  });
  assert.equal(result.confidence, "MEDIUM");
});
