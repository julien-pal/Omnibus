// ── Shared frontend types (mirrors backend types) ─────────────────────────────

export type ContentType = 'ebook' | 'audiobook' | 'mixed';

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'seeding'
  | 'organizing'
  | 'done'
  | 'imported'
  | 'error'
  | 'paused';

export interface BookMetadata {
  title?: string;
  author?: string;
  series?: string;
  seriesSequence?: string;
  year?: string;
  cover?: string | null;
  description?: string;
  narrator?: string;
  runtime?: string;
  asin?: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  source?: string;
  wishlist?: boolean;
  wishlistFormat?: ContentType;
  wishlistDownloadTriggered?: boolean;
  wishlistTriggeredAt?: string;
  readLater?: boolean;
  [key: string]: unknown;
}

export interface DownloadEntry {
  id: string;
  name: string;
  hash: string | null;
  type: ContentType;
  clientId: string;
  status: DownloadStatus;
  progress: number;
  destination: string;
  metadata: BookMetadata;
  metadataPath: string | null;
  addedAt: number;
  size?: number;
  error?: string;
  state?: string;
}

export interface SearchResult {
  title: string;
  indexer: string;
  indexerId: number;
  size: number;
  seeders: number;
  leechers: number;
  downloadUrl: string;
  magnetUrl?: string;
  infoUrl?: string;
  category?: string | number | { id?: number; name?: string };
  categories?: Array<string | number | { id?: number; name?: string }>;
  publishDate?: string;
  guid?: string;
  metadata?: BookMetadata;
  _searchType?: ContentType;
  _metadataPath?: string;
}

export interface Library {
  id: string;
  name: string;
  path: string;
  type: ContentType;
}

export interface ClientConfig {
  id: string;
  name: string;
  type: string;
  url: string;
  username: string;
  password: string;
  destinations: Record<string, string>;
  tags: Record<string, string>;
  pathMap?: { from: string; to: string };
  timeout?: number;
}

export interface IndexerCategory {
  id: number;
  name: string;
  parentId?: number;
}

export interface IndexerConfig {
  id: number;
  name: string;
  categories: { book: number[]; audiobook: number[] };
  available?: IndexerCategory[];
}

export interface ProwlarrConfig {
  url: string;
  apiKey: string;
  indexers: IndexerConfig[];
}

export interface ClientsConfig {
  active: string;
  clients: ClientConfig[];
}

export interface ScannerFile {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  ext: string;
}

export interface ScannerBook {
  title: string;
  author?: string;
  series?: string;
  path: string;
  files: ScannerFile[];
  cover: string | null;
  savedMeta?: BookMetadata | null;
  wishlist?: boolean;
  ebookFiles?: ScannerFile[];
  audiobookFiles?: ScannerFile[];
}

export interface ScannerAuthorGroup {
  author: string;
  books: ScannerBook[];
}

export interface LibraryStats {
  authors: number;
  books: number;
  files: number;
  size: number;
  sizeFormatted: string;
}

export interface LibraryScanResult {
  libraryId: string;
  libraryName: string;
  libraryPath: string;
  tree: ScannerAuthorGroup[];
}

export interface Chapter {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
}

export interface ProgressEntry {
  position: number;
  fileIndex: number;
  percentage?: number;
  chapterTitle?: string;
  snippet?: string;
  completed?: boolean;
  updatedAt: number;
}

export interface ReaderProgressEntry {
  cfi?: string;
  page?: number;
  chapterTitle?: string;
  snippet?: string;
  percentage: number;
  completed?: boolean;
  updatedAt: number;
}

export interface PlayerTrack {
  bookPath: string;
  title: string;
  author: string;
  cover: string | null;
  files: ScannerFile[];
  fileIndex: number;
}

// Extended ScannerBook with merged fields computed by Library page
export interface MergedBook extends ScannerBook {
  _ebookPresent?: boolean;
  _audioPresent?: boolean;
  _ebookWish?: boolean;
  _audioWish?: boolean;
  _downloadingEbook?: boolean;
  _downloadingAudiobook?: boolean;
  _notFoundEbook?: boolean;
  _notFoundAudiobook?: boolean;
  _libType?: string;
}
