import fs from 'fs';
import path from 'path';
import { readBookMeta } from '../services/metadata';
import { LibraryStats, ScannerAuthorGroup, ScannerBook, ScannerFile } from '../types';

const EBOOK_EXTS = new Set(['.epub', '.pdf', '.mobi', '.azw3', '.cbz', '.cbr']);
const AUDIOBOOK_EXTS = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.opus']);
const COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const COVER_NAMES = new Set(['cover', 'folder', 'front', 'artwork', 'thumbnail']);

type LibraryType = 'ebook' | 'audiobook' | 'mixed';

function getBookExts(type: LibraryType): Set<string> {
  if (type === 'audiobook') return AUDIOBOOK_EXTS;
  if (type === 'mixed') return new Set([...EBOOK_EXTS, ...AUDIOBOOK_EXTS]);
  return EBOOK_EXTS;
}

function isCoverFile(filename: string): boolean {
  const name = path.basename(filename, path.extname(filename)).toLowerCase();
  const ext = path.extname(filename).toLowerCase();
  return COVER_EXTS.has(ext) && COVER_NAMES.has(name);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Scans a directory recursively and returns a tree of author groups.
 */
export function scanLibrary(
  rootPath: string,
  type: LibraryType | 'ebook' | 'audiobook',
): ScannerAuthorGroup[] {
  if (!fs.existsSync(rootPath)) {
    throw new Error(`Library path does not exist: ${rootPath}`);
  }

  const bookExts = getBookExts(type as LibraryType);
  const authorMap = new Map<string, ScannerAuthorGroup>();

  function processDirectory(dirPath: string, depth = 0): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    const files = entries.filter((e) => e.isFile());
    const dirs = entries.filter((e) => e.isDirectory());

    const bookFiles = files.filter((f) => bookExts.has(path.extname(f.name).toLowerCase()));
    const coverFile = files.find((f) => isCoverFile(f.name));

    const savedMetaForWishlist = depth > 0 && bookFiles.length === 0 ? readBookMeta(dirPath) : null;
    const isWishlist = savedMetaForWishlist?.wishlist === true;

    if (bookFiles.length > 0 || isWishlist) {
      if (depth === 0) {
        for (const f of bookFiles) {
          const basename = path.basename(f.name, path.extname(f.name));
          let author = 'Unknown Author';
          let title = basename;
          const dashIdx = basename.indexOf(' - ');
          if (dashIdx !== -1) {
            author = basename.slice(0, dashIdx).trim();
            title = basename.slice(dashIdx + 3).trim();
          }
          if (!authorMap.has(author)) {
            authorMap.set(author, { author, books: [] });
          }
          const fullPath = path.join(dirPath, f.name);
          let size = 0;
          try {
            size = fs.statSync(fullPath).size;
          } catch {
            /* ignore */
          }
          const scanFile: ScannerFile = {
            name: f.name,
            path: fullPath,
            size,
            sizeFormatted: formatBytes(size),
            ext: path.extname(f.name).toLowerCase().slice(1),
          };
          authorMap.get(author)!.books.push({
            title,
            files: [scanFile],
            cover: null,
            path: dirPath,
          });
        }
      } else {
        const parts = path.relative(rootPath, dirPath).split(path.sep);
        let author = 'Unknown Author';
        let title = path.basename(dirPath);

        if (parts.length >= 2) {
          author = parts[0];
          title = parts.slice(1).join(' - ');
        } else if (parts.length === 1) {
          const dashIdx = title.indexOf(' - ');
          if (dashIdx !== -1) {
            author = title.slice(0, dashIdx).trim();
            title = title.slice(dashIdx + 3).trim();
          }
        }

        if (!authorMap.has(author)) {
          authorMap.set(author, { author, books: [] });
        }

        const authorEntry = authorMap.get(author)!;
        const cover = coverFile ? path.join(dirPath, coverFile.name) : null;

        const mappedFiles: ScannerFile[] = bookFiles.map((f) => {
          const fullPath = path.join(dirPath, f.name);
          let size = 0;
          try {
            size = fs.statSync(fullPath).size;
          } catch {
            /* ignore */
          }
          return {
            name: f.name,
            path: fullPath,
            size,
            sizeFormatted: formatBytes(size),
            ext: path.extname(f.name).toLowerCase().slice(1),
          };
        });

        const savedMeta = savedMetaForWishlist || readBookMeta(dirPath);
        const book: ScannerBook = {
          title,
          files: mappedFiles,
          cover,
          path: dirPath,
          savedMeta,
          ...(isWishlist ? { wishlist: true } : {}),
        };
        authorEntry.books.push(book);
      }
    }

    if (depth < 5) {
      for (const dir of dirs) {
        processDirectory(path.join(dirPath, dir.name), depth + 1);
      }
    }
  }

  processDirectory(rootPath);

  const result = Array.from(authorMap.values());
  result.sort((a, b) => a.author.localeCompare(b.author));
  result.forEach((a) => a.books.sort((x, y) => x.title.localeCompare(y.title)));
  return result;
}

