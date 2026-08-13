"use client";

import {
  Activity, ArrowLeft, BarChart3, BookOpen, Check, ChevronRight, Clipboard,
  Coffee, Copy, Download, Dumbbell, Keyboard, Map as MapIcon, MessageCircle,
  Mic, MicOff, Plane, Play, RotateCcw, Search, Send, Settings, ShoppingBag,
  Sparkles, Star, Trash2, Utensils, Volume2, WalletCards, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DictionaryResultSchema, TutorTurnSchema, type DictionaryResult, type TutorTurn } from "../lib/schemas";
import { demoDictionary, demoTeach, demoTutorTurn } from "../lib/demo";
import { db, exportLearningData, recordTurn, reviewItem, saveItem, seedLearningData, type SavedItem } from "../lib/storage";

type Tab = "conversation" | "dictionary" | "practice" | "situations" | "progress";
type VoiceState = "ready" | "listening" | "thinking" | "speaking";
type Provider = "mistral" | "openai" | "custom";

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl: string;
  textModel: string;
  sttModel: string;
  ttsModel: string;
  voiceId: string;
  speed: number;
  remember: boolean;
  costSaver: boolean;
  webSearch: boolean;
  saveRecordings: boolean;
}

const defaultConfig: ProviderConfig = {
  provider: "mistral", apiKey: "", baseUrl: "", textModel: "mistral-small-latest",
  sttModel: "voxtral-mini-latest", ttsModel: "voxtral-mini-tts-2603", voiceId: "",
  speed: 1, remember: false, costSaver: true, webSearch: false, saveRecordings: false,
};

const navItems = [
  { id: "conversation" as const, label: "Conversation", icon: MessageCircle },
  { id: "dictionary" as const, label: "Dictionary", icon: Search },
  { id: "practice" as const, label: "Practice", icon: BookOpen },
  { id: "situations" as const, label: "Situations", icon: MapIcon },
  { id: "progress" as const, label: "Progress", icon: BarChart3 },
];

