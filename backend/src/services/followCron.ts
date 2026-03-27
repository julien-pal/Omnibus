import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed } from '../scanner/library';
import { search as searchMetadata, fetchSeriesBooks, writeBookMeta } from './metadata';
import { BookMetadata, ContentType, FollowEntry, LogEntry } from '../types';
import logger from '../lib/logger';

// ── In-memory log buffer ──────────────────────────────────────────────────────
const LOG_MAX = 300;
const logBuffer: LogEntry[] = [];

function pushLog(level: LogEntry['level'], msg: string): void {
  logBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
}

function log(msg: string): void { logger.info(msg); pushLog('info', msg); }
function warn(msg: string): void { logger.warn(msg); pushLog('warn', msg); }
function error(msg: string): void { logger.error(msg); pushLog('error', msg); }

export function getLogs(): LogEntry[] { return [...logBuffer]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getAllLibraryTitles(): Set<string> {
  const known = new Set<string>();
  const librariesConfig = getConfig('libraries');
  for (const libType of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[libType] || []) {
      try {
        const tree =
          libType === 'mixed' ? scanLibraryMixed(lib.path) : scanLibrary(lib.path, libType);
        for (const group of tree) {
          for (const book of group.books) {
            const meta = book.savedMeta as BookMetadata | undefined;
            const t = normalize(meta?.title || book.title);
            const a = normalize(meta?.author || book.author || '');
            known.add(`${a}::${t}`);
          }
        }
      } catch {
        // ignore unreadable libraries
      }
    }
  }
  return known;
}

function findLibraryPath(follow: FollowEntry): string | null {
  const librariesConfig = getConfig('libraries');
  if (follow.libraryId) {
    for (const t of ['ebook', 'audiobook', 'mixed'] as const) {
      const found = (librariesConfig[t] || []).find((l) => l.id === follow.libraryId);
      if (found) return found.path;
    }
  }
  const fmt = follow.format;
  if (fmt === 'ebook') {
    const lib = (librariesConfig.ebook || [])[0] || (librariesConfig.mixed || [])[0];
    return lib?.path ?? null;
  }
  if (fmt === 'audiobook') {
    const lib = (librariesConfig.audiobook || [])[0] || (librariesConfig.mixed || [])[0];
    return lib?.path ?? null;
  }
  // both: prefer mixed, else audiobook
  const lib =
    (librariesConfig.mixed || [])[0] ||
    (librariesConfig.audiobook || [])[0] ||
    (librariesConfig.ebook || [])[0];
  return lib?.path ?? null;
}

