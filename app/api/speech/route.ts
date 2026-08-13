import { NextResponse } from "next/server";

function endpoint(provider: string, baseUrl: string) {
  if (provider === "mistral") return "https://api.mistral.ai/v1/audio/speech";
  if (provider === "openai") return "https://api.openai.com/v1/audio/speech";
  return `${baseUrl.replace(/\/$/, "")}/audio/speech`;
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { text?: string; provider?: string; apiKey?: string; model?: string; voice?: string; baseUrl?: string };
    if (!input.text || !input.apiKey) return NextResponse.json({ error: "Speech text or API key is missing." }, { status: 400 });
    const isMistral = input.provider === "mistral";
    const body = isMistral
      ? { model: input.model || "voxtral-mini-tts-2603", input: input.text, voice_id: input.voice || undefined, response_format: "mp3" }
      : { model: input.model || "gpt-4o-mini-tts", input: input.text, voice: input.voice || "alloy", response_format: "mp3" };
    const response = await fetch(endpoint(input.provider || "mistral", input.baseUrl || ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return NextResponse.json({ error: "Provider voice is unavailable; browser voice will be used." }, { status: response.status });
    if (isMistral) {
      const data = await response.json() as { audio_data?: string };
      return NextResponse.json({ audio: data.audio_data ?? "", type: "audio/mpeg" });
    }
    const bytes = await response.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return NextResponse.json({ audio: base64, type: response.headers.get("content-type") || "audio/mpeg" });
  } catch {
    return NextResponse.json({ error: "Provider voice failed; browser voice will be used." }, { status: 502 });
  }
}
