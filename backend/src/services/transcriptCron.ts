import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed } from '../scanner/library';
import { hasTranscript, isBuildInProgress, buildTranscript } from './syncCompute';
import { LogEntry } from '../types';
import logger from '../lib/logger';
import fs from 'fs';
import path from 'path';

// ── In-memory log buffer ──────────────────────────────────────────────────────
const LOG_MAX = 300;
const logBuffer: LogEntry[] = [];

function pushLog(level: LogEntry['level'], msg: string): void {
  logBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
}

function log(msg: string): void {
  logger.info(msg);
  pushLog('info', msg);
}
function warn(msg: string): void {
  logger.warn(msg);
  pushLog('warn', msg);
}
function error(msg: string): void {
  logger.error(msg);
  pushLog('error', msg);
}

export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

// ── File extension sets ───────────────────────────────────────────────────────
const EBOOK_EXTS = new Set(['.epub']);
const AUDIOBOOK_EXTS = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.opus']);

function findEpub(bookPath: string): string | null {
  try {
    const entry = fs.readdirSync(bookPath).find((f) => f.toLowerCase().endsWith('.epub'));
    return entry ? path.join(bookPath, entry) : null;
  } catch {
    return null;
  }
}

function findAudioFiles(bookPath: string): Array<{ path: string }> {
  try {
    return fs
      .readdirSync(bookPath)
      .filter((f) => AUDIOBOOK_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => ({ path: path.join(bookPath, f) }));
  } catch {
    return [];
  }
}

// ── Cron logic ────────────────────────────────────────────────────────────────

export async function runTranscriptCron({
  dryRun = false,
}: { dryRun?: boolean } = {}): Promise<void> {
  log(`[transcript-cron] Starting transcript scan${dryRun ? ' (dry run)' : ''}`);

  const librariesConfig = getConfig('libraries');
  const appConfig = getConfig('app');

  if (!appConfig.whisper?.baseUrl) {
    warn('[transcript-cron] Whisper not configured — skipping');
    return;
  }

  const candidates: Array<{
    bookPath: string;
    audioFiles: Array<{ path: string }>;
    epubPath: string;
    title: string;
  }> = [];

  // Scan mixed libraries — these are the ones that can have both audio+ebook
  for (const lib of librariesConfig.mixed || []) {
    let tree;
    try {
      tree = scanLibraryMixed(lib.path);
    } catch (err) {
      warn(`[transcript-cron] Could not scan library "${lib.name}": ${(err as Error).message}`);
      continue;
    }

    for (const authorGroup of tree) {
      for (const book of authorGroup.books) {
        const ebookFiles = book.ebookFiles || [];
        const audiobookFiles = book.audiobookFiles || [];

        const hasEbook = ebookFiles.some((f) => EBOOK_EXTS.has(path.extname(f.name).toLowerCase()));
        const hasAudio = audiobookFiles.length > 0;

        if (!hasEbook || !hasAudio) continue;
        if (hasTranscript(book.path)) continue;
        if (isBuildInProgress(book.path)) continue;

        const epubPath = findEpub(book.path);
        const audioFiles = findAudioFiles(book.path);
        if (!epubPath || audioFiles.length === 0) continue;

        candidates.push({
          bookPath: book.path,
          audioFiles,
          epubPath,
          title: book.savedMeta?.title || book.title || path.basename(book.path),
        });
      }
    }
  }

  log(`[transcript-cron] Found ${candidates.length} book(s) needing transcription`);

  if (dryRun) {
    for (const candidate of candidates) {
      log(`[transcript-cron] [dry-run] Would transcribe "${candidate.title}"`);
    }
    log('[transcript-cron] Done (dry run)');
    return;
  }

  for (const candidate of candidates) {
    try {
      log(`[transcript-cron] Starting transcription for "${candidate.title}"`);
      await buildTranscript(
        candidate.bookPath,
        candidate.audioFiles,
        appConfig.whisper!,
        candidate.epubPath,
      );
      log(`[transcript-cron] Completed transcription for "${candidate.title}"`);
    } catch (err) {
      error(`[transcript-cron] Failed for "${candidate.title}": ${(err as Error).message}`);
    }
  }

  log('[transcript-cron] Done');
}

// ── Timer management ──────────────────────────────────────────────────────────

let cronInterval: ReturnType<typeof setInterval> | null = null;

export function startTranscriptCron(intervalMs = 60 * 60 * 1000): void {
  if (cronInterval) clearInterval(cronInterval);
  runTranscriptCron().catch((err) => error(`[transcript-cron] Error: ${(err as Error).message}`));
  cronInterval = setInterval(() => {
    runTranscriptCron().catch((err) => error(`[transcript-cron] Error: ${(err as Error).message}`));
  }, intervalMs);
}

export function stopTranscriptCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

export function restartTranscriptCron(): void {
  const appConfig = getConfig('app');
  const cronConf = appConfig.transcriptCron || { enabled: false, intervalMinutes: 60 };
  if (!cronConf.enabled) {
    stopTranscriptCron();
    log('[transcript-cron] Disabled by config');
    return;
  }
  const intervalMs = (cronConf.intervalMinutes || 60) * 60 * 1000;
  startTranscriptCron(intervalMs);
  log(`[transcript-cron] Restarted with interval ${cronConf.intervalMinutes}min`);
}
