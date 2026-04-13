import express from 'express';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed, getLibraryStats } from '../scanner/library';
import { enrich, search, fetchByAsin, fetchSeriesBooks, writeBookMeta } from '../services/metadata';
import { BookMetadata, ScannerBook } from '../types';
import { invalidateStatsCache } from './stats';
import { sendEbookToReader } from '../services/email';

const router = express.Router();

function isPathWithinLibraries(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const libConfig = getConfig('libraries');
  const roots = [
    ...(libConfig.ebook || []),
    ...(libConfig.audiobook || []),
    ...(libConfig.mixed || []),
  ].map((l) => path.resolve(l.path));
  return roots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
}

// In-memory scan cache — avoids rescanning large libraries on every page load
const SCAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
interface ScanCacheEntry {
  tree: unknown;
  stats: unknown;
  expiresAt: number;
}
const scanCache = new Map<string, ScanCacheEntry>();

export function invalidateScanCache(libId?: string) {
  if (libId) {
    scanCache.delete(libId);
  } else {
    scanCache.clear();
  }
  invalidateStatsCache();
}

export function setScanCacheEntry(libId: string, tree: unknown, stats: unknown) {
  scanCache.set(libId, { tree, stats, expiresAt: Date.now() + SCAN_CACHE_TTL_MS });
}

// GET /api/library/cover?path=...
router.get('/cover', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  if (!isPathWithinLibraries(filePath)) return res.status(403).json({ error: 'access denied' });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });

  const ext = path.extname(filePath).toLowerCase();
  const mime =
    (
      {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      } as Record<string, string>
    )[ext] || 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Read error' });
  }).pipe(res);
});

