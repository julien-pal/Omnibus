# API Reference

All endpoints are prefixed with `/api`.  
Authentication (when enabled) requires a `Bearer` JWT token obtained from `POST /api/auth/login`.

---

## Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Obtain a JWT token |
| `GET` | `/api/auth/me` | Check current session / auth status |
| `POST` | `/api/auth/logout` | Invalidate session |

---

## Library

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/library` | List all configured libraries |
| `GET` | `/api/library/:id` | Scan and return books in a library |
| `GET` | `/api/library/:id/scan` | Trigger a rescan |
| `GET` | `/api/library/cover` | Proxy a cover image by path |
| `GET` | `/api/library/suggestions` | Authors, series, narrators autocomplete |
| `GET` | `/api/library/metadata/search` | Search metadata (Audible / Google Books / Open Library) |
| `GET` | `/api/library/metadata/enrich` | Auto-enrich a single book |
| `PUT` | `/api/library/metadata/book` | Save metadata to `metadata.json` |
| `POST` | `/api/library/wishlist` | Add a book to the wishlist |
| `DELETE` | `/api/library/book` | Delete a book (optionally with files) |

### Metadata search providers

Pass `provider` as a query parameter to `/api/library/metadata/search`:

| Value | Source |
|-------|--------|
| *(omitted)* | Auto (Audible EN+FR, then fallback) |
| `audible` | Audible catalog (FR + EN merged) |
| `googlebooks` | Google Books |
| `openlibrary` | Open Library |

---

## Player

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/player/stream?path=` | Stream an audio file (HTTP range supported) |
| `GET` | `/api/player/download?path=` | Download an audio file |
| `GET` | `/api/player/chapters?path=` | Extract chapters from a file |
| `GET` | `/api/player/progress?bookPath=` | Get playback position for a book |
| `GET` | `/api/player/progress/all` | Get all playback positions |
| `PATCH` | `/api/player/progress` | Save playback position |
| `POST` | `/api/player/complete` | Mark audiobook as complete (100%) |

### `PATCH /api/player/progress` body

```json
{
  "bookPath": "/path/to/book",
  "position": 3600.5,
  "fileIndex": 0,
  "percentage": 0.42,
  "chapterTitle": "Chapter 3"
}
```

---

## Reader

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reader/file?path=` | Serve an ebook file (EPUB/PDF) |
| `GET` | `/api/reader/progress?bookPath=` | Get reading position for a book |
| `GET` | `/api/reader/progress/all` | Get all reading positions |
| `PATCH` | `/api/reader/progress` | Save reading position (CFI-based) |
| `POST` | `/api/reader/complete` | Mark ebook as complete (100%) |

### `PATCH /api/reader/progress` body

```json
{
  "bookPath": "/path/to/book",
  "cfi": "epubcfi(/6/4[chap01]!/4/2/1:0)",
  "percentage": 0.18,
  "chapterTitle": "Chapter 2"
}
```

---

## Sync (Audio ↔ Ebook)

> Requires a Whisper-compatible API (e.g. [Speaches](https://github.com/speaches-ai/speaches)) configured in Settings.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/audio-to-ebook` | Get ebook CFI from audio position |
| `POST` | `/api/sync/ebook-to-audio` | Get audio timestamp from ebook CFI |
| `POST` | `/api/sync/build-transcript` | Start Whisper transcription for a book |
| `POST` | `/api/sync/build-sync-map` | Build word-level sync map |
| `GET` | `/api/sync/transcript-status?bookPath=` | Poll transcription status |
| `GET` | `/api/sync/transcript-progress?bookPath=` | Per-file transcription progress |
| `GET` | `/api/sync/whisper-models` | List available Whisper models |
| `POST` | `/api/sync/whisper-models` | Pull/download a Whisper model |
| `GET` | `/api/sync/active-builds` | List ongoing transcript builds |

---

## Search & Downloads

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search` | Search Prowlarr indexers |
| `GET` | `/api/downloads` | List active/recent downloads |
| `POST` | `/api/downloads` | Add a new download (magnet or torrent) |
| `DELETE` | `/api/downloads/:id` | Remove a download entry |

---

## Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Save settings (full replace) |
| `GET` | `/api/settings/browse?path=` | Browse filesystem (for path pickers) |
