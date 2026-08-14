import { NextResponse } from "next/server";
import { z } from "zod";
import { DictionaryResultSchema, TutorTurnSchema, extractJson } from "../../lib/schemas";
import { MASRI_SYSTEM_PROMPT, dictionaryJsonShape, tutorJsonShape } from "../../lib/systemPrompt";

const ConfigSchema = z.object({
  provider: z.enum(["mistral", "openai", "custom"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional().or(z.literal("")),
  textModel: z.string().min(1),
});

const RequestSchema = z.object({
  task: z.enum(["conversation", "dictionary", "teach", "test"]),
  config: ConfigSchema,
  text: z.string().max(4000).default(""),
  mode: z.string().max(80).default("Free Talk"),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12).default([]),
  recentWords: z.array(z.string()).max(20).default([]),
  recurringMistakes: z.array(z.string()).max(12).default([]),
});

function endpoint(provider: string, baseUrl?: string) {
  if (provider === "mistral") return "https://api.mistral.ai/v1/chat/completions";
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  return `${(baseUrl || "").replace(/\/$/, "")}/chat/completions`;
}

function errorMessage(status: number) {
  if (status === 401 || status === 403) return "That API key was not accepted. Check the key and provider.";
  if (status === 429) return "The provider quota or rate limit was reached. Try again shortly.";
  if (status === 404) return "That model or provider endpoint is unavailable.";
  return "The AI provider could not complete this request.";
}

export async function POST(request: Request) {
  try {
    const input = RequestSchema.parse(await request.json());
    const { task, config } = input;
    let userPrompt = input.text;
    let system = MASRI_SYSTEM_PROMPT;

    if (task === "conversation") {
      userPrompt = `Conversation mode: ${input.mode}\nLearner said: ${input.text}\nRecent high-value words: ${input.recentWords.join(", ") || "none"}\nRecurring mistakes to target: ${input.recurringMistakes.join(", ") || "none"}\nEvaluate and continue. JSON shape:\n${tutorJsonShape}`;
    } else if (task === "dictionary") {
      system = `${MASRI_SYSTEM_PROMPT}\nAct as an English to Egyptian Arabic phrase finder. Give the single most natural, useful spoken result. For a word lookup, explicitly prefer the everyday Egyptian word over an MSA dictionary equivalent. Set confidence HIGH only when the form is genuinely common in ordinary Egyptian speech; otherwise use MEDIUM or LOW instead of inventing or falling back to formal Arabic. Keep it compact.`;
      userPrompt = `Find how a normal Egyptian would actually say in everyday conversation: ${input.text}\nJSON shape:\n${dictionaryJsonShape}`;
    } else if (task === "teach") {
      userPrompt = `The learner does not know how to say this in Egyptian Arabic: ${input.text}\nTeach the shortest natural high-value version, then ask them to repeat it. Treat their English as the transcript. JSON shape:\n${tutorJsonShape}`;
    } else {
      system = "Reply with exactly: connected";
      userPrompt = "Connection test";
    }

    const response = await fetch(endpoint(config.provider, config.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.textModel,
        temperature: task === "test" ? 0 : task === "dictionary" ? 0.2 : 0.35,
        max_tokens: task === "test" ? 12 : 900,
        response_format: task === "test" ? undefined : { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...input.history,
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) return NextResponse.json({ error: errorMessage(response.status) }, { status: response.status });
    const raw = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };
    const contentValue = raw.choices?.[0]?.message?.content;
    const content = typeof contentValue === "string"
      ? contentValue
      : contentValue?.filter((part) => part.type === "text").map((part) => part.text).join("") ?? "";

    if (task === "test") return NextResponse.json({ ok: true });
    const parsed = extractJson(content);
    const result = task === "dictionary" ? DictionaryResultSchema.parse(parsed) : TutorTurnSchema.parse(parsed);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "The provider returned an unexpected response. Try again." }, { status: 502 });
    }
    return NextResponse.json({ error: "Network error. Check your connection and provider settings." }, { status: 502 });
  }
}
