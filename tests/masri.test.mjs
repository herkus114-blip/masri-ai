import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("central tutor prompt enforces spoken Egyptian", async () => {
  const prompt = await readFile(new URL("app/lib/systemPrompt.ts", root), "utf8");
  assert.match(prompt, /contemporary Egyptian Arabic/i);
  assert.match(prompt, /not Modern Standard Arabic/i);
  assert.match(prompt, /Do not penalize normal colloquial spelling/i);
  assert.match(prompt, /Return only valid JSON/i);
});

test("voice loop includes record, transcription, evaluation and speech", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  assert.match(app, /getUserMedia/);
  assert.match(app, /MediaRecorder/);
  assert.match(app, /\/api\/transcribe/);
  assert.match(app, /TutorTurnSchema\.parse/);
  assert.match(app, /\/api\/speech/);
  assert.match(app, /speechSynthesis/);
});

test("local learning memory supports saved items and spaced review", async () => {
  const storage = await readFile(new URL("app/lib/storage.ts", root), "utf8");
  assert.match(storage, /class MasriDatabase extends Dexie/);
  assert.match(storage, /nextReview/);
  assert.match(storage, /nextInterval/);
  assert.match(storage, /exportLearningData/);
});

test("API keys are never hardcoded", async () => {
  const config = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  const env = await readFile(new URL(".env.example", root), "utf8");
  assert.match(config, /apiKey: ""/);
  assert.match(config, /sessionStorage/);
  assert.match(env, /MISTRAL_API_KEY=\s*$/m);
  assert.doesNotMatch(config, /sk-[A-Za-z0-9]{16,}/);
});
