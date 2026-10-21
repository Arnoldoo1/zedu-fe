# The Office — deployment guide (Coolify)

Two applications, two repositories, both on feature branches in the
`zedu-team-mando` fork.

| App      | Repository                       | Branch                   | Route                                    |
| -------- | -------------------------------- | ------------------------ | ---------------------------------------- |
| Frontend | `zedu-team-mando/office-zedu-fe` | `feature/office-3d-demo` | `/office` (demo), `/[org]/office` (live) |
| Backend  | `zedu-team-medu/office-zedu-be`  | `feat/office-3d-backend` | `/api/v1/office/*`                       |

---

## 1. Backend — `office-zedu-be`

The repository already contains a `Dockerfile`, so Coolify can build it
directly.

- **Build pack:** Dockerfile
- **Branch:** `feat/office-3d-backend`
- **Port:** `SERVER_PORT` (default 3000 — set it to the port Coolify exposes)
- **Health check:** `GET /` returns `{"code":200,...}`

### Environment

```env
# Database (required — also creates the office tables)
DB_HOST=...
DB_PORT=5432
DB_NAME=...
USERNAME=...
PASSWORD=...
DB_CONNECTION=...
SSLMODE=require
TIMEZONE=UTC
MIGRATE=true

# Auth
SERVER_SECRET=...
SERVER_ENCKEY=...
SERVER_ACCESSTOKENEXPIREDURATION=...

# Presence: Centrifugo channels and Redis
CENTRIFUGE_URL=...
CENTRIFUGE_API_KEY=...
HMAC_SECRET=...
REDIS_HOST=...
REDIS_PORT=6379
REDIS_DB=0

# The rest of the platform's variables (MinIO, Mongo, Typesense, Elastic,
# RabbitMQ, Stripe, mail, ...) stay as they are today.
```

`MIGRATE=true` runs the GORM auto-migration on boot, which creates:

- `office_layouts` — versioned furniture per room
- `office_room_configs` — per room overrides
- `organisations.office_settings` (jsonb, nullable)
- `profiles.avatar_config` (jsonb, nullable)

plus four partial unique indexes on `office_layouts` (one published layout per
room, one draft per admin, version history).

> The migration is additive only. No existing column is renamed, dropped or
> retyped, and the office columns are nullable, so nothing else changes.

### New endpoints

```
GET    /api/v1/office/bootstrap
GET    /api/v1/office/rooms/:roomId
GET    /api/v1/office/rooms/:roomId/layout
GET    /api/v1/office/rooms/:roomId/layout/draft
POST   /api/v1/office/rooms/:roomId/layout/draft
POST   /api/v1/office/rooms/:roomId/layout/publish
POST   /api/v1/office/rooms/:roomId/layout/reset
PUT    /api/v1/office/rooms/:roomId/layout
GET    /api/v1/office/rooms/:roomId/occupants
POST   /api/v1/office/rooms/:roomId/enter
POST   /api/v1/office/rooms/:roomId/leave
GET    /api/v1/users/me/avatar
PUT    /api/v1/users/me/avatar
```

Realtime channels (Centrifugo): `office:room:{encodedRoomId}:presence` and
`office:room:{encodedRoomId}:layout`. Subscription tokens for those channels
are authorised server side.

---

## 2. Frontend — `office-zedu-fe`

- **Branch:** `feature/office-3d-demo`
- **Build command:** `pnpm install --frozen-lockfile && pnpm build`
- **Start command:**

  ```sh
  cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && node .next/standalone/server.js
  ```

  (`next start` also serves the app, but Next warns that it does not support
  `output: standalone`.)

- **Port:** `PORT` (default 3000)

### Environment

```env
# Where the office API lives
NEXT_PUBLIC_BASE_URL=https://api.<your-domain>/api/v1
NEXT_PUBLIC_API_URL=https://api.<your-domain>/api/v1

# The public URL of this deployment (metadata, links, redirects)
NEXT_PUBLIC_CLIENT_URL=https://<your-domain>

# Serve the app from the domain root instead of /mainapp
NEXT_PUBLIC_ASSET_PREFIX=false

# Analytics (the layout always renders these tags)
NEXT_PUBLIC_GTM_SCRIPT_URL=https://www.googletagmanager.com/gtm.js
NEXT_PUBLIC_GA_ID=<ga-measurement-id>

# Media, realtime and the rest of the app
NEXT_PUBLIC_MEDIA_URL=https://media.zedu.chat
NEXT_PUBLIC_CONNECT_URL=wss://<centrifugo-host>/connection/websocket
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_APPLE_CLIENT_ID=...
NEXT_PUBLIC_AGORA_APP_ID=...
NEXT_PUBLIC_ONESIGNAL_APP_ID=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
NEXT_PUBLIC_VAPID_PRIVATE_KEY=...

# Server only
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...

# Zoe in the office (optional — the office still works without it)
CONTRIBUTOR_HELPER_URL=https://<contributor-helper>
ZOE_SERVICE_TOKEN=<service-token>
```

> `NEXT_PUBLIC_ASSET_PREFIX` is read at **build time**. Changing it means a
> rebuild. The office itself is not behind a flag: the **Office** icon is in
> the left rail and `/{org}/office` is always available.

> `NEXT_PUBLIC_ASSET_PREFIX` is a new line in `next.config.mjs`, which is a
> protected file. It keeps `/mainapp` as the default, so the existing hosting
> is unaffected — but the PR needs the `config-change-approved` label.

---

## 3. Order of operations

1. Deploy the **backend** first and confirm `GET /api/v1/office/bootstrap`
   answers with an organisation's rooms.
2. Deploy the **frontend** with `NEXT_PUBLIC_BASE_URL` pointing at it.
3. Open an organisation and click the **Office** icon in the left rail.

## 4. Smoke test

1. Sign in, pick an organisation.
2. The **Office** icon is in the left rail → the building opens with the
   organisation's real channels, direct messages and people.
3. Walk into a channel room: the chat panel shows the real conversation.
4. Press **B** in your own office, pick a piece, hover the floor until the
   ghost is green, press **P** to place it.
5. Open the standalone demo at `/office` — it works with no backend at all.

## 5. If something is wrong

| Symptom                        | Cause                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Blank page, 404s on `/_next/*` | `NEXT_PUBLIC_ASSET_PREFIX` is still `/mainapp` while the app is served from the root                        |
| "The office could not open"    | The frontend cannot reach `NEXT_PUBLIC_BASE_URL`, or the backend has not run its migration (`MIGRATE=true`) |
| Zoe says she is not configured | `CONTRIBUTOR_HELPER_URL` and `ZOE_SERVICE_TOKEN` are not set on the frontend                                |
