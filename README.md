# Java Chat App

Messenger-style web chat MVP with a Java Spring Boot backend, React frontend, Supabase
Auth/Postgres/Storage, stories, voice messages, themes, and an AI assistant.

## Included

- Google OAuth and email/password login through Supabase
- First-login profile setup with display names, usernames, bios, and avatars
- Account search, contact requests, friend profiles, reusable direct chats, and groups
- Local demo mode when Supabase keys are not configured
- Direct, group, and private AI conversations
- REST message history, replies, forwards, reactions, delivery/seen marks, and STOMP WebSocket delivery
- Browser microphone recording and voice playback
- Contact-only or public image/video stories that expire after 24 hours
- Story view counts, reactions, private replies, and owner-controlled deletion
- Light and dark themes saved in the browser
- AI summary and reply-drafting endpoints

## Requirements

- Java 21+
- Maven 3.9+
- Node.js 20+
- A Supabase project for real authentication and media storage

## Quick Start On Windows

Double-click `start-chat.cmd` in the project root. It opens separate backend and frontend
PowerShell windows and then opens `http://localhost:5173/`. Keep both terminal windows open while
using the application.

## Run The Backend

Create the local backend environment file before the first run. Git does not copy this file
because it contains the private Supabase server key.

```powershell
Copy-Item backend/.env.example backend/.env
# Set SUPABASE_SECRET_KEY in backend/.env
cd backend
mvn spring-boot:run
```

The backend starts at `http://localhost:8080`. Set `APP_SECURITY_ENABLED=true` before deployment
so Spring validates Supabase JWTs.

## Run The Frontend

The hosted Supabase URL and publishable key are built into this project because publishable keys
are intended for browser use. A local `frontend/.env` is optional and can override those values.

```powershell
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:5173`.

## Use Another Device

There are two supported setups.

For a full clone running on the second computer:

```powershell
git pull
Copy-Item backend/.env.example backend/.env
# Add SUPABASE_SECRET_KEY to backend/.env, then:
.\start-chat.ps1
```

On macOS or Linux, use `cp backend/.env.example backend/.env`, then run the backend and frontend
commands from the sections above. Never commit `backend/.env` or the secret key.

To use one computer as the server, start the app there and open
`http://SERVER_LAN_IP:5173` on the second device. The frontend automatically connects to port
`8080` on that same server address. Allow inbound TCP ports `5173` and `8080` on the server's
private-network firewall.

For Google login from a LAN address, add the exact frontend address, for example
`http://192.168.1.20:5173/**`, to **Supabase Dashboard > Authentication > URL Configuration >
Redirect URLs**. Keep `http://localhost:5173/**` for computers that run their own clone.

## Configure Supabase

Run `supabase/schema.sql` in the Supabase SQL editor, then create three private Storage buckets:

- `avatars`
- `voice-messages`
- `stories`
- `chat-files`

The schema creates a profile for each OAuth/email user and enables row-level security. Review
`supabase/storage.md` before deploying. Missing storage buckets are created automatically by the
backend on first upload.

Rerun the schema after pulling database changes. It safely creates the chat, contact, story,
message reaction, story reaction, reply, and delete-for-me structures without dropping existing
profile or conversation data. The latest message deletion migration is
`supabase/migrations/20260801222500_message_delete_for_me.sql`, and the media
message and AI action migration is `supabase/migrations/20260808200000_media_messages_and_ai_actions.sql`.


## Configure AI

The AI assistant uses Groq (OpenAI-compatible API). Create API keys at
https://console.groq.com and set them on the Java backend. Three separate keys keep
usage separated per feature:

```powershell
$env:GROQ_SUMMARIZE_API_KEY="your-summarize-key"
$env:GROQ_VOICE_API_KEY="your-voice-key"
$env:GROQ_CONVERSATION_API_KEY="your-conversation-key"
```

- Chat, draft-reply, and question requests use the **conversation** key.
- Voice assistant requests use the **voice** key.
- Summaries use the **summarize** key.

Summary playback uses Groq text-to-speech (`canopylabs/orpheus-v1-english`) with the **voice**
key. The TTS model needs the terms accepted once in the Groq console:
`https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english`. Until then the
browser's built-in voice is used instead. The summary voice can be muted with the speaker
button in the chat header.

Optional overrides:

```powershell
$env:GROQ_MODEL="groq/compound"
$env:GROQ_TTS_MODEL="canopylabs/orpheus-v1-english"
$env:GROQ_TTS_VOICE="hannah"   # autumn, diana, hannah, austin, daniel, troy
$env:GROQ_API_URL="https://api.groq.com/openai/v1"
```

If the configured model is overloaded or unavailable, the backend automatically tries
`qwen/qwen3.6-27b` and `openai/gpt-oss-20b` before falling back to the offline assistant.

## Deploy

The backend (Java) runs on **Railway** and the frontend (React) runs on **Vercel**.

### 1. Backend on Railway

1. Create a Railway project and add a service from this repo, or push to a Railway Git
   integration branch.
2. The repo-root `railway.toml` pins the service to the `backend/` directory and the
   `backend/Dockerfile`, so no manual Root Directory setting is needed.
3. Add the environment variables from `backend/.env.example`:
   - `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_SECRET_KEY`
   - `APP_SECURITY_ENABLED=true`
   - `CORS_ALLOWED_ORIGIN_PATTERNS` (must include your Vercel domain, e.g.
     `https://your-app.vercel.app`; the default already allows `https://*.vercel.app`)
   - `GROQ_SUMMARIZE_API_KEY`, `GROQ_VOICE_API_KEY`, `GROQ_CONVERSATION_API_KEY` for AI
4. Railway sets `PORT` automatically; the backend reads it from `application.yml`.
   Copy the service URL, for example `https://your-backend.up.railway.app`.

### 2. Frontend on Vercel

1. Deploy this repo as a Vercel project. In **Settings > General > Root Directory** set
   `frontend` (Vercel auto-detects Vite; `frontend/vercel.json` serves the SPA).
2. Add these environment variables to the Vercel project (Production), pointing at Railway:
   - `VITE_API_URL=https://your-backend.up.railway.app`
   - `VITE_WS_URL=https://your-backend.up.railway.app/ws`
   - Optionally `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the hosted values
     are built in and used when unset)
3. Redeploy. The frontend calls the Railway backend directly for REST and WebSocket traffic.
4. Add the exact Vercel frontend URL, for example `https://your-app.vercel.app/**`, to
   **Supabase Dashboard > Authentication > URL Configuration > Redirect URLs** for Google login.

## Production Notes

- Keep `SUPABASE_SECRET_KEY` on the Java server. Never expose it through a `VITE_` value.
- Set `GROQ_SUMMARIZE_API_KEY`, `GROQ_VOICE_API_KEY`, and `GROQ_CONVERSATION_API_KEY` on the Java server for real hosted AI responses.
- Pass only messages the authenticated user is authorized to read into AI requests.

