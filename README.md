# MASRI AI

MASRI AI is a mobile-first, voice-first Egyptian Arabic conversation coach. It focuses on contemporary spoken Egyptian, concise feedback, high-frequency vocabulary, and real daily-life situations.

The app runs in a useful demo mode without an API key. In Settings, learners can configure Mistral (default), OpenAI, or an OpenAI-compatible provider for live conversation, transcription, and speech. Keys are never hardcoded and are session-only unless the learner explicitly chooses device storage.

Learning history, saved phrases, dictionary cache, review schedules, mistakes, and progress stay in IndexedDB on the learner's device. Voice recordings are discarded after transcription by default.

## Local development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
