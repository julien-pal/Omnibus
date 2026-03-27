import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  getProgress,
  saveProgress,
  getAllProgress,
  ReaderProgressEntry,
} from '../services/readerProgress';
import { getProgress as getPlayerProgress } from '../services/playerProgress';
import { getTextAtCfi } from '../services/epubText';
import { getConfig } from '../config/manager';
import logger from '../lib/logger';
const router = Router();

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

const ALLOWED_EXTS = ['.epub', '.pdf', '.mobi', '.azw3', '.cbz', '.cbr'];

const MIME: Record<string, string> = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.cbz': 'application/vnd.comicbook+zip',
  '.cbr': 'application/vnd.comicbook-rar',
};

// GET /api/reader/file?path=<filepath>
router.get('/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'path required' });

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) return res.status(400).json({ error: 'unsupported file type' });
  if (!isPathWithinLibraries(filePath)) return res.status(403).json({ error: 'access denied' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file not found' });

  const stat = fs.statSync(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');

  const range = req.headers.range;
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /api/reader/progress/all
router.get('/progress/all', (_req, res) => {
  res.json(getAllProgress());
});

// GET /api/reader/progress?bookPath=<bookPath>
router.get('/progress', (req, res) => {
  const bookPath = req.query.bookPath as string;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });
  res.json(getProgress(bookPath));
});

// PATCH /api/reader/progress
router.patch('/progress', (req, res) => {
  const { bookPath, cfi, page, chapterTitle, percentage, updatedAt, epubPath } = req.body;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });
  const existing = getProgress(bookPath);
  let snippet: string | undefined;
  if (epubPath && cfi) {
    try {
      snippet = getTextAtCfi(epubPath, cfi, 300);
    } catch {
      /* ignore */
    }
  }
  const entry: ReaderProgressEntry = {
    ...existing,
    ...(cfi !== undefined && { cfi }),
    ...(page !== undefined && { page }),
    ...(chapterTitle !== undefined && { chapterTitle }),
    ...(snippet !== undefined && { snippet }),
    percentage: percentage ?? existing?.percentage ?? 0,
    updatedAt: updatedAt ?? Date.now(),
  };
  saveProgress(bookPath, entry);
  const audio = getPlayerProgress(bookPath);
  const bookName = require('path').basename(bookPath);
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR');
  logger.info(
    `[progress] ${bookName} | ebook ${(entry.percentage * 100).toFixed(1)}% (${fmt(entry.updatedAt)})${entry.chapterTitle ? ` "${entry.chapterTitle}"` : ''} | audio ${audio ? `${((audio.percentage ?? 0) * 100).toFixed(1)}% (${fmt(audio.updatedAt)})${audio.chapterTitle ? ` "${audio.chapterTitle}"` : ''}` : 'n/a'}`,
  );
  res.json(entry);
});

// POST /api/reader/complete
router.post('/complete', (req, res) => {
  const { bookPath } = req.body;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });
  const entry: ReaderProgressEntry = { percentage: 1, completed: true, updatedAt: Date.now() };
  saveProgress(bookPath, entry);
  res.json(entry);
});

export default router;
