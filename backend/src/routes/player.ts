import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { extractChapters } from '../services/chapters';
import { getProgress, getAllProgress, saveProgress } from '../services/playerProgress';
import { getProgress as getReaderProgress } from '../services/readerProgress';
import { hasTranscript, loadTranscript, flattenTranscriptWords } from '../services/syncCompute';
import authMiddleware from '../middleware/auth';
import logger from '../lib/logger';
const router = Router();
router.use(authMiddleware);

const AUDIO_EXTS = new Set(['m4b', 'mp3', 'flac', 'opus', 'ogg', 'aac', 'm4a']);
const AUDIO_MIME: Record<string, string> = {
  m4b: 'audio/mp4',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  opus: 'audio/ogg; codecs=opus',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
};

function validateAudioPath(filePath: string): string | null {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!AUDIO_EXTS.has(ext)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

// GET /api/player/stream?path=<absolute-file-path>
router.get('/stream', (req, res) => {
  const filePath = validateAudioPath(req.query.path as string);
  if (!filePath) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeType = AUDIO_MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /api/player/download?path=<absolute-file-path>
router.get('/download', (req, res) => {
  const filePath = validateAudioPath(req.query.path as string);
  if (!filePath) return res.status(404).json({ error: 'File not found' });
  const filename = path.basename(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// GET /api/player/chapters?path=<absolute-file-path>
router.get('/chapters', async (req, res) => {
  const filePath = validateAudioPath(req.query.path as string);
  if (!filePath) return res.status(404).json({ error: 'File not found' });
  const chapters = await extractChapters(filePath);
  res.json(chapters);
});

// GET /api/player/progress/all
router.get('/progress/all', (_req, res) => {
  res.json(getAllProgress());
});

// GET /api/player/progress?bookPath=<book-dir-path>
router.get('/progress', (req, res) => {
  const bookPath = req.query.bookPath as string;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });
  const progress = getProgress(bookPath);
  res.json(progress);
});

// POST /api/player/complete
router.post('/complete', (req, res) => {
  const { bookPath } = req.body;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });
  const entry = {
    position: 0,
    fileIndex: 0,
    percentage: 1,
    completed: true,
    updatedAt: Date.now(),
  };
  saveProgress(bookPath, entry);
  res.json(entry);
});

// PATCH /api/player/progress
router.patch('/progress', (req, res) => {
  const { bookPath, position, fileIndex, percentage, chapterTitle, updatedAt } = req.body;
  if (!bookPath) return res.status(400).json({ error: 'bookPath required' });

  // Allow timestamp-only update (e.g. to align timestamps after cross-format sync)
  if (position === undefined && fileIndex === undefined) {
    const existing = getProgress(bookPath);
    if (!existing) return res.status(404).json({ error: 'No progress found for this book' });
    const entry = { ...existing, updatedAt: updatedAt != null ? Number(updatedAt) : Date.now() };
    saveProgress(bookPath, entry);
    res.json(entry);
    return;
  }

  if (position === undefined || fileIndex === undefined) {
    return res.status(400).json({ error: 'bookPath, position, fileIndex required' });
  }
  // Pre-compute transcript snippet for sync popup display
  let snippet: string | undefined;
  if (hasTranscript(bookPath)) {
    try {
      const transcript = loadTranscript(bookPath);
      const allWords = transcript ? flattenTranscriptWords(transcript) : [];
      if (allWords.length > 0 && transcript) {
        const fileNames = Object.keys(transcript.files);
        const fileName = fileNames[Number(fileIndex)];
        const fileWords = fileName ? (transcript.files[fileName] ?? []) : [];
        const fileStartGlobal = fileWords.length > 0 ? fileWords[0].globalStart : 0;
        const targetSeconds = fileStartGlobal + Number(position);
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < allWords.length; i++) {
          const diff = Math.abs(allWords[i].globalStart - targetSeconds);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        const wordStart = Math.max(0, closestIdx - 1);
        const wordEnd = Math.min(allWords.length, closestIdx + 15);
        snippet = allWords
          .slice(wordStart, wordEnd)
          .map((w: { text: string }) => w.text)
          .join(' ');
      }
    } catch {
      /* ignore */
    }
  }
  const entry = {
    position: Number(position),
    fileIndex: Number(fileIndex),
    percentage: Number(percentage) || 0,
    ...(chapterTitle !== undefined && { chapterTitle }),
    ...(snippet !== undefined && { snippet }),
    updatedAt: updatedAt != null ? Number(updatedAt) : Date.now(),
  };
  saveProgress(bookPath, entry);
  const reader = getReaderProgress(bookPath);
  const bookName = path.basename(bookPath);
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString('fr-FR');
  logger.info(
    `[progress] ${bookName} | audio ${(entry.percentage * 100).toFixed(1)}% (${fmt(entry.updatedAt)})${entry.chapterTitle ? ` "${entry.chapterTitle}"` : ''} | ebook ${reader ? `${(reader.percentage * 100).toFixed(1)}% (${fmt(reader.updatedAt)})${reader.chapterTitle ? ` "${reader.chapterTitle}"` : ''}` : 'n/a'}`,
  );
  res.json(entry);
});

export default router;
