# Contributing

Contributions are welcome — bug fixes, new torrent client adapters, metadata providers, UI improvements, translations, and documentation are all appreciated.

---

## Getting Started

```bash
git clone https://github.com/yourname/omnibus.git
cd omnibus
npm install
npm run dev
```

- Frontend hot-reload: http://localhost:8080
- Backend (ts-node + nodemon): http://localhost:8686

---

## Workflow

1. **Open an issue** first for anything non-trivial (new feature, breaking change, refactor)
2. Fork the repository and create a branch:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/issue-123
   ```
3. Make your changes — see the guidelines below
4. Open a pull request against `main` with a clear description

---

## Code Guidelines

### General
- TypeScript everywhere — no `any` unless genuinely necessary
- Keep commits focused; one logical change per commit
- No new dependencies without discussion

### Backend
- New routes go in `backend/src/routes/`
- Business logic belongs in `backend/src/services/`, not in route handlers
- Use the existing `logger` (`backend/src/lib/logger.ts`) — no `console.log`
- Config is read/written via `getConfig` / `saveConfig` only — never direct `fs` reads of config files

### Frontend
- Components in `frontend/src/components/`; page-level components in `frontend/src/app/`
- Server state → TanStack Query; client-only state → Zustand
- New user-facing strings must be added to both `fr` and `en` in `frontend/src/i18n/index.ts`
- Tailwind only for styling — no inline styles except for dynamic values

### Adding a torrent client

1. Create `backend/src/services/torrent/<client>.ts` implementing the `TorrentClient` interface from `backend/src/services/torrent/index.ts`
2. Register it in the client factory in `torrent/index.ts`
3. Add the client type string to the frontend settings UI (`SettingsTabs/ClientSettings.tsx`)

### Adding a metadata provider

1. Add a search function in `backend/src/services/metadata.ts` following the pattern of `searchGoogleBooks`
2. Export it through the `search()` function with a new `provider` string
3. Add the provider to `PROVIDERS` in `frontend/src/components/MetadataPickerModal.tsx`

---

## Project Areas

| Area | Entry point |
|------|-------------|
| Library scanning | `backend/src/scanner/library.ts` |
| Metadata enrichment | `backend/src/services/metadata.ts` |
| File organizer | `backend/src/services/organizer.ts` |
| Download queue | `backend/src/services/downloader.ts` |
| Audio↔ebook sync | `backend/src/services/syncCompute.ts` |
| Audiobook player (frontend) | `frontend/src/components/PlayerBar.tsx` |
| Ebook reader (frontend) | `frontend/src/components/ReaderModal.tsx` |
| i18n strings | `frontend/src/i18n/index.ts` |

---

## Reporting Bugs

Please include:
- Steps to reproduce
- Expected vs actual behaviour
- Backend logs (check `logs/` or Docker container output)
- Browser console errors if it's a frontend issue
- Node.js version and OS (or Docker image tag)
