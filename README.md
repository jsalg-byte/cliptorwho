# Cliptor Who

Cliptor Who is a full-stack livestream clipping and highlight extraction app inspired by clips.gg.

## Stack
- Frontend: React (Vite), TailwindCSS, Recharts
- Backend: Node.js, Express
- Database: SQLite via better-sqlite3
- Video processing: ffmpeg (system binary in production)
- Auth: Twitch OAuth 2.0 + Kick API key

## Local Setup

1. Copy environment file:
   - `cp .env.example .env`
2. Fill Twitch app values in `.env`:
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
   - `TWITCH_REDIRECT_URI=http://localhost:3001/auth/twitch/callback`
3. Start backend:
   - `cd server && npm install && npm start`
4. Start frontend:
   - `cd client && npm install && npm run dev`
5. Open `http://localhost:5173`

## Coolify (Simple Mode: One Service)

This repo is now set up to deploy as a single Coolify service using the root `Dockerfile`.

What this does:
- Builds frontend (`client/dist`)
- Runs backend on port `3001`
- Serves frontend from backend (same domain)
- Installs system ffmpeg in the container (`/usr/bin/ffmpeg`)

### 1. Create service
- In Coolify: New Resource -> Application -> Dockerfile
- Repository root: this repo
- Dockerfile path: `./Dockerfile`
- Exposed port: `3001`

### 2. Add environment variables (backend service)
You can start from `.env.coolify.example`.

- `NODE_ENV=production`
- `PORT=3001`
- `PUBLIC_BACKEND_URL=https://your-app-domain.com`
- `FRONTEND_URL=https://your-app-domain.com`
- `TRUST_PROXY=true`
- `SESSION_SECRET=<strong random value>`
- `CONNECTION_ENCRYPTION_KEY=<strong random value>`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAMESITE=none`
- `FFMPEG_PATH=/usr/bin/ffmpeg`
- `STORAGE_BACKEND=local` (or `r2`)
- `R2_ENDPOINT=...` (required when `STORAGE_BACKEND=r2`)
- `R2_BUCKET=...`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `MAX_STORAGE_GB=0` (0 disables cap)
- `MAX_STORAGE_BYTES=0` (overrides `MAX_STORAGE_GB` when set)
- `CLIP_RETENTION_DAYS=0` (0 disables auto-delete)
- `RETENTION_SWEEP_MINUTES=360`
- `ESTIMATED_BYTES_PER_SECOND=750000`
- `TWITCH_CLIENT_ID=...`
- `TWITCH_CLIENT_SECRET=...`
- `TWITCH_REDIRECT_URI=https://your-app-domain.com/auth/twitch/callback`

R2 endpoint format example:
- `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`

### 3. Add persistent volumes
Mount these paths:
- `/app/server/db`
- `/app/server/clips`
- `/app/server/thumbs`
- `/app/server/uploads`
- `/app/server/frames`

If `STORAGE_BACKEND=r2`, you still need `/app/server/db`, and temporary working directories (`clips/thumbs/uploads/frames`) but long-term clip assets are stored in R2.

### 4. Twitch Developer Console
Add OAuth redirect URL:
- `https://your-app-domain.com/auth/twitch/callback`

## Multi-user Model
- Each session maps to a user record.
- Twitch and Kick credentials are stored per user (`user_connections`).
- Secrets are encrypted at rest using `CONNECTION_ENCRYPTION_KEY`.
- Clips, settings, and upload jobs are user-scoped.

## Storage Guardrails
- Clip files now support `local` disk or Cloudflare R2 (`STORAGE_BACKEND=r2`).
- New clips are blocked when projected usage exceeds configured storage cap.
- Retention sweeps can automatically delete old clips and their assets.

## API Overview

### Auth
- `GET /auth/twitch`
- `GET /auth/twitch/callback`
- `POST /auth/kick`
- `POST /auth/disconnect/:provider`
- `GET /auth/status`
- `POST /auth/logout`

### Clips
- `GET /api/clips`
- `GET /api/clips/:id`
- `POST /api/clip`
- `PATCH /api/clips/:id`
- `DELETE /api/clips/:id`
- `POST /api/clips/:id/trim`
- `GET /api/clips/:id/file`
- `GET /api/clips/:id/thumb`

### Upload
- `POST /api/upload`
- `GET /api/upload/:id/status` (SSE)
- `GET /api/upload/:id/candidates`
- `POST /api/upload/save-approved`

### Stream
- `GET /api/stream/status`
- `GET /api/stream/chat-activity` (SSE)

### Settings
- `GET /api/settings`
- `POST /api/settings`

### Public Share
- `GET /api/share/:token`
- `GET /api/share/:token/file`
- `GET /api/share/:token/thumb`
