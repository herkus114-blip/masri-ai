import type { DictionaryResult, TutorTurn } from "./schemas";

const clean = (value: string) => value.trim().replace(/[.؟?!]/g, "");

export function demoTutorTurn(input: string): TutorTurn {
  const text = clean(input) || "أنا رحت الشغل وبعدين قابلت صاحبي";
  const pastError = /أنا\s+(روح|قابل|اكل|شوف)(\s|$)/.test(text);
  const natural = text
    .replace(/أنا روح(\s|$)/, "أنا رحت$1")
    .replace(/وبعدين قابل(\s|$)/, "وبعدين قابلت$1")
    .replace(/أنا اكل(\s|$)/, "أنا أكلت$1")
    .replace(/أنا شوف(\s|$)/, "أنا شوفت$1");
  return {
    transcript: text,
    meaning: pastError ? "I went to work and then met my friend." : "Your message was understood.",
    naturalEgyptian: natural,
    quickFix: pastError ? "Use the completed-action forms رحت and قابلت when you’re talking about the past." : null,
    understandable: true,
    scores: pastError
      ? { meaning: 94, grammar: 68, naturalness: 72, overall: 79 }
      : { meaning: 96, grammar: 88, naturalness: 90, overall: 91 },
    replyArabic: pastError ? "طب عملتوا إيه لما قابلته؟" : "حلو. وإيه اللي حصل بعد كده؟",
    replyEnglish: pastError ? "So what did you do when you met him?" : "Good. What happened after that?",
    focusWords: pastError
      ? [{ arabic: "قابلت", english: "I met", priority: "CORE" }]
      : [{ arabic: "بعد كده", english: "after that", priority: "CORE" }],
    mistakeTag: pastError ? "past-tense completed actions" : null,
  };
}

const dictionary: Record<string, DictionaryResult> = {
  umbrella: {
    arabic: "شمسية",
    english: "umbrella",
    forms: ["شمسية / شمسيات"],
    examples: [
      { arabic: "خد الشمسيّة عشان الدنيا هتمطر.", english: "Take the umbrella because it is going to rain." },
      { arabic: "نسيت الشمسيّة في العربية.", english: "I forgot the umbrella in the car." },
    ],
    alternatives: [],
    priority: "CORE",
    confidence: "HIGH",
  },
  busy: {
    arabic: "مشغول",
    english: "busy",
    forms: ["مشغول / مشغولة"],
    examples: [
      { arabic: "أنا مشغول دلوقتي.", english: "I’m busy right now." },
      { arabic: "كنت مشغول امبارح.", english: "I was busy yesterday." },
      { arabic: "إنت مشغول بكرة؟", english: "Are you busy tomorrow?" },
    ],
    alternatives: [],
    priority: "CORE",
    confidence: "HIGH",
  },
  "i was going to call you but i forgot": {
    arabic: "كنت هكلمك بس نسيت.",
    english: "I was going to call you but I forgot.",
    forms: [],
    examples: [
      { arabic: "كنت هكلمك بالليل.", english: "I was going to call you at night." },
      { arabic: "معلش، نسيت خالص.", english: "Sorry, I completely forgot." },
    ],
    alternatives: ["كنت ناوي أكلمك بس نسيت."],
    priority: "HIGH",
    confidence: "HIGH",
  },
};

export function demoDictionary(query: string): DictionaryResult {
  const key = clean(query).toLowerCase();
  if (dictionary[key]) return dictionary[key];
  return {
    arabic: "ممكن تقولها بطريقة أبسط؟",
    english: "Could you say it in a simpler way?",
    forms: [],
    examples: [
      { arabic: "ممكن تقولها تاني؟", english: "Could you say it again?" },
      { arabic: "يعني إيه؟", english: "What does that mean?" },
    ],
    alternatives: ["ممكن توضّح؟"],
    priority: "CORE",
    confidence: "LOW",
  };
}

export function demoTeach(english: string): TutorTurn {
  const phrase = english.toLowerCase().includes("finish")
    ? "لازم أخلص حاجة الأول."
    : english.toLowerCase().includes("late")
      ? "أنا هتأخر شوية."
      : "مش عارف أقولها إزاي.";
  return {
    transcript: english,
    meaning: english,
    naturalEgyptian: phrase,
    quickFix: "Say this whole phrase as one natural chunk.",
    understandable: true,
    scores: { meaning: 100, grammar: 100, naturalness: 100, overall: 100 },
    replyArabic: "يلا، قولها بصوت عالي.",
    replyEnglish: "Now say it aloud.",
    focusWords: [{ arabic: phrase.replace(/[.؟]/g, ""), english, priority: "HIGH" }],
    mistakeTag: null,
  };
}
