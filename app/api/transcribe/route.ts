import { NextResponse } from "next/server";

function endpoint(provider: string, baseUrl: string) {
  if (provider === "mistral") return "https://api.mistral.ai/v1/audio/transcriptions";
  if (provider === "openai") return "https://api.openai.com/v1/audio/transcriptions";
  return `${baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
}

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    const provider = String(incoming.get("provider") || "mistral");
    const apiKey = String(incoming.get("apiKey") || "");
    const model = String(incoming.get("model") || "voxtral-mini-latest");
    const baseUrl = String(incoming.get("baseUrl") || "");
    if (!(file instanceof File) || !apiKey) return NextResponse.json({ error: "Audio or API key is missing." }, { status: 400 });

    const form = new FormData();
    form.append("file", file, file.name || "masri-turn.webm");
    form.append("model", model);
    form.append("language", "ar");
    if (provider === "mistral") form.append("context_bias", JSON.stringify(["مصري", "النهارده", "بكرة", "لسه", "خلاص", "معلش"]));
    const response = await fetch(endpoint(provider, baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      const message = response.status === 401 ? "The speech API key was not accepted." : response.status === 429 ? "Speech quota was reached." : "Transcription failed. Check the speech model.";
      return NextResponse.json({ error: message }, { status: response.status });
    }
    const data = await response.json() as { text?: string };
    return NextResponse.json({ text: data.text ?? "" });
  } catch {
    return NextResponse.json({ error: "Transcription failed because of a network error." }, { status: 502 });
  }
}
