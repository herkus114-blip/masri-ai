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
  assert.match(prompt, /umbrella is شمسية, not مظلة/i);
  assert.match(prompt, /Never invent a supposedly colloquial word/i);
  assert.match(prompt, /lower the confidence/i);
});

test("Dictionary and Practice prefer everyday Egyptian over formal MSA", async () => {
  const prompt = await readFile(new URL("app/lib/systemPrompt.ts", root), "utf8");
  const route = await readFile(new URL("app/api/ai/route.ts", root), "utf8");
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  assert.match(prompt, /"confidence": "HIGH\|MEDIUM\|LOW"/);
  assert.match(route, /prefer the everyday Egyptian word over an MSA dictionary equivalent/);
  assert.match(route, /task === "dictionary" \? 0\.2/);
  assert.match(app, /Formal MSA dictionary equivalents are not substituted/);
  assert.match(app, /currentPractice\.arabic/);
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

test("Conversation speech speed is isolated, pitch-preserving, and replay-cache aware", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  assert.match(app, /CONVERSATION_SPEED_STORAGE_KEY/);
  assert.match(app, /conversationAudioCacheRef/);
  assert.match(app, /cachedAudio/);
  assert.match(app, /audio\.playbackRate = playbackRate/);
  assert.match(app, /audio\.preservesPitch = true/);
  assert.match(app, /enableVoiceAndSpeak\(prompt\.arabic, "conversation"\)/);
  assert.match(app, /speak\(turn\.replyArabic, "conversation"\)/);

  const requestStart = app.indexOf('const response = await fetch("/api/speech"');
  const requestEnd = app.indexOf("});", requestStart);
  assert.ok(requestStart >= 0 && requestEnd > requestStart);
  assert.doesNotMatch(app.slice(requestStart, requestEnd), /speed|playbackRate/);
});

test("Practice and Dictionary keep the standard pronunciation path", async () => {
  const app = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  assert.match(app, /speak\(currentPractice\.arabic\)/);
  assert.doesNotMatch(app, /speak\(currentPractice\.arabic, "conversation"\)/);
  assert.match(app, /speak\(dictionaryResult\.arabic\)/);
  assert.doesNotMatch(app, /speak\(dictionaryResult\.arabic, "conversation"\)/);
});

test("API keys are never hardcoded", async () => {
  const config = await readFile(new URL("app/components/MasriApp.tsx", root), "utf8");
  const env = await readFile(new URL(".env.example", root), "utf8");
  assert.match(config, /apiKey: ""/);
  assert.match(config, /sessionStorage/);
  assert.match(env, /MISTRAL_API_KEY=\s*$/m);
  assert.doesNotMatch(config, /sk-[A-Za-z0-9]{16,}/);
});
