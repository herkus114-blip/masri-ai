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
