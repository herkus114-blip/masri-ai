interface SpeechInput {
  text?: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  voice?: string;
  baseUrl?: string;
}

interface MistralVoice {
  id?: string;
  name?: string;
  languages?: string[];
  tags?: string[];
  description?: string;
}

function endpoint(provider: string, baseUrl: string) {
  if (provider === "mistral") return "https://api.mistral.ai/v1/audio/speech";
  if (provider === "openai") return "https://api.openai.com/v1/audio/speech";
  return `${baseUrl.replace(/\/$/, "")}/audio/speech`;
}

function decodeBase64(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(payload.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function voiceSupportsArabic(voice: MistralVoice) {
  const description = [voice.name, voice.description, ...(voice.languages ?? []), ...(voice.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(^|\s)(ar|ara|arabic|العربية)(\s|$)/i.test(description);
}

async function resolveMistralVoice(apiKey: string, configuredVoice?: string) {
  if (configuredVoice?.trim()) return configuredVoice.trim();
  const response = await fetch("https://api.mistral.ai/v1/audio/voices?type=preset&limit=100&offset=0", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Mistral voice lookup failed (${response.status}).`);
  const data = await response.json() as { items?: MistralVoice[] };
  const voices = (data.items ?? []).filter((voice): voice is MistralVoice & { id: string } => Boolean(voice.id));
  const selected = voices.find(voiceSupportsArabic) ?? voices[0];
  if (!selected) throw new Error("No Mistral preset voice is available for this account.");
  return selected.id;
}

function errorStatus(status: number) {
  if (status === 401 || status === 403) return "The Mistral API key was not accepted for TTS.";
  if (status === 422) return "Mistral rejected the TTS model or voice configuration.";
  if (status === 429) return "The Mistral TTS quota or rate limit was reached.";
  return `Mistral TTS failed with HTTP ${status}.`;
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as SpeechInput;
    if (!input.text || !input.apiKey) {
      return Response.json({ error: "Speech text or API key is missing." }, { status: 400 });
    }

    const provider = input.provider || "mistral";
    const isMistral = provider === "mistral";
    const resolvedVoice = isMistral
      ? await resolveMistralVoice(input.apiKey, input.voice)
      : input.voice || "alloy";
    const body = isMistral
      ? {
          model: input.model || "voxtral-mini-tts-2603",
          input: input.text,
          voice_id: resolvedVoice,
          response_format: "mp3",
          stream: false,
        }
      : {
          model: input.model || "gpt-4o-mini-tts",
          input: input.text,
          voice: resolvedVoice,
          response_format: "mp3",
        };

    const response = await fetch(endpoint(provider, input.baseUrl || ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return Response.json({ error: errorStatus(response.status) }, { status: response.status });
    }

    let bytes: Uint8Array;
    if (isMistral) {
      const data = await response.json() as { audio_data?: string };
      if (!data.audio_data) {
        return Response.json({ error: "Mistral returned HTTP 200 but no audio_data." }, { status: 502 });
      }
      bytes = decodeBase64(data.audio_data);
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (bytes.byteLength < 128) {
      return Response.json({ error: "The TTS response did not contain usable audio bytes." }, { status: 502 });
    }

    const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Masri-Audio-Bytes": String(bytes.byteLength),
        "X-Masri-TTS-Provider": provider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS request failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export const __testables = { decodeBase64, voiceSupportsArabic };
