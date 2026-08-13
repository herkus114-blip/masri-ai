import { z } from "zod";

export const ScoreSchema = z.object({
  meaning: z.number().min(0).max(100),
  grammar: z.number().min(0).max(100),
  naturalness: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
});

export const FocusWordSchema = z.object({
  arabic: z.string(),
  english: z.string(),
  priority: z.enum(["CORE", "HIGH", "MEDIUM", "LOW"]),
});

export const TutorTurnSchema = z.object({
  transcript: z.string(),
  meaning: z.string(),
  naturalEgyptian: z.string(),
  quickFix: z.string().nullable().default(null),
  understandable: z.boolean(),
  scores: ScoreSchema,
  replyArabic: z.string(),
  replyEnglish: z.string(),
  focusWords: z.array(FocusWordSchema).max(4).default([]),
  mistakeTag: z.string().nullable().default(null),
});

export const DictionaryResultSchema = z.object({
  arabic: z.string(),
  english: z.string(),
  forms: z.array(z.string()).max(4).default([]),
  examples: z.array(
    z.object({ arabic: z.string(), english: z.string() }),
  ).min(1).max(3),
  alternatives: z.array(z.string()).max(2).default([]),
  priority: z.enum(["CORE", "HIGH", "MEDIUM", "LOW"]),
});

export type TutorTurn = z.infer<typeof TutorTurnSchema>;
export type DictionaryResult = z.infer<typeof DictionaryResultSchema>;

export function extractJson(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  return JSON.parse(candidate.trim());
}