/**
 * Scans a directory for both ebooks AND audiobooks.
 */
export function scanLibraryMixed(rootPath: string): ScannerAuthorGroup[] {
  const ebookGroups = scanLibrary(rootPath, 'ebook');
  const audiobookGroups = scanLibrary(rootPath, 'audiobook');

  const ebookByPath = new Map<string, { book: ScannerBook; author: string }>();
  const audiobookByPath = new Map<string, { book: ScannerBook; author: string }>();
  for (const g of ebookGroups)
    for (const b of g.books) ebookByPath.set(b.path, { book: b, author: g.author });
  for (const g of audiobookGroups)
    for (const b of g.books) audiobookByPath.set(b.path, { book: b, author: g.author });

  const allPaths = new Set([...ebookByPath.keys(), ...audiobookByPath.keys()]);
  const authorMap = new Map<string, ScannerAuthorGroup>();

  for (const p of allPaths) {
    const ebEntry = ebookByPath.get(p);
    const abEntry = audiobookByPath.get(p);
    const author = (ebEntry || abEntry)!.author;
    const base = (ebEntry || abEntry)!.book;

    const ebookFiles = ebEntry ? ebEntry.book.files : [];
    const audiobookFiles = abEntry ? abEntry.book.files : [];

    const merged: ScannerBook = {
      ...base,
      ebookFiles,
      audiobookFiles,
      files: [...ebookFiles, ...audiobookFiles],
      cover: ebEntry?.book.cover || abEntry?.book.cover || null,
      savedMeta: ebEntry?.book.savedMeta || abEntry?.book.savedMeta,
    };

    if (!authorMap.has(author)) authorMap.set(author, { author, books: [] });
    authorMap.get(author)!.books.push(merged);
  }

  const result = [...authorMap.values()];
  result.sort((a, b) => a.author.localeCompare(b.author));
  result.forEach((a) => a.books.sort((x, y) => x.title.localeCompare(y.title)));
  return result;
}

function _countStats(authors: ScannerAuthorGroup[]): {
  authors: number;
  books: number;
  files: number;
  size: number;
} {
  let books = 0,
    files = 0,
    size = 0;
  for (const a of authors) {
    books += a.books.length;
    for (const b of a.books) {
      files += b.files.length;
      size += b.files.reduce((s, f) => s + f.size, 0);
    }
  }
  return { authors: authors.length, books, files, size };
}

export function getLibraryStats(rootPath: string, type: string): LibraryStats {
  try {
    const tree =
      type === 'mixed' ? scanLibraryMixed(rootPath) : scanLibrary(rootPath, type as LibraryType);
    const { authors: a, books, files, size } = _countStats(tree);
    return { authors: a, books, files, size, sizeFormatted: formatBytes(size) };
  } catch {
    return { authors: 0, books: 0, files: 0, size: 0, sizeFormatted: '0 B' };
  }
}