function 
addToWishlist(
  libPath: string,
  metadata: Partial<BookMetadata>,
  wishlistFormat: ContentType,
): void {
  function sanitize(s: string | undefined): string {
    return (s || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .trim()
      .slice(0, 100);
  }
  const author = sanitize(metadata.author);
  const rawSeries = metadata.series?.replace(/#\d+.*$/, '').trim() ?? '';
  const seriesDir = sanitize(rawSeries);
  const title = sanitize(metadata.title);
  if (!title) return;
  const segments = [author, seriesDir, title].filter(Boolean);
  const bookPath = path.join(libPath, ...segments);
  if (!fs.existsSync(bookPath)) fs.mkdirSync(bookPath, { recursive: true });
  writeBookMeta(bookPath, { ...metadata, wishlist: true, wishlistFormat });
}

// ── Main cron logic ───────────────────────────────────────────────────────────

export async function runFollowCron({ dryRun = false } = {}): Promise<void> {
  log(`[follow-cron] Starting${dryRun ? ' (DRY RUN)' : ''}`);

  const followsConfig = getConfig('follows');
  const authors = followsConfig.authors || [];
  const series = followsConfig.series || [];

  if (authors.length === 0 && series.length === 0) {
    log('[follow-cron] No follows configured');
    return;
  }

  const known = getAllLibraryTitles();
  log(`[follow-cron] ${known.size} books already in library`);

  // ── Followed authors ──
  for (const follow of authors) {
    const types: ContentType[] =
      follow.format === 'both' ? ['audiobook', 'ebook'] : [follow.format as ContentType];

    for (const type of types) {
      log(`[follow-cron] Author "${follow.name}" (${type})`);
      try {
        const results = await searchMetadata(follow.name, follow.name, type);
        const newBooks = results.filter((r) => {
          if (!r.title) return false;
          const key = `${normalize(r.author || follow.name)}::${normalize(r.title)}`;
          return !known.has(key);
        });
        log(
          `[follow-cron] → ${results.length} results, ${newBooks.length} new`,
        );

        for (const book of newBooks) {
          const line = `"${book.title}" by ${book.author || follow.name} (${type})`;
          if (dryRun) {
            log(`[follow-cron] [DRY RUN] Would add to wishlist: ${line}`);
            continue;
          }
          const libPath = findLibraryPath(follow);
          if (!libPath) {
            warn(`[follow-cron] No library found for format "${follow.format}"`);
            break;
          }
          addToWishlist(libPath, book, type);
          known.add(`${normalize(book.author || follow.name)}::${normalize(book.title || '')}`);
          log(`[follow-cron] Added to wishlist: ${line}`);
        }
      } catch (err) {
        warn(
          `[follow-cron] Error for author "${follow.name}" (${type}): ${(err as Error).message}`,
        );
      }
    }
  }

  // ── Followed series ──
  for (const follow of series) {
    const types: ContentType[] =
      follow.format === 'both' ? ['audiobook', 'ebook'] : [follow.format as ContentType];

    for (const type of types) {
      log(`[follow-cron] Series "${follow.name}" (${type})`);
      try {
        const results = await fetchSeriesBooks(follow.name, follow.author, type);
        const newBooks = results.filter((r) => {
          if (!r.title) return false;
          const key = `${normalize(r.author || follow.author || '')}::${normalize(r.title)}`;
          return !known.has(key);
        });
        log(`[follow-cron] → ${results.length} results, ${newBooks.length} new`);

        for (const book of newBooks) {
          const line = `"${book.title}" (${follow.name} ${type})`;
          if (dryRun) {
            log(`[follow-cron] [DRY RUN] Would add to wishlist: ${line}`);
            continue;
          }
          const libPath = findLibraryPath(follow);
          if (!libPath) {
            warn(`[follow-cron] No library found for format "${follow.format}"`);
            break;
          }
          addToWishlist(libPath, book, type);
          known.add(
            `${normalize(book.author || follow.author || '')}::${normalize(book.title || '')}`,
          );
          log(`[follow-cron] Added to wishlist: ${line}`);
        }
      } catch (err) {
        warn(
          `[follow-cron] Error for series "${follow.name}" (${type}): ${(err as Error).message}`,
        );
      }
    }
  }

  log('[follow-cron] Done');
}

// ── Cron lifecycle ────────────────────────────────────────────────────────────

let cronInterval: ReturnType<typeof setInterval> | null = null;

export function startFollowCron(intervalMs = 60 * 60 * 1000): void {
  if (cronInterval) clearInterval(cronInterval);
  runFollowCron().catch((err) => error(`[follow-cron] Error: ${(err as Error).message}`));
  cronInterval = setInterval(() => {
    runFollowCron().catch((err) => error(`[follow-cron] Error: ${(err as Error).message}`));
  }, intervalMs);
}

export function stopFollowCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

export function restartFollowCron(): void {
  const appConfig = getConfig('app');
  const cronConf = appConfig.followCron || { enabled: false, intervalMinutes: 60 };
  if (!cronConf.enabled) {
    stopFollowCron();
    log('[follow-cron] Disabled by config');
    return;
  }
  const intervalMs = (cronConf.intervalMinutes || 60) * 60 * 1000;
  startFollowCron(intervalMs);
  log(`[follow-cron] Restarted with interval ${cronConf.intervalMinutes}min`);
}
