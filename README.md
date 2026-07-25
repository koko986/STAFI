# Java Chat App

Messenger-style web chat MVP with a Java Spring Boot backend, React frontend, Supabase
Auth/Postgres/Storage, stories, voice messages, themes, and an AI assistant.

## Included

- Gmail OAuth and phone OTP login through Supabase
- Local demo mode when Supabase keys are not configured
- Direct, group, and private AI conversations
- REST message history and STOMP WebSocket delivery
- Browser microphone recording and voice playback
- Image/video stories that expire after 24 hours
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

Set the variables shown in `backend/.env.example`, or leave `APP_SECURITY_ENABLED=false` for
local demo mode.

```powershell
cd backend
mvn spring-boot:run
```

The backend starts at `http://localhost:8080`. Demo conversations, messages, and stories are kept
in memory for the current process. Set `APP_SECURITY_ENABLED=true` before deployment so Spring
validates Supabase JWTs.

## Run The Frontend

Copy `frontend/.env.example` to `frontend/.env` and add your Supabase project values. Without
Supabase values, the app opens directly in demo mode.

```powershell
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:5173`.

## Configure Supabase

Run `supabase/schema.sql` in the Supabase SQL editor, then create three private Storage buckets:

- `avatars`
- `voice-messages`
- `stories`

The schema creates a profile for each OAuth/phone user and enables row-level security. Review
`supabase/storage.md` before deploying.

## Production Notes

- Replace the in-memory `ChatService` and `StoryService` stores with Supabase repositories before
  running more than one Java server.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the Java server. Never expose it through a `VITE_` value.
- Set `AI_API_URL`, `AI_MODEL`, and `AI_API_KEY` to use an OpenAI-compatible chat-completions
  provider. Without them, the assistant remains in offline demo mode.
- Pass only messages the authenticated user is authorized to read into AI requests.
