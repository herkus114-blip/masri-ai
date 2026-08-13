import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/speech/route";

test("Mistral speech route resolves an Arabic voice and emits browser-ready MP3 bytes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body?: string }> = [];
  const expectedAudio = new Uint8Array(512).map((_, index) => index % 256);
  const audioData = Buffer.from(expectedAudio).toString("base64");

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("/audio/voices")) {
      return Response.json({
        items: [
          { id: "voice-english", name: "English", languages: ["en"] },
          { id: "voice-arabic", name: "Arabic", languages: ["ar"] },
        ],
      });
    }
    if (url.endsWith("/audio/speech")) return Response.json({ audio_data: audioData });
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const response = await POST(new Request("http://localhost/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "عامل إيه؟",
        provider: "mistral",
        apiKey: "test-key-never-logged",
        model: "voxtral-mini-tts-2603",
        voice: "",
      }),
    }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(Number(response.headers.get("x-masri-audio-bytes")), expectedAudio.byteLength);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expectedAudio);
    assert.equal(calls.length, 2);
    const speechBody = JSON.parse(calls[1].body || "{}") as Record<string, unknown>;
    assert.equal(speechBody.voice_id, "voice-arabic");
    assert.equal(speechBody.model, "voxtral-mini-tts-2603");
    assert.equal(speechBody.response_format, "mp3");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ElevenLabs speech route sends the configured voice/model and returns MP3 bytes", async () => {
  const originalFetch = globalThis.fetch;
  const expectedAudio = new Uint8Array(640).fill(42);
  let captured: { url: string; headers?: HeadersInit; body?: BodyInit | null } | undefined;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), headers: init?.headers, body: init?.body };
    return new Response(expectedAudio, { headers: { "Content-Type": "audio/mpeg" } });
  };

  try {
    const response = await POST(new Request("http://localhost/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "عامل إيه؟ عملت إيه النهارده؟",
        provider: "elevenlabs",
        apiKey: "test-elevenlabs-key",
        voice: "egyptian-voice-id",
        model: "eleven_multilingual_v2",
      }),
    }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expectedAudio);
    assert.equal(captured?.url, "https://api.elevenlabs.io/v1/text-to-speech/egyptian-voice-id");
    const headers = new Headers(captured?.headers);
    assert.equal(headers.get("xi-api-key"), "test-elevenlabs-key");
    const body = JSON.parse(String(captured?.body)) as Record<string, unknown>;
    assert.equal(body.model_id, "eleven_multilingual_v2");
    assert.equal(body.text, "عامل إيه؟ عملت إيه النهارده؟");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ElevenLabs speech errors expose the normalized provider message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: { status: "invalid_voice", message: "Voice ID was not found." } }, { status: 404 });

  try {
    const response = await POST(new Request("http://localhost/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "عامل إيه؟", provider: "elevenlabs", apiKey: "test-key", voice: "missing-voice" }),
    }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "ElevenLabs: Voice ID was not found." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
