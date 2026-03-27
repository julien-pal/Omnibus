# Architecture & Tech Stack

## Overview

Omnibus is a monorepo with two workspaces — a Node.js/Express backend and a Next.js frontend — running in the same Docker container in production.

```
Browser → Next.js :8080
              ├── Static pages & components (SSR/CSR)
              └── /api/* rewrite → Express :8686
                      ├── Library scanner
                      ├── Torrent clients
                      ├── Metadata providers
                      └── Whisper (external)
```

---

## Tech Stack

### Backend

| Library | Role |
|---------|------|
| Node.js ≥ 20 | Runtime |
| Express 4 + TypeScript | HTTP server & routing |
| `bcryptjs` + `jsonwebtoken` | Optional JWT authentication |
| `axios` | Calls to Audible, Google Books, Open Library, Audnexus, Whisper |
| `epub-cfi-resolver` | CFI parsing for ebook sync |
| `adm-zip` | ZIP/EPUB extraction |
| `chokidar` | Filesystem watching for import polling |
| `node-cron` | Cron job scheduling |

### Frontend

| Library | Role |
|---------|------|
| Next.js 15 (App Router) | Framework — standalone build for Docker |
| React 18 + TypeScript | UI |
| Tailwind CSS | Styling |
| TanStack Query v5 | Server state, caching, background refetch |
| Zustand | Client state (player, reader, toasts, locale) |
| epub.js | In-browser EPUB rendering |
| Lucide React | Icons |

---

## Project Structure

```
omnibus/
├── backend/
│   ├── src/
│   │   ├── config/        # Config manager (read/write JSON), defaults
│   │   ├── lib/           # Logger (console + file)
│   │   ├── middleware/    # JWT auth middleware
│   │   ├── routes/        # Express routers (library, player, reader, sync…)
│   │   ├── scanner/       # Filesystem scanner — builds book tree from dirs
│   │   ├── services/      # Business logic:
│   │   │   ├── metadata.ts       # Audible / Google / OpenLibrary / Audnexus
│   │   │   ├── organizer.ts      # File move/copy with rename patterns
│   │   │   ├── downloader.ts     # Download queue + import polling
│   │   │   ├── playerProgress.ts # Read/write playback positions
│   │   │   ├── readerProgress.ts # Read/write ebook positions (CFI)
│   │   │   ├── syncCompute.ts    # Audio↔ebook alignment algorithms
│   │   │   ├── whisperClient.ts  # Speaches/Whisper API client
│   │   │   ├── wishlistCron.ts   # Wishlist auto-download cron
│   │   │   ├── transcriptCron.ts # Transcript generation cron
│   │   │   └── torrent/          # Torrent client adapters
│   │   │       ├── index.ts
│   │   │       ├── qbittorrent.ts
│   │   │       ├── deluge.ts
│   │   │       ├── transmission.ts
│   │   │       ├── rtorrent.ts
│   │   │       └── aria2.ts
│   │   ├── types/         # Shared TypeScript interfaces
│   │   └── index.ts       # Server entry — boot, middleware, routes, static
│   ├── config/            # Runtime JSON config (gitignored)
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── app/           # Next.js App Router
│       │   ├── (app)/     # Authenticated layout group
│       │   │   ├── page.tsx          # Library
│       │   │   ├── search/           # Torrent + catalogue search
│       │   │   ├── downloads/        # Download queue + crons
│       │   │   └── settings/         # Settings tabs
│       │   └── login/     # Login page
│       ├── components/    # Shared UI components
│       │   └── library/   # Library-specific cards and rows
│       │   └── SettingsTabs/
│       ├── hooks/         # Custom React hooks
│       ├── i18n/          # FR/EN translation strings
│       ├── lib/           # Pure utilities (libraryUtils, chapterMatch…)
│       ├── store/         # Zustand stores (player, reader, toasts, sync prefs)
│       ├── api/           # Axios client (base URL, interceptors)
│       └── types.ts       # Frontend type definitions
│
├── docs/                  # ← you are here
├── Dockerfile             # 3-stage build (backend, frontend, production)
├── docker-compose.yml
├── start.sh               # Container entrypoint (starts both processes)
├── .dockerignore
└── package.json           # Workspace root
```

---

## Data Flow

### Book import

```
Torrent client completes download
        ↓
Downloader polling detects "done" status
        ↓
organizer.ts copies file to library path (rename pattern applied)
        ↓
metadata.ts enriches with Audible / Google / OpenLibrary
        ↓
metadata.json written to book directory
```

### Library scan

```
GET /api/library/:id
        ↓
scanner/library.ts walks directory tree
        ↓
Each subdirectory → ScannerBook { files, cover, savedMeta }
        ↓
Grouped by author → ScannerAuthorGroup[]
```

### Audio ↔ Ebook sync

```
User triggers sync
        ↓
syncCompute.ts loads transcript (JSON word timings from Whisper)
        ↓
Alignment: audio position → word index → ebook CFI
        ↓  (or reverse)
Result sent to frontend, user confirms or ignores
```

---

## Config System

Config is managed by `backend/src/config/manager.ts`:

- **Read**: `getConfig(name)` — reads `<CONFIG_DIR>/<name>.json`, falls back to defaults
- **Write**: `saveConfig(name, data)` — writes atomically  
- **Init**: `initializeConfigs()` — called at boot, creates missing files from defaults
- **Override**: set `CONFIG_DIR` env var to point to a Docker volume

Defaults live in `backend/src/config/defaults.ts` and are type-safe via `ConfigMap`.