// GET /api/library/metadata/search?title=...&author=...&type=audiobook|ebook&provider=audible|openlibrary|googlebooks
router.get('/metadata/search', async (req, res) => {
  const {
    title,
    author,
    type = 'audiobook',
    provider,
  } = req.query as { title?: string; author?: string; type?: string; provider?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const results = await search(title, author, type, provider);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/metadata/asin/:asin
router.get('/metadata/asin/:asin', async (req, res) => {
  try {
    const data = await fetchByAsin(req.params.asin);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/metadata/series?seriesTitle=...&author=...&type=audiobook|ebook
router.get('/metadata/series', async (req, res) => {
  const {
    seriesTitle,
    author,
    type = 'audiobook',
  } = req.query as { seriesTitle?: string; author?: string; type?: string };
  if (!seriesTitle) return res.status(400).json({ error: 'seriesTitle is required' });
  try {
    const books = await fetchSeriesBooks(seriesTitle, author, type);
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/metadata/enrich?title=...&author=...&type=ebook|audiobook
router.get('/metadata/enrich', async (req, res) => {
  const {
    title,
    author,
    type = 'ebook',
  } = req.query as { title?: string; author?: string; type?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const data = await enrich(title, author, type);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/metadata/raw?path=...
router.get('/metadata/raw', (req, res) => {
  const bookPath = req.query.path as string;
  if (!bookPath) return res.status(400).json({ error: 'path is required' });
  const filePath = path.join(bookPath, 'metadata.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No metadata.json found' });
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(raw);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/suggestions — unique authors, series, narrators across all libraries
router.get('/suggestions', (_req, res) => {
  const librariesConfig = getConfig('libraries');
  const authors = new Set<string>();
  const seriesNames = new Set<string>();
  const narrators = new Set<string>();

  function addBook(groupAuthor: string, book: import('../types').ScannerBook) {
    // Author from group (directory structure)
    if (groupAuthor) authors.add(groupAuthor);
    // Author from book itself (may differ from group)
    if (book.author) authors.add(book.author);
    // Fields from saved metadata (most reliable)
    const m = book.savedMeta;
    if (!m) return;
    if (m.author && typeof m.author === 'string') authors.add(m.author);
    if (m.narrator && typeof m.narrator === 'string') narrators.add(m.narrator);
    if (m.series && typeof m.series === 'string') {
      const name = m.series.replace(/\s+#\d+(\.\d+)?$/, '').trim();
      if (name) seriesNames.add(name);
    }
  }

  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[type] || []) {
      try {
        const tree = type === 'mixed' ? scanLibraryMixed(lib.path) : scanLibrary(lib.path, type);
        for (const group of tree) {
          for (const book of group.books || []) {
            addBook(group.author, book);
          }
        }
      } catch {
        /* skip unavailable library */
      }
    }
  }

  res.json({
    authors: [...authors].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    series: [...seriesNames].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    narrators: [...narrators].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  });
});

// GET /api/library — list all configured libraries with stats
router.get('/', (_req, res) => {
  const librariesConfig = getConfig('libraries');
  const result: Record<string, unknown[]> = { ebook: [], audiobook: [], mixed: [] };

  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[type] || []) {
      // Reuse stats from scan cache if available to avoid a full disk scan
      const cached = scanCache.get(lib.id);
      const stats =
        cached && Date.now() < cached.expiresAt
          ? cached.stats
          : getLibraryStats(lib.path, type);
      result[type].push({ ...lib, type, stats });
    }
  }

  res.json(result);
});

// GET /api/library/read-later — list all books marked as read-later across all libraries
router.get('/read-later', (_req, res) => {
  const librariesConfig = getConfig('libraries');
  const results: ScannerBook[] = [];

  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[type] || []) {
      try {
        const tree =
          type === 'mixed' ? scanLibraryMixed(lib.path) : scanLibrary(lib.path, type);
        for (const group of tree) {
          for (const book of group.books) {
            if (book.savedMeta?.readLater === true) {
              const sm = book.savedMeta;
              results.push({
                ...book,
                title: sm.title || book.title,
                author: sm.author || book.author || group.author,
                ...(typeof sm.series === 'string' && sm.series ? { series: sm.series } : {}),
              });
            }
          }
        }
      } catch {
        /* skip unavailable library */
      }
    }
  }

  res.json(results);
});

// GET /api/library/:id/scan
router.get('/:id/scan', (req, res) => {
  const librariesConfig = getConfig('libraries');
  let library = null;
  let type: string | null = null;

  for (const t of ['ebook', 'audiobook', 'mixed'] as const) {
    const found = (librariesConfig[t] || []).find((l) => l.id === req.params.id);
    if (found) {
      library = found;
      type = t;
      break;
    }
  }

  if (!library || !type) return res.status(404).json({ error: 'Library not found' });

  try {
    const stats = getLibraryStats(library.path, type);
    const tree =
      type === 'mixed'
        ? scanLibraryMixed(library.path)
        : scanLibrary(library.path, type as 'ebook' | 'audiobook');
    // Refresh cache on explicit scan
    setScanCacheEntry(req.params.id, tree, stats);
    res.json({ library: { ...library, type }, tree, stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/library/:id
router.get('/:id', (req, res) => {
  const librariesConfig = getConfig('libraries');
  let library = null;
  let type: string | null = null;

  for (const t of ['ebook', 'audiobook', 'mixed'] as const) {
    const found = (librariesConfig[t] || []).find((l) => l.id === req.params.id);
    if (found) {
      library = found;
      type = t;
      break;
    }
  }

  if (!library || !type) return res.status(404).json({ error: 'Library not found' });

  // Return from cache if still fresh
  const cached = scanCache.get(req.params.id);
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ library: { ...library, type }, tree: cached.tree, stats: cached.stats });
  }

  try {
    const stats = getLibraryStats(library.path, type);
    const tree =
      type === 'mixed'
        ? scanLibraryMixed(library.path)
        : scanLibrary(library.path, type as 'ebook' | 'audiobook');
    scanCache.set(req.params.id, { tree, stats, expiresAt: Date.now() + SCAN_CACHE_TTL_MS });
    res.json({ library: { ...library, type }, tree, stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/library/wishlist
router.post('/wishlist', express.json(), async (req, res) => {
  const { libraryId, metadata } = req.body as {
    libraryId?: string;
    metadata?: Partial<BookMetadata> & { seriesTitle?: string };
  };
  if (!libraryId || !metadata?.title) {
    return res.status(400).json({ error: 'libraryId and metadata.title are required' });
  }

  const librariesConfig = getConfig('libraries');
  let library = null;
  for (const t of ['ebook', 'audiobook', 'mixed'] as const) {
    const found = (librariesConfig[t] || []).find((l) => l.id === libraryId);
    if (found) {
      library = found;
      break;
    }
  }
  if (!library) return res.status(404).json({ error: 'Library not found' });

  function sanitize(s: string | undefined): string {
    return (s || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .trim()
      .slice(0, 100);
  }

  const author = sanitize(metadata.author as string | undefined);
  const seriesTitle = sanitize(metadata.seriesTitle || '');
  const title = sanitize(metadata.title);

  if (!title) return res.status(400).json({ error: 'Could not build a valid directory name' });

  const segments = [author, seriesTitle, title].filter(Boolean);
  const bookPath = path.join(library.path, ...segments);
  if (!fs.existsSync(bookPath)) fs.mkdirSync(bookPath, { recursive: true });

  const saved = writeBookMeta(bookPath, {
    ...(metadata as Record<string, unknown>),
    wishlist: true,
  });
  invalidateScanCache();
  res.json({ path: bookPath, ...saved });
});

// PUT /api/library/metadata/book
router.put('/metadata/book', express.json(), async (req, res) => {
  const { path: bookPath, ...fields } = req.body as { path?: string } & Record<string, unknown>;
  if (!bookPath) return res.status(400).json({ error: 'path is required' });
  if (!isPathWithinLibraries(bookPath)) return res.status(403).json({ error: 'access denied' });
  try {
    const existing = (() => {
      try {
        const p = path.join(bookPath, 'metadata.json');
        return fs.existsSync(p)
          ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })();
    const merged: Record<string, unknown> = {
      ...existing,
      ...fields,
    };
    const saved = writeBookMeta(bookPath, merged);
    invalidateScanCache();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/library/book
router.delete('/book', express.json(), (req, res) => {
  const {
    path: bookPath,
    paths,
    deleteFiles,
  } = req.body as { path?: string; paths?: string[]; deleteFiles?: boolean };
  const targets = Array.isArray(paths) ? paths : bookPath ? [bookPath] : [];
  if (!targets.length) return res.status(400).json({ error: 'path or paths is required' });

  for (const p of targets) {
    if (!isPathWithinLibraries(p)) return res.status(403).json({ error: 'access denied' });
    if (!fs.existsSync(p)) continue;
    if (deleteFiles) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      const metaFile = path.join(p, 'metadata.json');
      if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
      try {
        const remaining = fs.readdirSync(p);
        if (remaining.length === 0) fs.rmdirSync(p);
      } catch {
        /* ignore */
      }
    }
  }

  invalidateScanCache();
  res.json({ ok: true });
});

const EBOOK_EXTS = new Set(['.epub', '.mobi', '.azw3', '.pdf']);

// POST /api/library/send-to-reader
router.post('/send-to-reader', express.json(), async (req, res) => {
  const { bookPath } = req.body as { bookPath?: string };
  if (!bookPath) return res.status(400).json({ error: 'bookPath is required' });

  const ext = path.extname(bookPath).toLowerCase();
  if (!EBOOK_EXTS.has(ext)) return res.status(400).json({ error: 'unsupported file type' });

  if (!isPathWithinLibraries(bookPath)) return res.status(403).json({ error: 'access denied' });

  const config = getConfig('app');
  const emailConfig = config.emailConfig;
  if (!emailConfig?.smtpHost || !emailConfig?.readerEmail) {
    return res.status(503).json({ error: 'Email not configured' });
  }

  if (!fs.existsSync(bookPath)) return res.status(404).json({ error: 'file not found' });

  try {
    await sendEbookToReader(emailConfig, bookPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
