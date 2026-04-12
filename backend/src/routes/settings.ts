import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, saveConfig } from '../config/manager';
import { testConnection as prowlarrTest, getIndexers } from '../services/prowlarr';
import { createClient } from '../services/torrent';
import logger from '../lib/logger';
const router = express.Router();

// ============================================================
// APP SETTINGS
// ============================================================

router.get('/app', (_req, res) => {
  const config = getConfig('app');
  const { jwtSecret, ...safe } = config;
  const safeConfig = safe as Record<string, unknown>;
  if (safeConfig.auth)
    safeConfig.auth = { ...(safeConfig.auth as Record<string, unknown>), passwordHash: undefined };
  res.json(safeConfig);
});

router.put('/app', (req, res) => {
  const current = getConfig('app');
  const { port, renamePatterns, syncEnabled } = req.body as {
    port?: number;
    renamePatterns?: { ebook?: string; audiobook?: string };
    syncEnabled?: boolean;
  };
  if (port) current.port = port;
  if (renamePatterns) current.renamePatterns = { ...current.renamePatterns, ...renamePatterns };
  if (typeof syncEnabled === 'boolean') current.syncEnabled = syncEnabled;
  saveConfig('app', current);
  res.json({ ok: true });
});

// ============================================================
// WHISPER SETTINGS
// ============================================================

router.get('/whisper', (_req, res) => {
  const config = getConfig('app');
  res.json(config.whisper || { baseUrl: '', apiKey: '', model: 'whisper-1', concurrency: 1 });
});

router.put('/whisper', (req, res) => {
  const { baseUrl, apiKey, model, concurrency } = req.body as {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    concurrency?: number;
  };
  const config = getConfig('app');
  config.whisper = {
    baseUrl: baseUrl ?? config.whisper?.baseUrl ?? '',
    apiKey: apiKey ?? config.whisper?.apiKey ?? '',
    model: model ?? config.whisper?.model ?? 'whisper-1',
    concurrency: concurrency ?? config.whisper?.concurrency ?? 1,
  };
  saveConfig('app', config);
  res.json({ ok: true });
});

// ============================================================
// AUTH SETTINGS
// ============================================================

router.get('/auth', (_req, res) => {
  const config = getConfig('app');
  res.json({
    enabled: config.auth?.enabled || false,
    username: config.auth?.username || 'admin',
    passwordSet: !!config.auth?.passwordHash,
  });
});

router.put('/auth', async (req, res) => {
  const { enabled, username, password } = req.body as {
    enabled?: boolean;
    username?: string;
    password?: string;
  };
  const config = getConfig('app');
  if (!config.auth) config.auth = { enabled: false, username: 'admin', passwordHash: '' };

  if (typeof enabled === 'boolean') config.auth.enabled = enabled;
  if (username) config.auth.username = username;
  if (password) {
    const salt = await bcrypt.genSalt(10);
    config.auth.passwordHash = await bcrypt.hash(password, salt);
  }

  saveConfig('app', config);
  res.json({ ok: true });
});

// ============================================================
// PROWLARR SETTINGS
// ============================================================

router.get('/prowlarr', (_req, res) => {
  res.json(getConfig('prowlarr'));
});

router.put('/prowlarr', (req, res) => {
  const { url, apiKey } = req.body as { url?: string; apiKey?: string };
  const config = getConfig('prowlarr');
  if (url !== undefined) config.url = url;
  if (apiKey !== undefined) config.apiKey = apiKey;
  saveConfig('prowlarr', config);
  res.json({ ok: true });
});

router.post('/prowlarr/test', async (req, res) => {
  const { url, apiKey } = req.body as { url: string; apiKey: string };
  const result = await prowlarrTest(url, apiKey);
  res.json(result);
});

