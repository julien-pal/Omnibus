import { ScannerBook, MergedBook } from '@/types';

export function extractSeries(book: ScannerBook): string | null {
  if (book.series) return book.series;
  const title = book.title || '';
  const m1 = title.match(/\(([^)]+?)[,\s]+#?\d+\s*\)$/);
  if (m1) return m1[1].trim();
  const m2 = title.match(/^(.+?)\s+#\d+\s*[–—-]/);
  if (m2) return m2[1].trim();
  return null;
}

const EBOOK_EXTS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'cbz', 'cbr']);
const AUDIO_EXTS = new Set(['mp3', 'm4b', 'm4a', 'flac', 'ogg', 'opus']);

export function detectBookType(book: ScannerBook): string | null {
  if (book.ebookFiles && book.audiobookFiles) {
    const hasEb = (book.ebookFiles?.length ?? 0) > 0;
    const hasAb = (book.audiobookFiles?.length ?? 0) > 0;
    if (hasEb && hasAb) return 'mixed';
    if (hasAb) return 'audiobook';
    if (hasEb) return 'ebook';
  }
  const files = book.files || [];
  const hasEbook = files.some((f) => EBOOK_EXTS.has(f.ext));
  const hasAudio = files.some((f) => AUDIO_EXTS.has(f.ext));
  if (hasEbook && hasAudio) return 'mixed';
  if (hasAudio) return 'audiobook';
  if (hasEbook) return 'ebook';
  return null;
}

export function mergeBooksByTitle(books: ScannerBook[]): MergedBook[] {
  const map = new Map();
  for (const book of books) {
    const sm = book.savedMeta || {};
    const isWishlist = !!(book.wishlist || sm.wishlist);
    const bookType = detectBookType(book);
    const wishFmt = sm.wishlistFormat || 'both';
    const key = (book.title || '').toLowerCase().trim();

    const ebookPresent = !isWishlist && (bookType === 'ebook' || bookType === 'mixed');
    const audioPresent = !isWishlist && (bookType === 'audiobook' || bookType === 'mixed');
    const ebookWish = isWishlist && (wishFmt === 'ebook' || wishFmt === 'both');
    const audioWish = isWishlist && (wishFmt === 'audiobook' || wishFmt === 'both');

    const wishStatus = isWishlist
      ? {
          _downloadingEbook: !!sm.downloadingEbook,
          _downloadingAudiobook: !!sm.downloadingAudiobook,
          _notFoundEbook: !!sm.notFoundEbook,
          _notFoundAudiobook: !!sm.notFoundAudiobook,
        }
      : {
          _downloadingEbook: false,
          _downloadingAudiobook: false,
          _notFoundEbook: false,
          _notFoundAudiobook: false,
        };

    if (!map.has(key)) {
      map.set(key, {
        ...book,
        _ebookPresent: ebookPresent,
        _audioPresent: audioPresent,
        _ebookWish: ebookWish,
        _audioWish: audioWish,
        ...wishStatus,
      });
    } else {
      const m = map.get(key);
      if (ebookPresent) m._ebookPresent = true;
      if (audioPresent) m._audioPresent = true;
      if (ebookWish) m._ebookWish = true;
      if (audioWish) m._audioWish = true;
      if (isWishlist) {
        if (sm.downloadingEbook) m._downloadingEbook = true;
        if (sm.downloadingAudiobook) m._downloadingAudiobook = true;
        if (sm.notFoundEbook) m._notFoundEbook = true;
        if (sm.notFoundAudiobook) m._notFoundAudiobook = true;
      }
      if ((ebookPresent || audioPresent) && !m._ebookPresent && !m._audioPresent) {
        const flags = {
          _ebookPresent: m._ebookPresent,
          _audioPresent: m._audioPresent,
          _ebookWish: m._ebookWish,
          _audioWish: m._audioWish,
          _downloadingEbook: m._downloadingEbook,
          _downloadingAudiobook: m._downloadingAudiobook,
          _notFoundEbook: m._notFoundEbook,
          _notFoundAudiobook: m._notFoundAudiobook,
        };
        map.set(key, { ...book, ...flags });
      }
    }
  }
  return Array.from(map.values());
}

export function buildSeriesGroups(books: MergedBook[]): {
  series: { name: string; books: MergedBook[] }[];
  ungrouped: MergedBook[];
} {
  const map = new Map<string, MergedBook[]>();
  const ungrouped: MergedBook[] = [];
  for (const book of books) {
    const raw = book.series || extractSeries(book) || '';
    const name = raw.replace(/\s+#\d+(?:\.\d+)?$/, '').trim();
    if (!name) {
      ungrouped.push(book);
      continue;
    }
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(book);
  }
  const series = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([name, sBooks]) => ({
      name,
      books: sBooks.slice().sort((a, b) => {
        const na = parseFloat((a.series || '').match(/#(\d+(?:\.\d+)?)$/)?.[1] ?? 'Infinity');
        const nb = parseFloat((b.series || '').match(/#(\d+(?:\.\d+)?)$/)?.[1] ?? 'Infinity');
        return na - nb;
      }),
    }));
  return { series, ungrouped };
}