const starterPrompt = {
  arabic: "عامل إيه؟ عملت إيه النهارده؟",
  english: "How are you? What did you do today?",
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function ArabicText({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span dir="rtl" lang="ar-EG" className={`arabic ${className}`}>{children}</span>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function EmptyState({ icon: Icon, title, copy }: { icon: typeof BookOpen; title: string; copy: string }) {
  return <div className="empty-state"><Icon size={25} /><strong>{title}</strong><p>{copy}</p></div>;
}

export default function MasriApp() {
  const [tab, setTab] = useState<Tab>("conversation");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<ProviderConfig>(defaultConfig);
  const [mode, setMode] = useState("Daily Life");
  const [customTopic, setCustomTopic] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [thinkingStatus, setThinkingStatus] = useState("UNDERSTANDING");
  const [prompt, setPrompt] = useState(starterPrompt);
  const [feedback, setFeedback] = useState<TutorTurn | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [showDontKnow, setShowDontKnow] = useState(false);
  const [dontKnowText, setDontKnowText] = useState("");
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [conversations, setConversations] = useState<Array<{ scores: TutorTurn["scores"]; mistakeTag: string | null; createdAt: number }>>([]);
  const [minutesSpoken, setMinutesSpoken] = useState(0);
  const [dictionaryMode, setDictionaryMode] = useState<"word" | "phrase">("word");
  const [dictionaryQuery, setDictionaryQuery] = useState("busy");
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResult | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micLevel, setMicLevel] = useState(0.25);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const speechTextRef = useRef("");
  const initialPromptSpoken = useRef(false);
  const historyRef = useRef(history);
  const [reviewClock] = useState(() => Date.now());

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const refreshLearning = useCallback(async () => {
    await seedLearningData();
    setSaved(await db().saved.toArray());
    setConversations(await db().conversations.orderBy("createdAt").reverse().toArray());
    setMinutesSpoken((await db().metrics.get("minutesSpoken"))?.value ?? 0);
  }, []);

  useEffect(() => {
    const local = window.localStorage.getItem("masri-provider-config");
    const session = window.sessionStorage.getItem("masri-provider-config");
    const stored = local || session;
    if (stored) {
      try {
        const next = { ...defaultConfig, ...JSON.parse(stored) };
        queueMicrotask(() => setConfig(next));
      } catch { /* ignore corrupted preference */ }
    }
    queueMicrotask(() => void refreshLearning());
  }, [refreshLearning]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const persistConfig = (next: ProviderConfig) => {
    setConfig(next);
    const serialized = JSON.stringify(next);
    if (next.remember) {
      localStorage.setItem("masri-provider-config", serialized);
      sessionStorage.removeItem("masri-provider-config");
    } else {
      sessionStorage.setItem("masri-provider-config", serialized);
      localStorage.removeItem("masri-provider-config");
    }
  };

  const browserSpeak = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-EG";
    utterance.rate = config.speed;
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("ar"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  }), [config.speed]);

  const speak = useCallback(async (text: string) => {
    setVoiceState("speaking");
    try {
      if (config.apiKey) {
        const data = await postJson<{ audio: string; type: string }>("/api/speech", {
          text, provider: config.provider, apiKey: config.apiKey, model: config.ttsModel,
          voice: config.voiceId, baseUrl: config.baseUrl,
        });
        const audio = new Audio(`data:${data.type};base64,${data.audio}`);
        audio.playbackRate = config.speed;
        await audio.play();
        await new Promise<void>((resolve) => { audio.onended = () => resolve(); audio.onerror = () => resolve(); });
      } else {
        await browserSpeak(text);
      }
    } catch {
      await browserSpeak(text);
    } finally {
      setVoiceState("ready");
    }
  }, [browserSpeak, config]);

  useEffect(() => {
    if (initialPromptSpoken.current) return;
    const timer = window.setTimeout(() => {
      initialPromptSpoken.current = true;
      void speak(starterPrompt.arabic);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [speak]);

  const aiPayload = useCallback((task: "conversation" | "dictionary" | "teach" | "test", text: string) => ({
    task, config: { provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl, textModel: config.textModel },
    text, mode: customTopic || mode, history: historyRef.current.slice(-10),
    recentWords: saved.slice(-8).map((item) => item.arabic),
    recurringMistakes: conversations.map((item) => item.mistakeTag).filter(Boolean).slice(0, 6),
  }), [config, conversations, customTopic, mode, saved]);

  const processTurn = useCallback(async (text: string, task: "conversation" | "teach" = "conversation") => {
    if (!text.trim()) return;
    setError(""); setVoiceState("thinking"); setThinkingStatus(task === "teach" ? "BUILDING YOUR PHRASE" : "UNDERSTANDING");
    try {
      let turn: TutorTurn;
      if (config.apiKey) {
        const data = await postJson<{ result: unknown }>("/api/ai", aiPayload(task, text));
        turn = TutorTurnSchema.parse(data.result);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 700));
        turn = task === "teach" ? demoTeach(text) : demoTutorTurn(text);
      }
      setThinkingStatus("CHECKING EGYPTIAN");
      setFeedback(turn);
      setPrompt({ arabic: turn.replyArabic, english: turn.replyEnglish });
      const nextHistory = [...historyRef.current, { role: "user" as const, content: turn.transcript }, { role: "assistant" as const, content: turn.replyArabic }].slice(-12);
      setHistory(nextHistory);
      await recordTurn(turn);
      if (task === "teach" && turn.focusWords[0]) {
        await saveItem({ arabic: turn.naturalEgyptian, english: text, kind: "phrase", priority: "HIGH" });
        showToast("Phrase saved for practice");
      }
      await refreshLearning();
      await speak(turn.replyArabic);
    } catch (cause) {
      setVoiceState("ready");
      setError(cause instanceof Error ? cause.message : "MASRI could not process that turn.");
    }
  }, [aiPayload, config.apiKey, refreshLearning, showToast, speak]);

  const stopMic = () => {
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
  };

  const transcribeBlob = useCallback(async (blob: Blob) => {
    if (!config.apiKey) return speechTextRef.current || "أنا روح الشغل وبعدين قابل صاحبي";
    setThinkingStatus("TRANSCRIBING");
    const form = new FormData();
    form.append("file", blob, "masri-turn.webm");
    form.append("provider", config.provider); form.append("apiKey", config.apiKey);
    form.append("model", config.sttModel); form.append("baseUrl", config.baseUrl);
    const response = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await response.json() as { text?: string; error?: string };
    if (!response.ok) throw new Error(data.error || "Transcription failed.");
    return data.text || "";
  }, [config]);

  const startRecording = async () => {
    setError(""); speechTextRef.current = ""; chunks.current = []; setRecordingSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        stopMic(); setVoiceState("thinking");
        try { await processTurn(await transcribeBlob(blob)); } catch (cause) { setVoiceState("ready"); setError(cause instanceof Error ? cause.message : "Transcription failed."); }
      };
      recorder.start(250);
      setVoiceState("listening");
      timerRef.current = setInterval(() => { setRecordingSeconds((value) => value + 1); setMicLevel(0.2 + Math.random() * 0.75); }, 1000);

      const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void } }).SpeechRecognition
        || (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void } }).webkitSpeechRecognition;
      if (!config.apiKey && SpeechRecognition) {
        const recognition = new SpeechRecognition(); recognition.lang = "ar-EG"; recognition.continuous = true; recognition.interimResults = true;
        recognition.onresult = (event) => { speechTextRef.current = Array.from(event.results).map((result) => result[0].transcript).join(" "); };
        recognition.start(); recognitionRef.current = recognition;
      }
    } catch {
      setVoiceState("ready");
      setError("Microphone access was denied. Allow microphone access or type your answer instead.");
    }
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault(); const value = typed; setTyped(""); void processTurn(value);
  };

  const searchDictionary = async (event?: FormEvent) => {
    event?.preventDefault(); if (!dictionaryQuery.trim()) return;
    setDictionaryLoading(true); setError("");
    try {
      const cached = await db().dictionary.get(dictionaryQuery.toLowerCase());
      if (cached && cached.mode === dictionaryMode) { setDictionaryResult(cached.result); setDictionaryLoading(false); return; }
      let result: DictionaryResult;
      if (config.apiKey) {
        const data = await postJson<{ result: unknown }>("/api/ai", aiPayload("dictionary", dictionaryQuery));
        result = DictionaryResultSchema.parse(data.result);
      } else { await new Promise((resolve) => setTimeout(resolve, 450)); result = demoDictionary(dictionaryQuery); }
      setDictionaryResult(result);
      await db().dictionary.put({ query: dictionaryQuery.toLowerCase(), mode: dictionaryMode, result, createdAt: Date.now() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Phrase lookup failed."); }
    finally { setDictionaryLoading(false); }
  };

  const saveDictionaryResult = async () => {
    if (!dictionaryResult) return;
    await saveItem({ arabic: dictionaryResult.arabic, english: dictionaryResult.english, kind: dictionaryMode === "word" ? "word" : "phrase", priority: dictionaryResult.priority });
    await refreshLearning(); showToast("Saved for practice");
  };

  const testConnection = async () => {
    if (!config.apiKey) { setConnectionState("error"); return; }
    setConnectionState("testing");
    try { await postJson("/api/ai", aiPayload("test", "")); setConnectionState("success"); }
    catch { setConnectionState("error"); }
  };

  const exportData = async () => {
    const url = URL.createObjectURL(new Blob([await exportLearningData()], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `masri-learning-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };

  const dueItems = useMemo(() => saved.filter((item) => item.nextReview <= reviewClock), [reviewClock, saved]);
  const practiceItems = dueItems.length ? dueItems : saved;
  const currentPractice = practiceItems[practiceIndex % Math.max(practiceItems.length, 1)];
  const commonMistakes = useMemo(() => {
    const counts = new Map<string, number>();
    conversations.forEach((item) => { if (item.mistakeTag) counts.set(item.mistakeTag, (counts.get(item.mistakeTag) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [conversations]);
  const averageScore = conversations.length ? Math.round(conversations.reduce((sum, item) => sum + item.scores.overall, 0) / conversations.length) : 0;

  const renderConversation = () => <div className="conversation-grid">
    <div className="conversation-main">
      <div className="mode-row" aria-label="Conversation mode">
        {["Free Talk", "Daily Life", "Quick Questions", "Vocabulary Focus"].map((item) => <button key={item} className={mode === item ? "mode-pill active" : "mode-pill"} onClick={() => setMode(item)}>{item}</button>)}
        <input value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Custom topic…" aria-label="Custom topic" />
      </div>
      <Panel className="voice-stage">
        <div className="stage-grid" aria-hidden="true" />
        <div className="live-context"><span className="pulse-dot" /> LIVE CONTEXT <span>{customTopic || mode.toUpperCase()}</span></div>
        <button className={`voice-core ${voiceState}`} onClick={voiceState === "listening" ? stopRecording : voiceState === "ready" ? startRecording : undefined} aria-label={voiceState === "listening" ? "Stop recording" : "Start speaking"} style={{ "--mic-level": micLevel } as React.CSSProperties}>
          <span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="core-halo" />
          <span className="core-inner">
            {voiceState === "listening" ? <MicOff size={30} /> : voiceState === "thinking" ? <Activity size={30} /> : voiceState === "speaking" ? <Volume2 size={30} /> : <Mic size={30} />}
            <strong>{voiceState === "ready" ? "MASRI READY" : voiceState.toUpperCase()}</strong>
            <small>{voiceState === "ready" ? "TAP TO SPEAK" : voiceState === "listening" ? `${recordingSeconds}s · TAP TO STOP` : voiceState === "thinking" ? thinkingStatus : "VOICE ACTIVE"}</small>
          </span>
        </button>
        <div className={`wave-strip ${voiceState}`} aria-hidden="true">{Array.from({ length: 21 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.06}s` }} />)}</div>
        <div className="prompt-block">
          <ArabicText className="prompt-arabic">{prompt.arabic}</ArabicText>
          <button className="icon-button small" onClick={() => void speak(prompt.arabic)} aria-label="Play MASRI prompt"><Volume2 size={17} /></button>
          <p>{prompt.english}</p>
        </div>
        <div className="conversation-actions">
          <button className="outline-action" onClick={() => setShowDontKnow(true)}><Sparkles size={16} /> I DON&apos;T KNOW</button>
          <span>or answer by typing</span>
        </div>
        <form className="type-bar" onSubmit={submitTyped}>
          <Keyboard size={17} /><input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type your answer in Arabic…" aria-label="Type your answer" dir="rtl" />
          <button disabled={!typed.trim()} aria-label="Send typed answer"><Send size={17} /></button>
        </form>
      </Panel>
    </div>
    <aside className="coach-column">
      <div className="section-kicker">COACH FEEDBACK</div>
      {feedback ? <FeedbackCard turn={feedback} onSpeak={() => void speak(feedback.naturalEgyptian)} onSave={async () => { await saveItem({ arabic: feedback.naturalEgyptian, english: feedback.meaning, kind: "phrase", priority: "HIGH" }); await refreshLearning(); showToast("Phrase saved"); }} />
        : <Panel className="coach-idle"><div className="scan-mark"><Activity /></div><strong>Speak naturally.</strong><p>MASRI will show only the correction that matters, then keep the conversation moving.</p><div className="signal-row"><span>MEANING</span><i /><span>NATURALNESS</span><i /><span>CONTEXT</span></div></Panel>}
      <Panel className="recent-memory"><div><span className="section-kicker">ACTIVE MEMORY</span><small>{saved.length} items</small></div>{saved.slice(-4).reverse().map((item) => <div className="memory-row" key={item.id}><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span><ArabicText>{item.arabic}</ArabicText><span>{item.english}</span></div>)}</Panel>
    </aside>
  </div>;

  const renderDictionary = () => <div className="content-narrow">
    <div className="page-heading"><div><span className="section-kicker">PHRASE FINDER</span><h1>English → real Egyptian</h1><p>What you&apos;ll actually hear and say. No textbook detours.</p></div></div>
    <Panel className="dictionary-search">
      <div className="segmented"><button className={dictionaryMode === "word" ? "active" : ""} onClick={() => setDictionaryMode("word")}>WORD</button><button className={dictionaryMode === "phrase" ? "active" : ""} onClick={() => setDictionaryMode("phrase")}>HOW DO I SAY…?</button></div>
      <form onSubmit={searchDictionary}><Search size={20} /><input value={dictionaryQuery} onChange={(event) => setDictionaryQuery(event.target.value)} placeholder={dictionaryMode === "word" ? "busy" : "I was going to call you but I forgot"} /><button>{dictionaryLoading ? "FINDING…" : "FIND PHRASE"}</button></form>
      <div className="quick-searches"><span>TRY</span>{["busy", "I forgot", "Are you free tomorrow?"].map((item) => <button key={item} onClick={() => setDictionaryQuery(item)}>{item}</button>)}</div>
    </Panel>
    {dictionaryResult ? <Panel className="dictionary-result">
      <div className="result-head"><div><span className={`priority ${dictionaryResult.priority.toLowerCase()}`}>{dictionaryResult.priority}</span><ArabicText className="dictionary-arabic">{dictionaryResult.arabic}</ArabicText><p>{dictionaryResult.english}</p>{dictionaryResult.forms.map((form) => <ArabicText className="form-chip" key={form}>{form}</ArabicText>)}</div><button className="play-square" onClick={() => void speak(dictionaryResult.arabic)}><Play size={21} fill="currentColor" /></button></div>
      <div className="example-list"><span className="section-kicker">IN REAL LIFE</span>{dictionaryResult.examples.map((example, i) => <div key={i}><ArabicText>{example.arabic}</ArabicText><p>{example.english}</p><button onClick={() => void speak(example.arabic)} aria-label="Play example"><Volume2 size={16} /></button></div>)}</div>
      <div className="result-actions"><button onClick={() => void saveDictionaryResult()}><Star size={16} /> SAVE</button><button onClick={() => { setTab("practice"); void saveDictionaryResult(); }}><Mic size={16} /> PRACTICE</button><button onClick={() => { void navigator.clipboard.writeText(dictionaryResult.arabic); showToast("Copied"); }}><Copy size={16} /> COPY</button></div>
    </Panel> : <EmptyState icon={Search} title="Ask for a word or a whole thought" copy="Results are cached on this device to save credits." />}
  </div>;

  const renderPractice = () => <div className="content-narrow">
    <div className="page-heading"><div><span className="section-kicker">ADAPTIVE REVIEW</span><h1>Make useful language automatic.</h1><p>Today&apos;s queue favors high-frequency language and your recurring mistakes.</p></div><div className="due-badge"><strong>{dueItems.length}</strong><span>DUE NOW</span></div></div>
    {currentPractice ? <Panel className="practice-card">
      <div className="practice-top"><span>ENGLISH → ARABIC</span><span>{(practiceIndex % practiceItems.length) + 1} / {practiceItems.length}</span></div>
      <div className="practice-prompt"><p>How would you say:</p><h2>{currentPractice.english}</h2>{practiceRevealed ? <div className="practice-answer"><ArabicText>{currentPractice.arabic}</ArabicText><button onClick={() => void speak(currentPractice.arabic)}><Volume2 size={18} /></button></div> : <button className="reveal" onClick={() => setPracticeRevealed(true)}>REVEAL EGYPTIAN</button>}</div>
      {practiceRevealed && <div className="recall-actions"><button className="again" onClick={async () => { await reviewItem(currentPractice.id, false); setPracticeRevealed(false); setPracticeIndex((v) => v + 1); await refreshLearning(); }}><RotateCcw size={16} /> AGAIN</button><button className="remembered" onClick={async () => { await reviewItem(currentPractice.id, true); setPracticeRevealed(false); setPracticeIndex((v) => v + 1); await refreshLearning(); }}><Check size={16} /> I REMEMBERED</button></div>}
    </Panel> : <EmptyState icon={BookOpen} title="Your review queue is clear" copy="Save words or phrases from Conversation and Dictionary to build it." />}
    <div className="practice-methods">{[{ icon: ArrowLeft, t: "English → Arabic" }, { icon: ChevronRight, t: "Arabic → English" }, { icon: Mic, t: "Speak it" }, { icon: Clipboard, t: "Complete sentence" }].map(({ icon: Icon, t }, i) => <div className={i === 0 ? "active" : ""} key={t}><Icon size={17} /><span>{t}</span></div>)}</div>
  </div>;

  const situations = [
    { title: "Talking to a friend", arabic: "بتعمل إيه الويك إند؟", icon: MessageCircle, level: "CORE" },
    { title: "Restaurant", arabic: "ممكن المنيو لو سمحت؟", icon: Utensils, level: "CORE" },
    { title: "Taxi / Careem", arabic: "ممكن تنزلني هنا؟", icon: WalletCards, level: "HIGH" },
    { title: "Café", arabic: "عايز قهوة سادة.", icon: Coffee, level: "CORE" },
    { title: "Gym", arabic: "فاضل كام مجموعة؟", icon: Dumbbell, level: "HIGH" },
    { title: "Shopping", arabic: "ده بكام؟", icon: ShoppingBag, level: "CORE" },
    { title: "Office meeting", arabic: "الميعاد الساعة كام؟", icon: Activity, level: "HIGH" },
    { title: "Airport", arabic: "البوابة فين؟", icon: Plane, level: "HIGH" },
  ];

  const renderSituations = () => <div className="content-wide"><div className="page-heading"><div><span className="section-kicker">ROLEPLAY</span><h1>Rehearse life before it happens.</h1><p>MASRI plays the other person. You respond out loud in Egyptian.</p></div></div><div className="situation-grid">{situations.map(({ title, arabic, icon: Icon, level }) => <button key={title} className="situation-card" onClick={() => { setPrompt({ arabic, english: title }); setMode(title); setTab("conversation"); window.setTimeout(() => void speak(arabic), 100); }}><span className="situation-icon"><Icon size={22} /></span><span className={`priority ${level.toLowerCase()}`}>{level}</span><strong>{title}</strong><ArabicText>{arabic}</ArabicText><span className="begin">BEGIN ROLEPLAY <ChevronRight size={16} /></span></button>)}</div></div>;

  const renderProgress = () => <div className="content-wide">
    <div className="page-heading"><div><span className="section-kicker">LEARNING SIGNAL</span><h1>Your Egyptian, in motion.</h1><p>Useful evidence—not trophies.</p></div><div className="streak"><Activity size={18} /><strong>{conversations.length ? 1 : 0}</strong><span>DAY STREAK</span></div></div>
    <div className="stats-grid">{[
      [saved.filter((i) => i.kind === "word").length, "WORDS LEARNED"], [saved.filter((i) => i.kind === "phrase").length, "PHRASES SAVED"], [minutesSpoken.toFixed(1), "MINUTES SPOKEN"], [conversations.length, "CONVERSATIONS"], [dueItems.length, "DUE FOR REVIEW"], [averageScore || "—", "AVG. CLARITY"],
    ].map(([value, label]) => <Panel key={label}><strong>{value}{label === "AVG. CLARITY" && value !== "—" ? "%" : ""}</strong><span>{label}</span></Panel>)}</div>
    <div className="progress-columns"><Panel><span className="section-kicker">COMMON PATTERNS</span>{commonMistakes.length ? commonMistakes.map(([mistake, count]) => <div className="mistake-row" key={mistake}><span>{mistake}</span><i><b style={{ width: `${Math.min(count * 30, 100)}%` }} /></i><small>{count}×</small></div>) : <p className="muted">MASRI will identify patterns after a few conversations.</p>}</Panel><Panel><span className="section-kicker">RECENT IMPROVEMENT</span><div className="improvement"><div className="improvement-ring"><strong>{averageScore || 0}</strong><span>CLARITY</span></div><p>{conversations.length ? "Your meaning is coming through. Keep recycling your recent CORE words in complete thoughts." : "Complete your first conversation to establish a baseline."}</p></div></Panel></div>
    <button className="export-button" onClick={() => void exportData()}><Download size={17} /> EXPORT LEARNING DATA</button>
  </div>;

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar"><button className="brand" onClick={() => setTab("conversation")}><span className="brand-mark"><i /><b /></span><span><strong>MASRI <em>AI</em></strong><small>EGYPTIAN VOICE COACH</small></span></button><div className="system-status"><span className={config.apiKey ? "online" : "demo"} /><span>{config.apiKey ? `${config.provider.toUpperCase()} CONNECTED` : "DEMO SYSTEM"}</span><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings size={19} /></button></div></header>
    <nav className="side-nav" aria-label="Main navigation">{navItems.map(({ id, label, icon: Icon }) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    <div className="app-content">{error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}{tab === "conversation" && renderConversation()}{tab === "dictionary" && renderDictionary()}{tab === "practice" && renderPractice()}{tab === "situations" && renderSituations()}{tab === "progress" && renderProgress()}</div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{navItems.map(({ id, label, icon: Icon }) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    {showDontKnow && <div className="modal-backdrop"><div className="modal small-modal"><button className="modal-close" onClick={() => setShowDontKnow(false)}><X size={19} /></button><span className="section-kicker">I DON&apos;T KNOW</span><h2>What did you want to say?</h2><p>Type it in English. MASRI will teach one natural Egyptian phrase and ask you to say it.</p><form onSubmit={(event) => { event.preventDefault(); setShowDontKnow(false); void processTurn(dontKnowText, "teach"); setDontKnowText(""); }}><textarea value={dontKnowText} onChange={(event) => setDontKnowText(event.target.value)} placeholder="I need to finish something first." aria-label="English phrase to learn" /><button className="primary-button" disabled={!dontKnowText.trim()}>TEACH ME <ArrowLeft size={16} /></button></form></div></div>}
    {settingsOpen && <SettingsModal config={config} setConfig={persistConfig} close={() => setSettingsOpen(false)} connectionState={connectionState} testConnection={testConnection} clearData={async () => { if (window.confirm("Clear all learning data on this device?")) { await db().delete(); await refreshLearning(); showToast("Learning data cleared"); } }} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </main>;
}

function FeedbackCard({ turn, onSpeak, onSave }: { turn: TutorTurn; onSpeak: () => void; onSave: () => void }) {
  return <Panel className="feedback-card">
    <div className="feedback-header"><span className="signal-good"><Check size={14} /> MEANING CLEAR</span><strong>{turn.scores.overall}<small>/100</small></strong></div>
    <div className="feedback-section"><span>HEARD</span><ArabicText>{turn.transcript}</ArabicText></div>
    <div className="feedback-section"><span>MEANING</span><p>{turn.meaning}</p></div>
    <div className="feedback-section natural"><span>NATURAL EGYPTIAN</span><div><ArabicText>{turn.naturalEgyptian}</ArabicText><button onClick={onSpeak}><Volume2 size={16} /></button></div></div>
    {turn.quickFix && <div className="quick-fix"><Sparkles size={16} /><div><span>QUICK FIX</span><p>{turn.quickFix}</p></div></div>}
    <div className="score-bars">{(["meaning", "grammar", "naturalness"] as const).map((key) => <div key={key}><span>{key.toUpperCase()}</span><i><b style={{ width: `${turn.scores[key]}%` }} /></i><strong>{turn.scores[key]}</strong></div>)}</div>
    <button className="save-phrase" onClick={onSave}><Star size={16} /> SAVE NATURAL PHRASE</button>
  </Panel>;
}

function SettingsModal({ config, setConfig, close, connectionState, testConnection, clearData }: { config: ProviderConfig; setConfig: (value: ProviderConfig) => void; close: () => void; connectionState: string; testConnection: () => void; clearData: () => void }) {
  const patch = (value: Partial<ProviderConfig>) => setConfig({ ...config, ...value });
  const providerDefaults = (provider: Provider) => provider === "mistral"
    ? { provider, textModel: "mistral-small-latest", sttModel: "voxtral-mini-latest", ttsModel: "voxtral-mini-tts-2603" }
    : provider === "openai"
      ? { provider, textModel: "gpt-4.1-mini", sttModel: "gpt-4o-mini-transcribe", ttsModel: "gpt-4o-mini-tts" }
      : { provider, textModel: "", sttModel: "", ttsModel: "" };
  return <div className="modal-backdrop"><div className="modal settings-modal"><div className="modal-title"><div><span className="section-kicker">SYSTEM CONFIGURATION</span><h2>Settings</h2></div><button className="modal-close" onClick={close}><X size={20} /></button></div>
    <div className="settings-section"><h3>AI PROVIDER</h3><div className="provider-options">{(["mistral", "openai", "custom"] as Provider[]).map((provider) => <button className={config.provider === provider ? "active" : ""} key={provider} onClick={() => patch(providerDefaults(provider))}>{provider === "mistral" ? "Mistral" : provider === "openai" ? "OpenAI" : "Custom"}<small>{provider === "mistral" ? "DEFAULT" : provider === "custom" ? "COMPATIBLE" : "OPTIONAL"}</small></button>)}</div>
      {config.provider === "custom" && <label>BASE URL<input value={config.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="https://provider.example/v1" /></label>}
      <label>API KEY<input type="password" autoComplete="off" value={config.apiKey} onChange={(e) => patch({ apiKey: e.target.value })} placeholder="Paste key — never logged" /></label>
      <label className="toggle-line" aria-label="Remember on this device"><span><strong>Remember on this device</strong><small>Off stores the key for this browser session only.</small></span><input aria-label="Remember on this device" type="checkbox" checked={config.remember} onChange={(e) => patch({ remember: e.target.checked })} /></label>
      <button className={`test-button ${connectionState}`} onClick={testConnection} disabled={connectionState === "testing"}>{connectionState === "testing" ? "TESTING…" : connectionState === "success" ? "CONNECTED" : connectionState === "error" ? "CONNECTION FAILED" : "TEST CONNECTION"}</button>
    </div>
    <div className="settings-section models"><h3>MODELS & VOICE</h3><label>TEXT MODEL<input value={config.textModel} onChange={(e) => patch({ textModel: e.target.value })} /></label><label>SPEECH-TO-TEXT<input value={config.sttModel} onChange={(e) => patch({ sttModel: e.target.value })} /></label><label>TEXT-TO-SPEECH<input value={config.ttsModel} onChange={(e) => patch({ ttsModel: e.target.value })} /></label><label>VOICE ID <small>(optional)</small><input value={config.voiceId} onChange={(e) => patch({ voiceId: e.target.value })} placeholder="Uses browser Arabic voice when blank/unavailable" /></label><label>VOICE SPEED<select value={config.speed} onChange={(e) => patch({ speed: Number(e.target.value) })}><option value={0.8}>0.8×</option><option value={1}>1×</option><option value={1.15}>1.15×</option></select></label></div>
    <div className="settings-section"><h3>PRIVACY & COST</h3><label className="toggle-line" aria-label="Cost saver mode"><span><strong>Cost saver mode</strong><small>One combined evaluation + response call per turn.</small></span><input aria-label="Cost saver mode" type="checkbox" checked={config.costSaver} onChange={(e) => patch({ costSaver: e.target.checked })} /></label><label className="toggle-line" aria-label="Allow web search"><span><strong>Allow web search</strong><small>Off. Ordinary language coaching never needs it.</small></span><input aria-label="Allow web search" type="checkbox" checked={config.webSearch} onChange={(e) => patch({ webSearch: e.target.checked })} /></label><label className="toggle-line" aria-label="Save recordings locally"><span><strong>Save recordings locally</strong><small>Off. Audio is discarded after transcription.</small></span><input aria-label="Save recordings locally" type="checkbox" checked={config.saveRecordings} onChange={(e) => patch({ saveRecordings: e.target.checked })} /></label><button className="danger-button" onClick={clearData}><Trash2 size={15} /> CLEAR LEARNING DATA</button></div>
  </div></div>;
}
