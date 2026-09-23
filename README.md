# Chalkie

Chalkie is a visual-first AI teacher. A learner asks a question by text or voice; Chalkie researches up to 20 sources, builds a hybrid retrieval index, asks Groq Cloud's `openai/gpt-oss-120b` for a strict semantic lesson schema, and turns that schema into a narrated tldraw lesson.

The app is a standard Next.js App Router project designed for Vercel. It works without credentials in demo mode, so the complete UI and lesson pipeline can be evaluated before connecting external services.

## What is implemented

- NotebookLM-style home workspace for starting a new topic and reopening recent locally saved lessons before entering the studio.
- Real tldraw canvas with programmatic semantic-object rendering and IndexedDB persistence.
- Sparse, visual-first lesson schema. The model never emits executable code or raw tldraw records.
- A production-oriented spatial grammar: independent objects keep a 36px safety gap, every line endpoint and polygon point is bounded, long labels are repositioned to avoid collisions, and overflowing paths are clipped to their semantic object.
- A dedicated quantitative `axes` primitive with required x/y variable names, reserved plot margins, ticks, arrowheads, and a quality gate that rejects unlabeled charts before they reach the canvas.
- Streaming HTTP lesson generation with visible stages and cancellation.
- Sticky Groq failover across as many as three keys: the active key remains selected until Groq returns a limit/authentication failure, then it moves to the back and the next key is tried inside the same request.
- BYOK settings for up to three Groq keys and one Tavily key. Personal keys are AES-256-GCM encrypted in an HttpOnly, same-site cookie and never written to IndexedDB or local storage.
- Live provider status in the header, including the active slot, requests remaining for the day, tokens remaining for the minute, cooldown/reset state, and a graceful `FREE limit reached` state when no key is available.
- Conversational voice follow-ups that retrieve from the original lesson index, decide whether the answer already exists on the board, and either revisit it or append a connected visual beside it.
- Incremental same-canvas teaching: follow-up objects are revealed in narration order while the camera and laser track semantic targets; the original scene is never replaced.
- Local and Vercel WebSocket endpoints for voice-query, generation-stage, timeline, pointer, and interruption events.
- Client reconnect with exponential backoff from 1 to 30 seconds, join replay, heartbeat, and automatic HTTP fallback.
- Tavily search capped at 20 results, URL deduplication, safe chunking, lexical scoring, optional vector similarity, GPT-OSS-120B reranking, and an optional Redis-backed research index.
- Groq Whisper transcription and Groq Orpheus speech, with browser speech synthesis as the no-key fallback.
- Audio-driven lesson queue: the next visual segment advances only when the previous narration ends.
- Local lesson metadata stored in IndexedDB. tldraw stores canvas state in its own IndexedDB store.
- Opt-in Google Drive OAuth using the narrow `drive.file` scope, encrypted HttpOnly session cookies, token refresh, and JSON lesson backups.
- Responsive three-panel studio influenced by NotebookLM's source workspace and Flow's cinematic dark editor, without copying either product.
- A page-level WebMCP tool named `create_visual_lesson` for supported agentic browsers.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. `pnpm dev` runs Chalkie's custom Next.js server with the full UI, streaming HTTP routes, and a local `/api/ws` WebSocket endpoint. To test Vercel's experimental WebSocket runtime specifically, use a recent Vercel CLI:

```bash
pnpm dev:vercel
```

## Environment settings

Copy `.env.example` and configure:

- `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`: server-managed sticky failover pool for the strict `openai/gpt-oss-120b` lesson generator, Whisper STT, and Orpheus TTS. Only the first is required.
- `TAVILY_API_KEY`: activates live research of up to 20 unique sources.
- `BYOK_ENCRYPTION_SECRET`: required in production for personal provider keys. Use a separate random value of at least 32 characters. Local development falls back to an ephemeral process key.
- `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`: required by tldraw for a production deployment. Obtain an appropriate key directly from tldraw.
- `REDIS_URL`: optional but recommended for durable research indexes on Vercel.
- `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`: optional OpenAI-compatible embeddings. When omitted, lexical retrieval and GPT-OSS reranking continue to work.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`: optional Google Drive backup. `SESSION_SECRET` must be at least 32 random characters.
- `NEXT_PUBLIC_USE_GROQ_TTS`: set to `true` to use Groq Orpheus audio. Leave it unset to use the browser's built-in, no-cost speech synthesis.

For Google Drive, add this authorized redirect URI in Google Cloud:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

Use `http://localhost:3000/api/auth/google/callback` for local development.

## Deploy to Vercel

1. Push this directory to a Git repository and import it in Vercel, or run `vercel` from this directory.
2. Add the environment values in Project Settings → Environment Variables.
3. Deploy. No custom build command or output directory is needed.
4. Run `GET /api/health` after deployment. It reports demo/live mode and which optional services are configured without exposing credentials.
5. Test `/api/ws` on the Vercel deployment. WebSockets on Vercel Functions are currently a platform beta, and connections end at the Function's maximum duration. Chalkie expects that and reconnects automatically.

## Data and connection behavior

The browser never receives Groq, Tavily, Redis, or Google client-secret credentials. API calls are made from Node.js routes with bounded timeouts and validated request sizes. The LLM output passes a strict Zod whitelist before the client can map it into tldraw.

BYOK secrets are submitted once to `/api/byok`, encrypted by the backend, and returned only as a secure HttpOnly cookie. The UI receives masked key identifiers and quota metadata, never the secret values. Groq's documented headers report requests remaining per day and tokens remaining per minute; Chalkie labels these precisely rather than presenting them as an unavailable monetary credit balance.

The Groq pool is sticky, not round-robin. A healthy active key handles subsequent model, reranking, transcription, and optional speech requests. A `429`, `401`, or `403` moves that key behind the others immediately. If every configured key is cooling down, exhausted, or invalid, the stream emits `FREE_LIMIT_REACHED` and the UI remains usable for saved lessons instead of exposing a raw provider error.

The primary model/RAG transport is streaming HTTP because it survives WebSocket churn and Vercel instance changes. The socket is the low-latency control lane for voice-query state, generation progress, timeline, pointer, and interruption events. If the socket is down, research, generation, voice playback, and local pointer synchronization continue on the active client.

Each browser gets its own persistent session ID. The original 20-source chunk index is kept in memory for local development and in Redis when configured. Follow-up retrieval re-scores the stored chunks for the new question with lexical/optional semantic scoring and GPT-OSS reranking instead of launching a fresh web search.

## Verification

```bash
pnpm typecheck
pnpm build
```

The app intentionally provides a deterministic demo lesson when `GROQ_API_KEY` is absent. Live research and generated explanations require the configured third-party credentials, and production tldraw usage requires its license key.
