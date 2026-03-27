import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed, getLibraryStats } from '../scanner/library';
import { invalidateScanCache, setScanCacheEntry } from '../routes/library';
import logger from '../lib/logger';
import { LogEntry, ScannerAuthorGroup } from '../types';

const LOG_MAX = 300;
const logBuffer: LogEntry[] = [];

function pushLog(level: LogEntry['level'], msg: string): void {
  logBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
}

export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

export function rebuildLibraryCache(dryRun = false): void {
  const librariesConfig = getConfig('libraries');
  let totalLibs = 0;

  const prefix = dryRun ? '[dry-run] ' : '';

  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[type] || []) {
      try {
        const stats = getLibraryStats(lib.path, type);
        const tree: ScannerAuthorGroup[] =
          type === 'mixed'
            ? scanLibraryMixed(lib.path)
            : scanLibrary(lib.path, type);

        if (!dryRun) setScanCacheEntry(lib.id, tree, stats);

        const libLabel = lib.name || lib.path;
        const bookCount = tree.reduce((n, g) => n + (g.books?.length || 0), 0);
        const authorCount = tree.length;

        pushLog('info', `${prefix}━━ ${libLabel} [${type}] — ${authorCount} authors, ${bookCount} books ━━`);

        for (const group of tree) {
          if (!group.books?.length) continue;
          pushLog('info', `${prefix}  ${group.author || 'Unknown Author'} (${group.books.length})`);
          for (const book of group.books) {
            const meta = book.savedMeta;
            const series = meta?.series || '';
            const seriesLabel = series ? ` · ${series}` : '';
            pushLog('info', `${prefix}    • ${book.title}${seriesLabel}`);
          }
        }

        pushLog('info', `${prefix}└─ Done: ${bookCount} books in ${authorCount} authors`);
        totalLibs++;
      } catch (err) {
        const msg = `Failed to scan ${lib.path}: ${(err as Error).message}`;
        logger.warn(`[libraryCacheRebuild] ${msg}`);
        pushLog('warn', msg);
      }
    }
  }

  if (totalLibs > 0) {
    const msg = dryRun
      ? `[dry-run] Scanned ${totalLibs} librar${totalLibs === 1 ? 'y' : 'ies'} — no cache written`
      : `Rebuilt cache for ${totalLibs} librar${totalLibs === 1 ? 'y' : 'ies'}`;
    logger.info(`[libraryCacheRebuild] ${msg}`);
    pushLog('info', msg);
  }
}

export function runLibraryCacheRebuild(): void {
  invalidateScanCache();
  rebuildLibraryCache();
}

export function dryRunLibraryCacheRebuild(): void {
  rebuildLibraryCache(true);
}

export function startLibraryCacheRebuild(intervalMs: number): void {
  if (rebuildTimer) clearInterval(rebuildTimer);

  // Run once immediately at startup
  setImmediate(() => rebuildLibraryCache());

  rebuildTimer = setInterval(() => {
    invalidateScanCache();
    rebuildLibraryCache();
  }, intervalMs);

  logger.info(`[libraryCacheRebuild] Scheduled every ${Math.round(intervalMs / 60000)} min`);
}

export function restartLibraryCacheRebuild(): void {
  const config = getConfig('app');
  const conf = config.libraryCacheRebuild;
  if (!conf || conf.enabled !== false) {
    startLibraryCacheRebuild((conf?.intervalMinutes || 10) * 60 * 1000);
  } else {
    stopLibraryCacheRebuild();
  }
}

export function stopLibraryCacheRebuild(): void {
  if (rebuildTimer) {
    clearInterval(rebuildTimer);
    rebuildTimer = null;
  }
}