router.get('/prowlarr/indexers', async (_req, res) => {
  try {
    const indexers = await getIndexers();
    indexers.forEach((idx) => {
      logger.info(`[prowlarr] Indexer "${idx.name}" — ${idx.available.length} categories`);
    });
    res.json({ indexers });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.put('/prowlarr/indexers', (req, res) => {
  const { indexers } = req.body as { indexers: unknown };
  const config = getConfig('prowlarr');
  config.indexers = indexers as typeof config.indexers;
  saveConfig('prowlarr', config);
  res.json({ ok: true });
});

// ============================================================
// TORRENT CLIENTS
// ============================================================

router.get('/clients', (_req, res) => {
  res.json(getConfig('clients'));
});

router.post('/clients', (req, res) => {
  const config = getConfig('clients');
  const client = { id: uuidv4(), ...req.body };
  config.clients.push(client);
  if (!config.active && config.clients.length === 1) {
    config.active = client.id;
  }
  saveConfig('clients', config);
  res.status(201).json(client);
});

router.put('/clients/:id', (req, res) => {
  const config = getConfig('clients');
  const idx = config.clients.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });
  config.clients[idx] = { ...config.clients[idx], ...req.body, id: req.params.id };
  saveConfig('clients', config);
  res.json(config.clients[idx]);
});

router.delete('/clients/:id', (req, res) => {
  const config = getConfig('clients');
  config.clients = config.clients.filter((c) => c.id !== req.params.id);
  if (config.active === req.params.id) {
    config.active = config.clients[0]?.id || '';
  }
  saveConfig('clients', config);
  res.json({ ok: true });
});

router.put('/clients-active', (req, res) => {
  const { id } = req.body as { id: string };
  const config = getConfig('clients');
  const exists = config.clients.some((c) => c.id === id);
  if (!exists) return res.status(404).json({ error: 'Client not found' });
  config.active = id;
  saveConfig('clients', config);
  res.json({ ok: true });
});

router.post('/clients/:id/test', async (req, res) => {
  const config = getConfig('clients');
  const clientConf = config.clients.find((c) => c.id === req.params.id);
  if (!clientConf) return res.status(404).json({ error: 'Client not found' });

  try {
    const client = createClient(clientConf);
    const ok = await client.testConnection();
    if (!ok) return res.json({ ok: false, error: 'Connection test failed' });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

// ============================================================
// LIBRARIES
// ============================================================

router.get('/libraries', (_req, res) => {
  const config = getConfig('libraries');
  if (!config.mixed) config.mixed = [];
  res.json(config);
});

router.get('/browse', (req, res) => {
  try {
    let current = (req.query.path as string) || null;

    const roots: string[] = [];
    if (process.platform === 'win32') {
      for (let i = 65; i <= 90; i++) {
        const drive = String.fromCharCode(i) + ':\\';
        if (fs.existsSync(drive)) roots.push(drive);
      }
      if (!current) current = roots[0] || 'C:\\';
    } else {
      roots.push('/');
      if (!current) current = '/';
    }

    current = path.resolve(current);

    let entries: Array<{ name: string; path: string }> = [];
    let files: Array<{ name: string; path: string }> = [];
    const includeFiles = req.query.files === 'true';
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
    try {
      const dirents = fs.readdirSync(current, { withFileTypes: true });
      entries = dirents
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, path: path.join(current as string, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (includeFiles) {
        files = dirents
          .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
          .map((e) => ({ name: e.name, path: path.join(current as string, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch {
      entries = [];
    }

    const parent = path.dirname(current) !== current ? path.dirname(current) : null;
    res.json({ path: current, parent, dirs: entries, files, roots });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/libraries', (req, res) => {
  const { name, path: libPath, type } = req.body as { name?: string; path?: string; type?: string };
  if (!libPath || !type) return res.status(400).json({ error: 'path and type are required' });
  if (!['ebook', 'audiobook', 'mixed'].includes(type))
    return res.status(400).json({ error: 'type must be ebook, audiobook, or mixed' });

  const config = getConfig('libraries');
  const lib = {
    id: uuidv4(),
    name: name || libPath,
    path: libPath,
    type,
  } as (typeof config.ebook)[0];

  const t = type as 'ebook' | 'audiobook' | 'mixed';
  if (!config[t]) config[t] = [];
  config[t].push(lib);
  saveConfig('libraries', config);
  // Seed cache for the new library asynchronously
  setImmediate(() => {
    try {
      const { rebuildLibraryCache } = require('../services/libraryCacheRebuild');
      rebuildLibraryCache();
    } catch { /* ignore */ }
  });
  res.status(201).json(lib);
});

router.put('/libraries/:id', (req, res) => {
  const config = getConfig('libraries');
  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    const idx = (config[type] || []).findIndex((l) => l.id === req.params.id);
    if (idx !== -1) {
      config[type][idx] = { ...config[type][idx], ...req.body, id: req.params.id };
      saveConfig('libraries', config);
      const { invalidateScanCache } = require('../routes/library');
      invalidateScanCache(req.params.id);
      return res.json(config[type][idx]);
    }
  }
  res.status(404).json({ error: 'Library not found' });
});

router.delete('/libraries/:id', (req, res) => {
  const config = getConfig('libraries');
  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    config[type] = (config[type] || []).filter((l) => l.id !== req.params.id);
  }
  saveConfig('libraries', config);
  const { invalidateScanCache } = require('../routes/library');
  invalidateScanCache(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// WISHLIST CRON SETTINGS
// ============================================================

router.get('/cron', (_req, res) => {
  const config = getConfig('app');
  res.json(config.wishlistCron || { enabled: true, intervalMinutes: 60 });
});

router.put('/cron', (req, res) => {
  const { enabled, intervalMinutes } = req.body as { enabled?: boolean; intervalMinutes?: number };
  const config = getConfig('app');
  if (!config.wishlistCron) config.wishlistCron = { enabled: true, intervalMinutes: 60 };
  if (typeof enabled === 'boolean') config.wishlistCron.enabled = enabled;
  if (intervalMinutes !== undefined) config.wishlistCron.intervalMinutes = Number(intervalMinutes);
  saveConfig('app', config);
  const { restartWishlistCron } = require('../services/wishlistCron');
  restartWishlistCron();
  res.json({ ok: true });
});

router.post('/cron/run', async (_req, res) => {
  const { runWishlistCron } = require('../services/wishlistCron');
  runWishlistCron().catch((err: Error) =>
    logger.error('[wishlist-cron] Manual run error:', err.message),
  );
  res.json({ ok: true, message: 'Wishlist cron triggered' });
});

router.post('/cron/dry-run', async (_req, res) => {
  const { runWishlistCron } = require('../services/wishlistCron');
  runWishlistCron({ dryRun: true }).catch((err: Error) =>
    logger.error('[wishlist-cron] Dry run error:', err.message),
  );
  res.json({ ok: true, message: 'Wishlist dry run triggered' });
});

router.get('/cron/logs', (_req, res) => {
  const { getLogs } = require('../services/wishlistCron');
  res.json(getLogs());
});

// ============================================================
// IMPORT CRON SETTINGS
// ============================================================

router.get('/cron/import', (_req, res) => {
  const config = getConfig('app');
  res.json(config.importCron || { enabled: true, intervalSeconds: 5 });
});

router.put('/cron/import', (req, res) => {
  const { enabled, intervalSeconds } = req.body as { enabled?: boolean; intervalSeconds?: number };
  const config = getConfig('app');
  if (!config.importCron) config.importCron = { enabled: true, intervalSeconds: 5 };
  if (typeof enabled === 'boolean') config.importCron.enabled = enabled;
  if (intervalSeconds !== undefined) config.importCron.intervalSeconds = Number(intervalSeconds);
  saveConfig('app', config);
  const { startPolling, stopPolling } = require('../services/downloader');
  if (config.importCron.enabled) {
    startPolling(config.importCron.intervalSeconds * 1000);
  } else {
    stopPolling();
  }
  res.json({ ok: true });
});

router.post('/cron/import/run', async (_req, res) => {
  const { pollDownloads } = require('../services/downloader');
  pollDownloads().catch((err: Error) =>
    logger.error('[import-cron] Manual run error:', err.message),
  );
  res.json({ ok: true });
});

router.post('/cron/import/dry-run', async (_req, res) => {
  const { pollDownloads } = require('../services/downloader');
  pollDownloads({ dryRun: true }).catch((err: Error) =>
    logger.error('[import-cron] Dry run error:', err.message),
  );
  res.json({ ok: true, message: 'Import dry run triggered' });
});

router.get('/cron/import/logs', (_req, res) => {
  const { getImportLogs } = require('../services/downloader');
  res.json(getImportLogs());
});

// ============================================================
// TRANSCRIPT CRON SETTINGS
// ============================================================

router.get('/cron/transcript', (_req, res) => {
  const config = getConfig('app');
  res.json(config.transcriptCron || { enabled: false, intervalMinutes: 60 });
});

router.put('/cron/transcript', (req, res) => {
  const { enabled, intervalMinutes } = req.body as { enabled?: boolean; intervalMinutes?: number };
  const config = getConfig('app');
  if (!config.transcriptCron) config.transcriptCron = { enabled: false, intervalMinutes: 60 };
  if (typeof enabled === 'boolean') config.transcriptCron.enabled = enabled;
  if (intervalMinutes !== undefined)
    config.transcriptCron.intervalMinutes = Number(intervalMinutes);
  saveConfig('app', config);
  const { restartTranscriptCron } = require('../services/transcriptCron');
  restartTranscriptCron();
  res.json({ ok: true });
});

router.post('/cron/transcript/run', async (_req, res) => {
  const { runTranscriptCron } = require('../services/transcriptCron');
  runTranscriptCron().catch((err: Error) =>
    logger.error('[transcript-cron] Manual run error:', err.message),
  );
  res.json({ ok: true, message: 'Transcript cron triggered' });
});

router.post('/cron/transcript/dry-run', async (_req, res) => {
  const { runTranscriptCron } = require('../services/transcriptCron');
  runTranscriptCron({ dryRun: true }).catch((err: Error) =>
    logger.error('[transcript-cron] Dry run error:', err.message),
  );
  res.json({ ok: true, message: 'Transcript dry run triggered' });
});

router.get('/cron/transcript/logs', (_req, res) => {
  const { getLogs } = require('../services/transcriptCron');
  res.json(getLogs());
});

// ============================================================
// LIBRARY CACHE REBUILD CRON
// ============================================================

router.get('/cron/library-cache', (_req, res) => {
  const config = getConfig('app');
  res.json(config.libraryCacheRebuild || { enabled: true, intervalMinutes: 10 });
});

router.put('/cron/library-cache', (req, res) => {
  const { enabled, intervalMinutes } = req.body as { enabled?: boolean; intervalMinutes?: number };
  const config = getConfig('app');
  if (!config.libraryCacheRebuild) config.libraryCacheRebuild = { enabled: true, intervalMinutes: 10 };
  if (typeof enabled === 'boolean') config.libraryCacheRebuild.enabled = enabled;
  if (intervalMinutes !== undefined) config.libraryCacheRebuild.intervalMinutes = Number(intervalMinutes);
  saveConfig('app', config);
  const { restartLibraryCacheRebuild } = require('../services/libraryCacheRebuild');
  restartLibraryCacheRebuild();
  res.json({ ok: true });
});

router.post('/cron/library-cache/run', (_req, res) => {
  const { runLibraryCacheRebuild } = require('../services/libraryCacheRebuild');
  runLibraryCacheRebuild();
  res.json({ ok: true, message: 'Library cache rebuild triggered' });
});

router.post('/cron/library-cache/dry-run', (_req, res) => {
  const { dryRunLibraryCacheRebuild } = require('../services/libraryCacheRebuild');
  dryRunLibraryCacheRebuild();
  res.json({ ok: true, message: 'Library cache dry run triggered' });
});

router.get('/cron/library-cache/logs', (_req, res) => {
  const { getLogs } = require('../services/libraryCacheRebuild');
  res.json(getLogs());
});

// ============================================================
// FOLLOW CRON SETTINGS
// ============================================================

router.get('/cron/follow', (_req, res) => {
  const config = getConfig('app');
  res.json(config.followCron || { enabled: false, intervalMinutes: 60 });
});

router.put('/cron/follow', (req, res) => {
  const { enabled, intervalMinutes } = req.body as { enabled?: boolean; intervalMinutes?: number };
  const config = getConfig('app');
  if (!config.followCron) config.followCron = { enabled: false, intervalMinutes: 60 };
  if (typeof enabled === 'boolean') config.followCron.enabled = enabled;
  if (intervalMinutes !== undefined) config.followCron.intervalMinutes = Number(intervalMinutes);
  saveConfig('app', config);
  const { restartFollowCron } = require('../services/followCron');
  restartFollowCron();
  res.json({ ok: true });
});

router.post('/cron/follow/run', async (_req, res) => {
  const { runFollowCron } = require('../services/followCron');
  runFollowCron().catch((err: Error) => logger.error('[follow-cron] Manual run error:', err.message));
  res.json({ ok: true, message: 'Follow cron triggered' });
});

router.post('/cron/follow/dry-run', async (_req, res) => {
  const { runFollowCron } = require('../services/followCron');
  runFollowCron({ dryRun: true }).catch((err: Error) =>
    logger.error('[follow-cron] Dry run error:', err.message),
  );
  res.json({ ok: true, message: 'Follow dry run triggered' });
});

router.get('/cron/follow/logs', (_req, res) => {
  const { getLogs } = require('../services/followCron');
  res.json(getLogs());
});

// ============================================================
// FOLLOWS MANAGEMENT
// ============================================================

router.get('/follows', (_req, res) => {
  const follows = getConfig('follows');
  res.json(follows);
});

router.post('/follows/author', express.json(), (req, res) => {
  const { name, format, libraryId } = req.body as {
    name?: string;
    format?: string;
    libraryId?: string;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const follows = getConfig('follows');
  follows.authors = follows.authors || [];
  const existing = follows.authors.findIndex((a) => a.name === name);
  if (existing >= 0) {
    follows.authors[existing] = {
      name,
      format: (format || 'both') as 'ebook' | 'audiobook' | 'both',
      libraryId,
    };
  } else {
    follows.authors.push({
      name,
      format: (format || 'both') as 'ebook' | 'audiobook' | 'both',
      libraryId,
    });
  }
  saveConfig('follows', follows);
  res.json({ ok: true, follows });
});

router.delete('/follows/author', express.json(), (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const follows = getConfig('follows');
  follows.authors = (follows.authors || []).filter((a) => a.name !== name);
  saveConfig('follows', follows);
  res.json({ ok: true, follows });
});

router.post('/follows/series', express.json(), (req, res) => {
  const { name, author, format, libraryId } = req.body as {
    name?: string;
    author?: string;
    format?: string;
    libraryId?: string;
  };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const follows = getConfig('follows');
  follows.series = follows.series || [];
  const existing = follows.series.findIndex((s) => s.name === name);
  if (existing >= 0) {
    follows.series[existing] = {
      name,
      author,
      format: (format || 'both') as 'ebook' | 'audiobook' | 'both',
      libraryId,
    };
  } else {
    follows.series.push({
      name,
      author,
      format: (format || 'both') as 'ebook' | 'audiobook' | 'both',
      libraryId,
    });
  }
  saveConfig('follows', follows);
  res.json({ ok: true, follows });
});

router.delete('/follows/series', express.json(), (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });
  const follows = getConfig('follows');
  follows.series = (follows.series || []).filter((s) => s.name !== name);
  saveConfig('follows', follows);
  res.json({ ok: true, follows });
});

// ============================================================
// EMAIL / EREADER SETTINGS
// ============================================================

router.get('/email', (_req, res) => {
  const config = getConfig('app');
  const e = config.emailConfig || { smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', senderEmail: '', readerEmail: '' };
  res.json({
    smtpHost: e.smtpHost,
    smtpPort: e.smtpPort,
    smtpUser: e.smtpUser,
    senderEmail: e.senderEmail,
    readerEmail: e.readerEmail,
    smtpPassSet: !!e.smtpPass,
  });
});

router.put('/email', (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, readerEmail } = req.body as {
    smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; senderEmail?: string; readerEmail?: string;
  };
  const config = getConfig('app');
  const existing = config.emailConfig || { smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', senderEmail: '', readerEmail: '' };
  config.emailConfig = {
    smtpHost: smtpHost ?? existing.smtpHost,
    smtpPort: smtpPort ?? existing.smtpPort,
    smtpUser: smtpUser ?? existing.smtpUser,
    smtpPass: smtpPass ?? existing.smtpPass,
    senderEmail: senderEmail ?? existing.senderEmail,
    readerEmail: readerEmail ?? existing.readerEmail,
  };
  saveConfig('app', config);
  res.json({ ok: true });
});

router.post('/email/test', async (_req, res) => {
  const config = getConfig('app');
  const e = config.emailConfig;
  if (!e?.smtpHost || !e?.readerEmail) {
    return res.status(503).json({ error: 'Email not configured' });
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: e.smtpHost, port: e.smtpPort, secure: false,
      auth: { user: e.smtpUser, pass: e.smtpPass },
    });
    await transporter.sendMail({ from: e.senderEmail, to: e.readerEmail, subject: 'Omnibus — test email', text: 'Your e-reader is correctly configured in Omnibus.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
