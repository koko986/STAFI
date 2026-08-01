# Java Chat App

Messenger-style web chat MVP with a Java Spring Boot backend, React frontend, Supabase
Auth/Postgres/Storage, stories, voice messages, themes, and an AI assistant.

## Included

- Gmail OAuth and phone OTP login through Supabase
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

The schema creates a profile for each OAuth/phone user and enables row-level security. Review
`supabase/storage.md` before deploying.

Rerun the schema after pulling database changes. It safely creates the chat, contact, story,
message reaction, story reaction, and reply structures without dropping existing profile or
conversation data. The latest message-action migration is
`supabase/migrations/20260730203000_message_actions_and_receipts.sql`.

## Production Notes

- Keep `SUPABASE_SECRET_KEY` on the Java server. Never expose it through a `VITE_` value.
- Set `AI_API_URL`, `AI_MODEL`, and `AI_API_KEY` to use an OpenAI-compatible chat-completions
  provider. Without them, the assistant remains in offline demo mode.
- Pass only messages the authenticated user is authorized to read into AI requests.
