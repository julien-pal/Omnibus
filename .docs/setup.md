# Setup & Configuration

## Requirements

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 20** | For local development only |
| **Docker** | Recommended for production |
| **Prowlarr** | For torrent search ([docs](https://wiki.servarr.com/prowlarr)) |
| Torrent client | One of: qBittorrent, Deluge, Transmission, rTorrent, Aria2 |
| **Speaches** *(optional)* | Whisper API for audio↔ebook sync — [speaches-ai/speaches](https://github.com/speaches-ai/speaches) |

---

## Installation

### Option A — Docker (recommended)

```bash
git clone https://github.com/yourname/omnibus.git
cd omnibus
docker compose up -d
```

Access at **http://localhost:8087**.

### Option B — Local development

```bash
git clone https://github.com/yourname/omnibus.git
cd omnibus
npm install
npm run dev
```

- Frontend: http://localhost:8080  
- Backend API: http://localhost:8686

---

## Docker Compose

### Minimal

```yaml
services:
  omnibus:
    build: .
    ports:
      - "8087:8080"
    volumes:
      - ./config:/app/config
      - /path/to/your/books:/books
    environment:
      - CONFIG_DIR=/app/config
    restart: unless-stopped
```

### With Speaches (GPU transcription)

```yaml
services:
  omnibus:
    build: .
    ports:
      - "8087:8080"
    volumes:
      - ./config:/app/config
      - /path/to/your/books:/books
    environment:
      - CONFIG_DIR=/app/config
    restart: unless-stopped

  speaches:
    image: ghcr.io/speaches-ai/speaches:latest-cuda
    ports:
      - 8000:8000
    volumes:
      - hf-hub-cache:/home/ubuntu/.cache/huggingface/hub
    environment:
      - WHISPER__NUM_WORKERS=4
      - WHISPER__COMPUTE_TYPE=float16
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  hf-hub-cache:
```

For CPU-only transcription replace `latest-cuda` with `latest-cpu`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_DIR` | `<cwd>/config` | Path to config directory (useful for Docker volumes) |
| `PORT` | `8686` | Backend Express port |

See [`backend/.env.example`](../backend/.env.example) for a ready-to-use template.

---

## Configuration Files

All config files live in `./config/` (or `CONFIG_DIR`). They are **auto-created with defaults** on first run — use the Settings UI to edit them.

| File | Description |
|------|-------------|
| `app.json` | Port, auth, rename patterns, Whisper, cron schedules |
| `prowlarr.json` | Prowlarr URL, API key, and cached indexer list |
| `clients.json` | Torrent client connections and download destinations |
| `libraries.json` | Library paths and their type (`ebook`, `audiobook`, `mixed`) |
| `player-progress.json` | Audiobook playback positions |
| `reader-progress.json` | Ebook reading positions (CFI) |

> **Note:** `prowlarr.json` can grow large because it caches all indexer category data. This is normal.

---

## Reverse Proxy

### Nginx

```nginx
server {
    listen 80;
    server_name omnibus.example.com;

    location / {
        proxy_pass http://localhost:8087;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Required for audio streaming (range requests)
        proxy_buffering off;
    }
}
```

### Caddy

```
omnibus.example.com {
    reverse_proxy localhost:8087
}
```

---

## File Organization & Rename Patterns

After a download completes, files are moved to a library path using a template pattern. Available tokens:

| Token | Value |
|-------|-------|
| `{author}` | Author name |
| `{title}` | Book title |
| `{series}` | Series name (falls back to title if empty) |
| `{year}` | Publication year |

**Examples:**

```
{author}/{series}/{title}     → Brandon Sanderson/Stormlight Archive/The Way of Kings
{author}/{title} ({year})     → Brandon Sanderson/The Way of Kings (2010)
{series}/{title}              → Stormlight Archive/The Way of Kings
```

Patterns are configured separately for ebooks and audiobooks in **Settings → General**.

---

## Authentication

Authentication is **disabled by default**. To enable it:

1. Go to **Settings → Authentication**
2. Toggle "Enable authentication"
3. Set a username and password
4. Save — the backend will restart with JWT auth enforced

All API routes (except `/api/auth/*`) will then require a `Bearer` token.
