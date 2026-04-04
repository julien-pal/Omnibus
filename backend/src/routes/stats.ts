import { Router } from 'express';
import { getConfig } from '../config/manager';
import { scanLibrary, scanLibraryMixed } from '../scanner/library';
import { getAllProgress } from '../services/playerProgress';
import { getAllProgress as getAllReaderProgress } from '../services/readerProgress';
import { BookMetadata, ScannerBook } from '../types';

const router = Router();
const EBOOK_EXTS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'cbz', 'cbr']);
const AUDIOBOOK_EXTS = new Set(['mp3', 'm4b', 'm4a', 'flac', 'ogg', 'opus']);

// ── Stats response cache ──────────────────────────────────────────────────────
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
interface StatsCacheEntry {
  data: unknown;
  expiresAt: number;
}
let statsCache: StatsCacheEntry | null = null;

export function invalidateStatsCache() {
  statsCache = null;
}
// ─────────────────────────────────────────────────────────────────────────────

function parseRuntimeSeconds(runtime: string): number {
  const s = runtime.trim().toLowerCase();

  // HH:MM:SS
  const hms = s.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) return parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseInt(hms[3]);

  // HH:MM
  const hm = s.match(/^(\d+):(\d+)$/);
  if (hm) return parseInt(hm[1]) * 3600 + parseInt(hm[2]) * 60;

  let total = 0;
  const hours = s.match(/(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?/);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:s|utes?)?)?/);
  const secs = s.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:s|onds?)?)?/);
  if (hours) total += parseFloat(hours[1]) * 3600;
  if (mins) total += parseFloat(mins[1]) * 60;
  if (secs) total += parseFloat(secs[1]);
  if (total > 0) return Math.round(total);

  // Plain number: assume minutes
  const plain = s.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return Math.round(parseFloat(plain[1]) * 60);

  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function computeAndCacheStats(): void {
  const librariesConfig = getConfig('libraries');

  const allBooks: { book: ScannerBook; type: 'ebook' | 'audiobook' | 'mixed' }[] = [];

  for (const type of ['ebook', 'audiobook', 'mixed'] as const) {
    for (const lib of librariesConfig[type] || []) {
      try {
        const tree = type === 'mixed' ? scanLibraryMixed(lib.path) : scanLibrary(lib.path, type);
        for (const group of tree) {
          for (const book of group.books) {
            allBooks.push({ book, type });
          }
        }
      } catch {
        /* skip unavailable library */
      }
    }
  }

  const playerProgress = getAllProgress();
  const readerProgress = getAllReaderProgress();

  let totalBooks = 0;
  let totalEbooks = 0;
  let totalAudiobooks = 0;
  let totalMixed = 0;
  let booksWishlist = 0;
  let booksCompleted = 0;
  let booksInProgress = 0;
  let totalListeningSeconds = 0;
  let totalSize = 0;

  const seriesSet = new Set<string>();
  const mixedSeriesFormats = new Map<string, { hasEbook: boolean; hasAudiobook: boolean }>();
  const authorsSet = new Set<string>();
  const genreMap = new Map<string, number>();
  const languageMap = new Map<string, number>();
  const yearMap = new Map<string, number>();

  for (const { book, type } of allBooks) {
    const meta: BookMetadata | null | undefined = book.savedMeta;

    if (meta?.wishlist) {
      booksWishlist++;
      continue;
    }

    totalBooks++;
    const hasEbook =
      type === 'ebook' ||
      (type === 'mixed' &&
        ((book.ebookFiles?.length ?? 0) > 0 || book.files.some((f) => EBOOK_EXTS.has(f.ext))));
    const hasAudiobook =
      type === 'audiobook' ||
      (type === 'mixed' &&
        ((book.audiobookFiles?.length ?? 0) > 0 ||
          book.files.some((f) => AUDIOBOOK_EXTS.has(f.ext))));

    if (hasEbook) totalEbooks++;
    if (hasAudiobook) totalAudiobooks++;

    for (const f of book.files) totalSize += f.size;

    // Series
    if (meta?.series && typeof meta.series === 'string') {
      const name = meta.series.replace(/\s+#\d+(\.\d+)?$/, '').trim();
      if (name) {
        seriesSet.add(name);
        const previous = mixedSeriesFormats.get(name) ?? { hasEbook: false, hasAudiobook: false };
        mixedSeriesFormats.set(name, {
          hasEbook: previous.hasEbook || hasEbook,
          hasAudiobook: previous.hasAudiobook || hasAudiobook,
        });
      }
    }

    // Authors
    const author = meta?.author || book.author;
    if (author && typeof author === 'string') authorsSet.add(author);

    // Progress
    const player = playerProgress[book.path];
    const reader = readerProgress[book.path];
    const isCompleted = player?.completed === true || reader?.completed === true;
    const hasProgress =
      (player && (player.percentage ?? 0) > 0.01) ||
      (reader && (reader.percentage ?? 0) > 0.01);

    if (isCompleted) booksCompleted++;
    else if (hasProgress) booksInProgress++;

    // Listening time from metadata
    if (meta?.runtime && typeof meta.runtime === 'string') {
      totalListeningSeconds += parseRuntimeSeconds(meta.runtime);
    }

    // Genres — check genres (array), genre (string), subjects (array, Open Library)
    const genreRaw =
      (meta as Record<string, unknown> | undefined)?.genres ??
      (meta as Record<string, unknown> | undefined)?.genre ??
      (meta as Record<string, unknown> | undefined)?.subjects;
    const genres: string[] = Array.isArray(genreRaw)
      ? (genreRaw as unknown[]).map(String).slice(0, 3)
      : typeof genreRaw === 'string' && genreRaw
        ? [genreRaw]
        : [];
    for (const g of genres) {
      const normalized = g.trim();
      if (normalized) genreMap.set(normalized, (genreMap.get(normalized) ?? 0) + 1);
    }

    // Language
    if (meta?.language && typeof meta.language === 'string') {
      const lang = meta.language.trim();
      if (lang) languageMap.set(lang, (languageMap.get(lang) ?? 0) + 1);
    }

    // Year
    if (meta?.year && typeof meta.year === 'string') {
      const year = meta.year.slice(0, 4);
      if (/^\d{4}$/.test(year)) yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
    }
  }

  const totalHours = Math.floor(totalListeningSeconds / 3600);
  const totalMinutes = Math.floor((totalListeningSeconds % 3600) / 60);

  const byGenre = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([genre, count]) => ({ genre, count }));

  const byLanguage = [...languageMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({ language, count }));

  const byYear = [...yearMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }));

  totalMixed = [...mixedSeriesFormats.values()].filter((s) => s.hasEbook && s.hasAudiobook).length;

  const payload = {
    totalBooks,
    totalEbooks,
    totalAudiobooks,
    totalMixed,
    totalSeries: seriesSet.size,
    totalAuthors: authorsSet.size,
    booksCompleted,
    booksInProgress,
    booksWishlist,
    totalListeningSeconds,
    listeningHours: totalHours,
    listeningMinutes: totalMinutes,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    byGenre,
    byLanguage,
    byYear,
  };

  statsCache = { data: payload, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
}

// GET /api/stats
router.get('/', (_req, res) => {
  if (!statsCache || Date.now() >= statsCache.expiresAt) {
    computeAndCacheStats();
  }
  res.json(statsCache!.data);
});

export default router;
