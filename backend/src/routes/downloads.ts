import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  addDownload,
  getDownloads,
  getDownload,
  removeDownload,
  retriggerOrganize,
} from '../services/downloader';
import { BookMetadata, ContentType } from '../types';
import logger from '../lib/logger';
const router = express.Router();

// POST /api/downloads — add a download
router.post('/', async (req, res) => {
  const {
    url,
    magnetUrl,
    name,
    type = 'ebook',
    metadata,
    metadataPath,
  } = req.body as {
    url?: string;
    magnetUrl?: string;
    name?: string;
    type?: ContentType;
    metadata?: Partial<BookMetadata>;
    metadataPath?: string;
  };
  const startedAt = Date.now();
  const hasMagnetUri = typeof magnetUrl === 'string' && magnetUrl.trim().startsWith('magnet:');

  if (!url && !magnetUrl) {
    return res.status(400).json({ error: 'url or magnetUrl is required' });
  }

  const id = uuidv4();
  logger.info('[downloads] Add request received', {
    id,
    name: name || metadata?.title || 'Unknown',
    type,
    hasUrl: Boolean(url),
    hasMagnetUrl: Boolean(magnetUrl),
    hasMagnetUri,
  });

  try {
    const download = await addDownload({
      id,
      name,
      url,
      magnetUrl,
      type: type || 'ebook',
      metadata,
      metadataPath,
    });
    logger.info('[downloads] Add request completed', {
      id,
      hash: download.hash,
      clientId: download.clientId,
      durationMs: Date.now() - startedAt,
    });
    res.status(201).json(download);
  } catch (err) {
    logger.error('[downloads] Add request failed', {
      id,
      message: (err as Error).message,
      durationMs: Date.now() - startedAt,
    });
    res.status(502).json({ error: (err as Error).message });
  }
});

// GET /api/downloads — list all active downloads
router.get('/', (_req, res) => {
  res.json(getDownloads());
});

// GET /api/downloads/:id — get single download
router.get('/:id', (req, res) => {
  const dl = getDownload(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Download not found' });
  res.json(dl);
});

// POST /api/downloads/:id/organize — re-trigger copy to library
router.post('/:id/organize', async (req, res) => {
  const dl = getDownload(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Download not found' });
  try {
    await retriggerOrganize(dl);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/downloads/:id — remove download from tracking
router.delete('/:id', (req, res) => {
  const dl = getDownload(req.params.id);
  if (!dl) return res.status(404).json({ error: 'Download not found' });
  removeDownload(req.params.id);
  res.json({ ok: true });
});

export default router;
