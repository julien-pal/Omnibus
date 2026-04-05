import express from 'express';
import axios from 'axios';
import { getConfig } from '../config/manager';
import { getProgress as getReaderProgress } from '../services/readerProgress';
import { getProgress as getPlayerProgress } from '../services/playerProgress';
import {
  computeAudioToEbook,
  computeEbookToAudio,
  computeTranscriptToEbook,
  buildTranscript,
  buildSyncMap,
  lookupSyncMap,
  hasTranscript,
  loadTranscript,
  flattenTranscriptWords,
  isBuildInProgress,
  getBuildProgress,
  getBuildError,
  clearBuildError,
  getActiveBuilds,
} from '../services/syncCompute';
import { getTextAtCfi, extractEpubText, getTextAtPercentage } from '../services/epubText';
import fs from 'fs';
import path from 'path';
import logger from '../lib/logger';
const router = express.Router();

/** Scan a book directory for the first .epub file. */
function findEpubInBookPath(bookPath: string): string | null {
  try {
    const entries = fs.readdirSync(bookPath);
    const epub = entries.find((f) => f.toLowerCase().endsWith('.epub'));
    return epub ? path.join(bookPath, epub) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/sync/audio-to-ebook
 * Body: { audioFilePath, audioSeconds, epubPath }
 * Returns: SyncResult
 */
router.post('/audio-to-ebook', async (req, res) => {
  const { audioFilePath, audioSeconds, epubPath } = req.body as {
    audioFilePath: string;
    audioSeconds: number;
    epubPath: string;
  };

  if (!audioFilePath || audioSeconds == null || !epubPath) {
    res.status(400).json({ error: 'audioFilePath, audioSeconds, epubPath are required' });
    return;
  }

  const config = getConfig('app');
  if (!config.whisper?.baseUrl) {
    res.status(503).json({ error: 'Whisper not configured' });
    return;
  }

  const result = await computeAudioToEbook(audioFilePath, audioSeconds, epubPath, config.whisper);
  res.json(result);
});

/**
 * POST /api/sync/ebook-to-audio
 * Body: { epubPath, ebookPct, bookPath, audioFiles: [{path}] }
 * Returns: SyncResult
 */
router.post('/ebook-to-audio', async (req, res) => {
  const {
    epubPath: epubPathBody,
    ebookPct,
    bookPath,
    cfi,
    audioFiles,
  } = req.body as {
    epubPath?: string;
    ebookPct: number;
    bookPath: string;
    cfi?: string;
    audioFiles?: Array<{ path: string }>;
  };

  if (!bookPath) {
    res.status(400).json({ error: 'bookPath is required' });
    return;
  }

  if (!hasTranscript(bookPath)) {
    res.status(404).json({ error: 'No transcript available. Build it first.' });
    return;
  }

  // Auto-detect epub from book directory if not explicitly provided
  const epubPath = epubPathBody || findEpubInBookPath(bookPath);
  if (!epubPath) {
    res.status(404).json({ error: 'No epub file found in book directory' });
    return;
  }

  const readerProg = getReaderProgress(bookPath);
  const effectiveCfi = cfi ?? readerProg?.cfi;
  logger.info(
    `[sync:e→t] trigger — ebook ${(ebookPct * 100).toFixed(1)}% | cfi: ${effectiveCfi ?? 'n/a'} | chapter: "${readerProg?.chapterTitle ?? 'n/a'}"`,
  );

  const result = await computeEbookToAudio(epubPath, ebookPct, bookPath, effectiveCfi, readerProg?.snippet, audioFiles);
  res.json(result);
});

/**
 * POST /api/sync/transcript-to-ebook
 * Body: { bookPath, audioPct, epubPath, minScore? }
 * Returns: SyncResult — uses pre-built transcript, no live transcription.
 */
router.post('/transcript-to-ebook', (req, res) => {
  const {
    bookPath,
    audioPct,
    epubPath,
    minScore,
    hintPct,
    searchWindow,
    audioFileIndex,
    audioSeconds,
  } = req.body as {
    bookPath: string;
    audioPct: number;
    epubPath: string;
    minScore?: number;
    hintPct?: number;
    searchWindow?: number;
    audioFileIndex?: number;
    audioSeconds?: number;
  };

  if (!bookPath || audioPct == null || !epubPath) {
    res.status(400).json({ error: 'bookPath, audioPct, epubPath are required' });
    return;
  }

  if (!hasTranscript(bookPath)) {
    res.status(404).json({ error: 'No transcript available. Build it first.' });
    return;
  }

  const playerProg = getPlayerProgress(bookPath);
  logger.info(
    `[sync:t→e] trigger — audio ${(audioPct * 100).toFixed(1)}% | file: ${playerProg?.fileIndex ?? 'n/a'} @${playerProg?.position?.toFixed(1) ?? 'n/a'}s | chapter: "${playerProg?.chapterTitle ?? 'n/a'}"`,
  );

  try {
    const result = computeTranscriptToEbook(
      bookPath,
      audioPct,
      epubPath,
      minScore ?? 0.8,
      hintPct,
      searchWindow,
      audioFileIndex,
      audioSeconds,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/sync/build-transcript
 * Body: { bookPath, audioFiles: [{path}], epubPath? }
 * Starts background transcript build (fire-and-forget).
 */
router.post('/build-transcript', (req, res) => {
  const { bookPath, audioFiles, epubPath } = req.body as {
    bookPath: string;
    audioFiles: Array<{ path: string }>;
    epubPath?: string;
  };

  if (!bookPath || !Array.isArray(audioFiles) || audioFiles.length === 0) {
    res.status(400).json({ error: 'bookPath and audioFiles are required' });
    return;
  }

  const config = getConfig('app');
  if (!config.whisper?.baseUrl) {
    res.status(503).json({ error: 'Whisper not configured' });
    return;
  }

  if (isBuildInProgress(bookPath)) {
    res.json({ status: 'in_progress' });
    return;
  }

  // Fire and forget — epubPath enables sync map build after transcript
  buildTranscript(bookPath, audioFiles, config.whisper, epubPath).catch((err) => {
    logger.error('[sync] buildTranscript error:', err);
  });

  res.json({ status: 'started' });
});

/**
 * POST /api/sync/build-sync-map
 * Body: { bookPath, epubPath }
 * Builds (or rebuilds) the sync map from an existing transcript.
 */
router.post('/build-sync-map', (req, res) => {
  const { bookPath, epubPath } = req.body as { bookPath: string; epubPath: string };
  if (!bookPath || !epubPath) {
    res.status(400).json({ error: 'bookPath and epubPath are required' });
    return;
  }
  if (!hasTranscript(bookPath)) {
    res.status(404).json({ error: 'No transcript available. Build it first.' });
    return;
  }
  try {
    const entries = buildSyncMap(bookPath, epubPath);
    res.json({ entries: entries.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/sync/lookup?bookPath=...&direction=audio-to-ebook|ebook-to-audio&value=0.5
 * Fast sync map lookup — returns interpolated position.
 */
router.get('/lookup', (req, res) => {
  const { bookPath, direction, value } = req.query as {
    bookPath: string;
    direction: 'audio-to-ebook' | 'ebook-to-audio';
    value: string;
  };
  if (!bookPath || !direction || !value) {
    res.status(400).json({ error: 'bookPath, direction, value are required' });
    return;
  }
  const result = lookupSyncMap(bookPath, direction, parseFloat(value));
  res.json(result);
});

/**
 * GET /api/sync/transcript-status?bookPath=...
 */
router.get('/transcript-status', (req, res) => {
  const { bookPath } = req.query as { bookPath: string };
  if (!bookPath) {
    res.status(400).json({ error: 'bookPath is required' });
    return;
  }

  if (isBuildInProgress(bookPath)) {
    res.json({ status: 'building' });
    return;
  }

  const err = getBuildError(bookPath);
  if (err) {
    clearBuildError(bookPath);
    res.json({ status: 'error', error: err });
    return;
  }

  if (hasTranscript(bookPath)) {
    res.json({ status: 'ready' });
    return;
  }

  res.json({ status: 'none' });
});

/**
 * GET /api/sync/transcript?bookPath=...
 * Returns the full transcript file (segments + syncMap) for client-side offline sync.
 */
router.get('/transcript', (req, res) => {
  const { bookPath } = req.query as { bookPath: string };
  if (!bookPath) {
    res.status(400).json({ error: 'bookPath is required' });
    return;
  }
  const transcript = loadTranscript(bookPath);
  if (!transcript) {
    res.status(404).json({ error: 'no transcript available' });
    return;
  }
  res.json(transcript);
});

/**
 * GET /api/sync/active-builds
 * Returns all bookPaths currently being transcribed.
 */
router.get('/active-builds', (_req, res) => {
  res.json({ builds: getActiveBuilds() });
});

/**
 * GET /api/sync/debug-positions?bookPath=...&epubPath=...&cfi=...
 * Returns ebook text at the given CFI and audio phrase from the transcript.
 */
router.get('/debug-positions', (req, res) => {
  const {
    bookPath,
    epubPath,
    cfi,
    ebookPct,
    audioPct: audioPctParam,
  } = req.query as {
    bookPath: string;
    epubPath: string;
    cfi?: string;
    ebookPct?: string;
    audioPct?: string;
  };

  if (!bookPath || !epubPath) {
    res.status(400).json({ error: 'bookPath and epubPath are required' });
    return;
  }

  // Ebook text — try CFI first, fall back to percentage-based extraction
  let ebookText = '';
  if (cfi) {
    try {
      ebookText = getTextAtCfi(epubPath, cfi, 300);
    } catch {
      /* ignore */
    }
  }
  if (!ebookText && ebookPct) {
    try {
      const map = extractEpubText(epubPath);
      ebookText = getTextAtPercentage(map, parseFloat(ebookPct), 300);
    } catch {
      /* ignore */
    }
  }

  // Audio position from player progress
  const playerProg = getPlayerProgress(bookPath);
  const audioPct =
    audioPctParam != null ? parseFloat(audioPctParam) : (playerProg?.percentage ?? null);
  const audioFileIndex = playerProg?.fileIndex ?? null;
  const audioSeconds = playerProg?.position ?? null;

  // Audio phrase from transcript — use fileIndex+position for accurate globalStart lookup
  let audioText = '';
  if (hasTranscript(bookPath)) {
    try {
      const transcript = loadTranscript(bookPath);
      const allWords = transcript ? flattenTranscriptWords(transcript) : [];
      if (allWords.length > 0 && transcript) {
        let targetSeconds: number;

        if (audioFileIndex != null && audioSeconds != null) {
          // Most accurate: find globalStart of first word in the target file, then add position
          const fileNames = Object.keys(transcript.files);
          const fileName = fileNames[audioFileIndex];
          const fileWords = fileName ? (transcript.files[fileName] ?? []) : [];
          const fileStartGlobal = fileWords.length > 0 ? fileWords[0].globalStart : 0;
          targetSeconds = fileStartGlobal + audioSeconds;
        } else if (audioPct !== null) {
          targetSeconds = audioPct * transcript.totalDuration;
        } else {
          targetSeconds = -1;
        }

        if (targetSeconds >= 0) {
          let closestIdx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < allWords.length; i++) {
            const diff = Math.abs(allWords[i].globalStart - targetSeconds);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = i;
            }
          }
          const start = Math.max(0, closestIdx - 1);
          const end = Math.min(allWords.length, closestIdx + 3);
          audioText = allWords
            .slice(start, end)
            .map((w) => w.text)
            .join(' ');
        }
      }
    } catch {
      /* ignore */
    }
  }

  res.json({ ebookCfi: cfi ?? null, ebookText, audioPct, audioFileIndex, audioSeconds, audioText });
});

/**
 * GET /api/sync/transcript-progress?bookPath=...
 */
router.get('/transcript-progress', (req, res) => {
  const { bookPath } = req.query as { bookPath: string };
  if (!bookPath) {
    res.status(400).json({ error: 'bookPath is required' });
    return;
  }
  const progress = getBuildProgress(bookPath);
  res.json(progress ?? { total: 0, done: [], inProgress: [], fileProgress: {}, fileErrors: {} });
});

/**
 * GET /api/sync/whisper-models
 * Returns the list of models available on the Whisper server.
 */
router.get('/whisper-models', async (req, res) => {
  const config = getConfig('app');
  const baseUrlRaw = config.whisper?.baseUrl;
  const apiKey = config.whisper?.apiKey;

  if (!baseUrlRaw) {
    res.status(503).json({ error: 'Whisper not configured' });
    return;
  }

  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  try {
    const r = await axios.get<{ data: Array<{ id: string }> }>(`${baseUrl}/v1/models`, {
      headers,
      timeout: 8000,
    });
    const models = (r.data?.data ?? []).map((m) => m.id);
    res.json({ models });
  } catch (err) {
    res.status(502).json({ models: [], error: (err as Error).message });
  }
});

/**
 * POST /api/sync/whisper-models
 * Triggers a model download on the Whisper server.
 */
router.post('/whisper-models', async (req, res) => {
  const config = getConfig('app');
  const baseUrlRaw = config.whisper?.baseUrl;
  const apiKey = config.whisper?.apiKey;
  const { model } = req.body as { model: string };

  if (!baseUrlRaw) {
    res.status(503).json({ error: 'Whisper not configured' });
    return;
  }
  if (!model) {
    res.status(400).json({ error: 'model is required' });
    return;
  }

  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  try {
    const encodedModel = encodeURIComponent(model);
    const r = await axios.post(
      `${baseUrl}/v1/models/${encodedModel}`,
      {},
      { headers, timeout: 30000, validateStatus: () => true },
    );
    res.status(r.status).json(r.data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/sync/test-whisper
 * Pings the configured Whisper server to verify connectivity.
 */
router.get('/test-whisper', async (req, res) => {
  const { baseUrl: qBaseUrl, apiKey: qApiKey } = req.query as { baseUrl?: string; apiKey?: string };
  const config = getConfig('app');
  const baseUrlRaw = qBaseUrl || config.whisper?.baseUrl;
  const apiKey = qApiKey !== undefined ? qApiKey : config.whisper?.apiKey;

  if (!baseUrlRaw) {
    res.status(503).json({ ok: false, error: 'Whisper not configured' });
    return;
  }

  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  try {
    const response = await axios.get(`${baseUrl}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeout: 8000,
      validateStatus: () => true, // accept any HTTP status
    });
    if (response.status < 500) {
      res.json({ ok: true, status: response.status });
    } else {
      res.json({ ok: false, error: `Server returned ${response.status}` });
    }
  } catch (err) {
    const msg = (err as Error).message;
    res.json({ ok: false, error: msg });
  }
});

export default router;
