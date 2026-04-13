// eslint-disable-next-line @typescript-eslint/no-require-imports
require('express-async-errors');
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';

import { initializeConfigs, getConfig } from './config/manager';
import authMiddleware from './middleware/auth';
import { startPolling } from './services/downloader';
import { startWishlistCron } from './services/wishlistCron';
import { startTranscriptCron } from './services/transcriptCron';
import { startLibraryCacheRebuild } from './services/libraryCacheRebuild';
import { startFollowCron } from './services/followCron';
import authRouter from './routes/auth';
import searchRouter from './routes/search';
import downloadsRouter from './routes/downloads';
import libraryRouter from './routes/library';
import settingsRouter from './routes/settings';
import playerRouter from './routes/player';
import readerRouter from './routes/reader';
import syncRouter from './routes/sync';
import statsRouter from './routes/stats';
import profilesRouter from './routes/profiles';
import logger from './lib/logger';
// Initialize config files before anything else
initializeConfigs();

const appConfig = getConfig('app');
const PORT = process.env.PORT ? Number(process.env.PORT) : appConfig.port || 8686;

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes — /api/auth is always public
app.use('/api/auth', authRouter);

// All other API routes require auth (if enabled)
app.use('/api', authMiddleware);
app.use('/api/search', searchRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/player', playerRouter);
app.use('/api/reader', readerRouter);
app.use('/api/sync', syncRouter);
app.use('/api/stats', statsRouter);
app.use('/api/profiles', profilesRouter);

// Serve frontend static build in production
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Omnibus',
      status: 'running',
      message: 'Frontend not built. Run npm run build.',
    });
  });
}

// Global error handler
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('[error]', err.message);
  if (err.stack) logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Ensure jwtSecret is populated (handles upgrades from older config files)
if (!appConfig.jwtSecret) {
  const crypto = require('crypto') as typeof import('crypto');
  appConfig.jwtSecret = crypto.randomBytes(32).toString('hex');
  const { saveConfig } = require('./config/manager');
  saveConfig('app', appConfig);
  logger.warn('[security] Generated a new JWT secret and saved it to config. All existing tokens are now invalid.');
}

app.listen(PORT, () => {
  logger.info(`Omnibus backend running on http://localhost:${PORT}`);
  logger.info(`Config directory: ${path.resolve(process.cwd(), 'config')}`);
  if (!appConfig.auth?.enabled) {
    logger.warn('*** SECURITY WARNING: Authentication is disabled. All API endpoints are publicly accessible. Enable auth in Settings > Authentication. ***');
  }
  const importCronConf = appConfig.importCron;
  if (!importCronConf || importCronConf.enabled !== false) {
    startPolling((importCronConf?.intervalSeconds || 5) * 1000);
  }
  const { wishlistCron: cronConf } = appConfig;
  if (!cronConf || cronConf.enabled !== false) {
    startWishlistCron((cronConf?.intervalMinutes || 60) * 60 * 1000);
  }
  const transcriptCronConf = appConfig.transcriptCron;
  if (transcriptCronConf?.enabled) {
    startTranscriptCron((transcriptCronConf.intervalMinutes || 60) * 60 * 1000);
  }
  const libCacheConf = appConfig.libraryCacheRebuild;
  if (!libCacheConf || libCacheConf.enabled !== false) {
    startLibraryCacheRebuild((libCacheConf?.intervalMinutes || 10) * 60 * 1000);
  }
  const followCronConf = appConfig.followCron;
  if (followCronConf?.enabled) {
    startFollowCron((followCronConf.intervalMinutes || 60) * 60 * 1000);
  }
});

export default app;
