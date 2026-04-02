// ── Torrent clients ────────────────────────────────────────────────────────────

export type TorrentClientType = 'qbittorrent' | 'deluge' | 'transmission' | 'rtorrent' | 'aria2';

export type TorrentState =
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'queued'
  | 'checking'
  | 'error'
  | string;

export interface TorrentInfo {
  hash: string;
  name: string;
  progress: number;
  state: TorrentState;
  savePath?: string;
  size?: number;
  dlspeed?: number;
  addedOn?: number;
}

export interface PathMap {
  from: string;
  to: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  type: TorrentClientType;
  url: string;
  username: string;
  password: string;
  destinations: {
    ebook: string;
    audiobook: string;
  };
  tags: {
    ebook: string;
    audiobook: string;
  };
  pathMap: PathMap;
  timeout?: number;
  torrentFetchTimeout?: number;
}

export interface ClientsConfig {
  active: string;
  clients: ClientConfig[];
}

export interface ITorrentClient {
  testConnection(): Promise<boolean>;
  addTorrent(url: string, destination: string, tag: string): Promise<string | null>;
  getTorrents(): Promise<TorrentInfo[]>;
  getTorrent(hash: string): Promise<TorrentInfo | null>;
}

// ── Libraries ─────────────────────────────────────────────────────────────────

export type LibraryType = 'ebook' | 'audiobook' | 'mixed';

export interface Library {
  id: string;
  name: string;
  path: string;
  type: LibraryType;
}

export interface LibrariesConfig {
  ebook: Library[];
  audiobook: Library[];
  mixed: Library[];
}

// ── App config ────────────────────────────────────────────────────────────────

export interface AuthConfig {
  enabled: boolean;
  username: string;
  passwordHash: string;
}

export interface RenamePatterns {
  ebook: string;
  audiobook: string;
}

export interface CronConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface ImportCronConfig {
  enabled: boolean;
  intervalSeconds: number;
}

export interface WhisperConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  concurrency?: number; // parallel files sent simultaneously (default: 1)
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  senderEmail: string;
  readerEmail: string;
}

export interface AppConfig {
  port: number;
  auth: AuthConfig;
  renamePatterns: RenamePatterns;
  wishlistCron: CronConfig;
  importCron?: ImportCronConfig;
  jwtSecret: string;
  whisper?: WhisperConfig;
  syncEnabled?: boolean;
  transcriptCron?: CronConfig;
  libraryCacheRebuild?: CronConfig;
  followCron?: CronConfig;
  emailConfig?: EmailConfig;
}

// ── Follows ────────────────────────────────────────────────────────────────────

export interface FollowEntry {
  name: string;
  author?: string;
  format: 'ebook' | 'audiobook' | 'both';
  libraryId?: string;
}

export interface FollowsConfig {
  authors: FollowEntry[];
  series: FollowEntry[];
}

// ── Prowlarr ──────────────────────────────────────────────────────────────────

export interface IndexerCategory {
  id: number;
  name: string;
  parentId?: number;
}

export interface IndexerConfig {
  id: number;
  name: string;
  categories: {
    book: number[];
    audiobook: number[];
  };
  available?: IndexerCategory[];
}

export interface ProwlarrConfig {
  url: string;
  apiKey: string;
  indexers: IndexerConfig[];
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
  category?: string;
  publishDate?: string;
}

// ── Downloads ─────────────────────────────────────────────────────────────────

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'seeding'
  | 'organizing'
  | 'done'
  | 'imported'
  | 'error'
  | 'paused';

export type ContentType = 'ebook' | 'audiobook' | 'mixed';

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
  state?: TorrentState;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

export interface BookEntry {
  path: string;
  title: string;
  author?: string;
  series?: string;
  cover?: string;
  metadata?: BookMetadata;
  files?: string[];
  wishlist?: boolean;
}

export interface AuthorGroup {
  author: string;
  books: BookEntry[];
}

export interface LibraryScanResult {
  libraryId: string;
  libraryName: string;
  libraryPath: string;
  tree: AuthorGroup[];
}

// ── Configs union ─────────────────────────────────────────────────────────────

export type ConfigKey = 'app' | 'prowlarr' | 'clients' | 'libraries' | 'follows';

export type ConfigMap = {
  app: AppConfig;
  prowlarr: ProwlarrConfig;
  clients: ClientsConfig;
  libraries: LibrariesConfig;
  follows: FollowsConfig;
};

// ── Torrent source ─────────────────────────────────────────────────────────────

export type TorrentSource =
  | { isMagnet: true; magnetUrl: string }
  | { isMagnet: false; buffer: Buffer };

// ── Organizer ─────────────────────────────────────────────────────────────────

export interface OrganizeResult {
  filePath: string;
  destDir: string;
}

// ── Player ────────────────────────────────────────────────────────────────────

export interface Chapter {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
}

export interface ProgressEntry {
  position: number;
  fileIndex: number;
  updatedAt: number;
}

// ── Scanner (extended book/author types) ──────────────────────────────────────

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

// ── Express augmentation ──────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: { username: string; role: string; iat?: number; exp?: number };
    }
  }
}
