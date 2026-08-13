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

test("Mistral TTS resolves a preset voice and returns validated MP3 bytes", async () => {
  const route = await readFile(new URL("app/api/speech/route.ts", root), "utf8");
  assert.match(route, /audio\/voices\?type=preset/);
  assert.match(route, /voice_id: resolvedVoice/);
  assert.match(route, /voxtral-mini-tts-2603/);
  assert.match(route, /audio_data/);
  assert.match(route, /Content-Type": "audio\/mpeg"/);
  assert.match(route, /bytes\.byteLength < 128/);
});

test("speaking state follows successful playback and exposes diagnostics", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  const playIndex = app.indexOf("await audio.play()");
  const speakingIndex = app.indexOf('setVoiceState("speaking")', playIndex);
  assert.ok(playIndex >= 0 && speakingIndex > playIndex);
  for (const event of ["TTS REQUEST STARTED", "HTTP STATUS", "AUDIO RECEIVED", "AUDIO BYTE SIZE", "PLAYBACK STARTED", "PLAYBACK ENDED", "PLAYBACK ERROR"]) {
    assert.match(app, new RegExp(event));
  }
  assert.match(app, /URL\.createObjectURL\(blob\)/);
  assert.match(app, /audioUnlockedRef/);
});

test("local learning memory supports saved items and spaced review", async () => {
  const storage = await readFile(new URL("app/lib/storage.ts", root), "utf8");
  assert.match(storage, /class MasriDatabase extends Dexie/);
  assert.match(storage, /nextReview/);
  assert.match(storage, /nextInterval/);
  assert.match(storage, /exportLearningData/);
});

test("conversation focus words feed real recent memory", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  const storage = await readFile(new URL("app/lib/storage.ts", root), "utf8");
  assert.match(app, /rememberFocusWords\(turn\.focusWords\)/);
  assert.match(app, /saved\.slice\(0, 8\)/);
  assert.match(storage, /focusWord\.priority !== "CORE" && focusWord\.priority !== "HIGH"/);
  assert.doesNotMatch(storage, /seedLearningData/);
});

test("voice output provider is independent and includes ElevenLabs", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  assert.match(app, /type TtsProvider = "mistral" \| "elevenlabs" \| "browser"/);
  assert.match(app, /provider: config\.ttsProvider/);
  assert.match(app, /eleven_multilingual_v2/);
  assert.match(app, /eleven_flash_v2_5/);
  assert.match(app, /عامل إيه؟ عملت إيه النهارده؟/);
});

test("API keys are never hardcoded", async () => {
  const config = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  const env = await readFile(new URL(".env.example", root), "utf8");
  assert.match(config, /apiKey: ""/);
  assert.match(config, /sessionStorage/);
  assert.match(env, /MISTRAL_API_KEY=\s*$/m);
  assert.doesNotMatch(config, /sk-[A-Za-z0-9]{16,}/);
});
