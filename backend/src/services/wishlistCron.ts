import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed } from '../scanner/library';
import { search as prowlarrSearch } from './prowlarr';
import { addDownload, getDownloads } from './downloader';
import { writeBookMeta } from './metadata';
import { BookMetadata, ContentType, LogEntry, ProwlarrConfig } from '../types';
import logger from '../lib/logger';
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns significant words (len >= 4, accents stripped) from a string.
 */
function sigWords(str: string): string[] {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

/**
 * Returns true if the torrent title is relevant to the requested book.
 */
function isRelevant(torrentTitle: string, bookTitle: string): boolean {
  const words = sigWords(bookTitle);
  if (words.length === 0) return true;
  const t = (torrentTitle || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const matched = words.filter((w) => t.includes(w)).length;
  return matched / words.length >= 0.6;
}

function buildCategories(type: ContentType, prowlarrConfig: ProwlarrConfig): number[] {
  const indexers = prowlarrConfig.indexers || [];
  const categories = new Set<number>();
  for (const indexer of indexers) {
    if (type === 'ebook') (indexer.categories?.book || []).forEach((c) => categories.add(c));
    if (type === 'audiobook')
      (indexer.categories?.audiobook || []).forEach((c) => categories.add(c));
  }
  if (categories.size === 0) {
    if (type === 'ebook') [7000, 7020, 8010].forEach((c) => categories.add(c));
    if (type === 'audiobook') [7030, 8020].forEach((c) => categories.add(c));
  }
  return Array.from(categories);
}

export async function runWishlistCron({ dryRun = false } = {}): Promise<void> {
  log(`[wishlist-cron] Starting wishlist check${dryRun ? ' (DRY RUN)' : ''}`);

  const librariesConfig = getConfig('libraries');
  const prowlarrConfig = getConfig('prowlarr');

  const pending: Array<{ book: ReturnType<typeof scanLibrary>[0]['books'][0]; libType: string }> =
    [];
  for (const libType of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[libType] || []) {
      let tree;
      try {
        tree = libType === 'mixed' ? scanLibraryMixed(lib.path) : scanLibrary(lib.path, libType);
      } catch (err) {
        warn(`[wishlist-cron] Could not scan library "${lib.name}": ${(err as Error).message}`);
        continue;
      }
      for (const authorGroup of tree) {
        for (const book of authorGroup.books) {
          if (!book.wishlist || !book.savedMeta) continue;
          const meta = book.savedMeta as BookMetadata & Record<string, unknown>;
          const fmt = (meta.wishlistFormat || 'both') as string;
          const needsEbook =
            (fmt === 'ebook' || fmt === 'both') && !meta.downloadingEbook && !meta.notFoundEbook;
          const needsAudiobook =
            (fmt === 'audiobook' || fmt === 'both') &&
            !meta.downloadingAudiobook &&
            !meta.notFoundAudiobook;
          if (needsEbook || needsAudiobook) pending.push({ book, libType });
        }
      }
    }
  }

  log(`[wishlist-cron] ${pending.length} pending wishlist book(s)`);

  for (const { book } of pending) {
    const meta = book.savedMeta as BookMetadata & Record<string, unknown>;
    const title = (meta.title || book.title || '') as string;
    const author = (meta.author || book.author || '') as string;
    const format = (meta.wishlistFormat || 'both') as string;

    const typesToTry: ContentType[] = [];
    if ((format === 'ebook' || format === 'both') && !meta.downloadingEbook && !meta.notFoundEbook)
      typesToTry.push('ebook');
    if (
      (format === 'audiobook' || format === 'both') &&
      !meta.downloadingAudiobook &&
      !meta.notFoundAudiobook
    )
      typesToTry.push('audiobook');

    let currentMeta: BookMetadata & Record<string, unknown> = { ...meta };

    for (const searchType of typesToTry) {
      try {
        const categories = buildCategories(searchType, prowlarrConfig);

        let results: Awaited<ReturnType<typeof prowlarrSearch>> = [];
        const queries = author ? [`${title} ${author}`, title] : [title];

        for (const q of queries) {
          let r = await prowlarrSearch(q, categories, [], { exact: true });
          if (r.length === 0) r = await prowlarrSearch(q, categories, [], { exact: false });
          r = r.filter((res) => isRelevant(res.title, title));
          if (r.length > 0) {
            results = r;
            break;
          }
          log(`[wishlist-cron] No relevant results for "${q}", trying next…`);
        }

        results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
        const best = results.find((r) => (r.seeders || 0) > 0);

        if (!best) {
          log(`[wishlist-cron] No relevant seeded results for "${title}" (${searchType})`);
          const notFoundKey = searchType === 'ebook' ? 'notFoundEbook' : 'notFoundAudiobook';
          currentMeta = { ...currentMeta, [notFoundKey]: true };
          writeBookMeta(book.path, currentMeta);
          continue;
        }

        if (dryRun) {
          log(
            `[wishlist-cron] [DRY RUN] Would download "${title}" (${searchType}): ${best.title} — ${best.seeders} seeders`,
          );
          continue;
        }

        // Dedup: skip if an active download already exists for this title+type
        const activeDownloads = getDownloads();
        const alreadyActive = activeDownloads.some(
          (dl) =>
            dl.type === searchType &&
            !(['done', 'error'] as string[]).includes(dl.status) &&
            (dl.name || '').toLowerCase().trim() === title.toLowerCase().trim(),
        );
        if (alreadyActive) {
          log(`[wishlist-cron] Skipping "${title}" (${searchType}) — already downloading`);
          continue;
        }

        log(`[wishlist-cron] Triggering download for "${title}" (${searchType}): ${best.title}`);

        await addDownload({
          id: uuidv4(),
          name: title,
          url: best.downloadUrl || '',
          magnetUrl: (best as unknown as { magnetUrl?: string }).magnetUrl || '',
          type: searchType,
          metadata: { title, author, ...currentMeta } as Partial<BookMetadata>,
          metadataPath: book.path,
        });

        const downloadingKey = searchType === 'ebook' ? 'downloadingEbook' : 'downloadingAudiobook';
        currentMeta = {
          ...currentMeta,
          [downloadingKey]: true,
          wishlistDownloadTriggered: true,
          wishlistTriggeredAt: new Date().toISOString(),
        };
        writeBookMeta(book.path, currentMeta);

        log(`[wishlist-cron] Download triggered for "${title}" (${searchType})`);
      } catch (err) {
        warn(`[wishlist-cron] Failed for "${title}" (${searchType}): ${(err as Error).message}`);
      }
    }
  }

  log('[wishlist-cron] Done');
}

let cronInterval: ReturnType<typeof setInterval> | null = null;

export function startWishlistCron(intervalMs = 60 * 60 * 1000): void {
  if (cronInterval) clearInterval(cronInterval);
  runWishlistCron().catch((err) => error(`[wishlist-cron] Error: ${(err as Error).message}`));
  cronInterval = setInterval(() => {
    runWishlistCron().catch((err) => error(`[wishlist-cron] Error: ${(err as Error).message}`));
  }, intervalMs);
}

export function stopWishlistCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

export function restartWishlistCron(): void {
  const appConfig = getConfig('app');
  const cronConf = appConfig.wishlistCron || { enabled: true, intervalMinutes: 60 };
  if (!cronConf.enabled) {
    stopWishlistCron();
    log('[wishlist-cron] Disabled by config');
    return;
  }
  const intervalMs = (cronConf.intervalMinutes || 60) * 60 * 1000;
  startWishlistCron(intervalMs);
  log(`[wishlist-cron] Restarted with interval ${cronConf.intervalMinutes}min`);
}
