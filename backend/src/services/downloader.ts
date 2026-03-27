import { getConfig, CONFIG_DIR } from '../config/manager';
import { createClient } from './torrent';
import { copyOrganize, sanitize } from './organizer';
import { writeBookMeta, readBookMeta } from './metadata';
import path from 'path';
import fs from 'fs';
import {
  BookMetadata,
  ClientConfig,
  ContentType,
  DownloadEntry,
  LogEntry,
  TorrentInfo,
} from '../types';
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
function logError(msg: string): void {
  logger.error(msg);
  pushLog('error', msg);
}

export function getImportLogs(): LogEntry[] {
  return [...logBuffer];
}

// ── Persistent downloads store ────────────────────────────────────────────────
const DOWNLOADS_FILE = path.join(CONFIG_DIR, 'downloads.json');

function loadDownloads(): Map<string, DownloadEntry> {
  try {
    if (fs.existsSync(DOWNLOADS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf8')) as Record<
        string,
        DownloadEntry
      >;
      return new Map(Object.entries(data));
    }
  } catch (err) {
    logger.error('[downloader] Failed to load downloads.json:', (err as Error).message);
  }
  return new Map();
}

function saveDownloads(): void {
  try {
    const obj = Object.fromEntries(downloads);
    fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.error('[downloader] Failed to save downloads.json:', (err as Error).message);
  }
}

const downloads: Map<string, DownloadEntry> = loadDownloads();

// Reset any downloads stuck in 'organizing' on restart → mark done
let _hadStuck = false;
for (const dl of downloads.values()) {
  if (dl.status === 'organizing') {
    dl.status = 'done';
    _hadStuck = true;
  }
}
if (_hadStuck) saveDownloads();

function getActiveClient() {
  const clientsConfig = getConfig('clients');
  if (!clientsConfig.active) return null;
  const clientConf = (clientsConfig.clients || []).find((c) => c.id === clientsConfig.active);
  if (!clientConf) return null;
  return createClient(clientConf);
}

function getActiveClientConfig(): ClientConfig | null {
  const clientsConfig = getConfig('clients');
  if (!clientsConfig.active) return null;
  return (clientsConfig.clients || []).find((c) => c.id === clientsConfig.active) || null;
}

function isMagnetUri(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('magnet:');
}

interface AddDownloadParams {
  id: string;
  name?: string;
  url?: string;
  type: ContentType;
  magnetUrl?: string;
  metadata?: Partial<BookMetadata>;
  metadataPath?: string | null;
}

export async function addDownload({
  id,
  name,
  url,
  type,
  magnetUrl,
  metadata,
  metadataPath,
}: AddDownloadParams): Promise<DownloadEntry> {
  const clientConf = getActiveClientConfig();
  if (!clientConf) throw new Error('No active torrent client configured');

  const client = createClient(clientConf);
  const destination = (clientConf.destinations as Record<string, string>)?.[type] || '';
  const tag = (clientConf.tags as Record<string, string>)?.[type] || 'omnibus';

  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  const normalizedMagnetUrl = typeof magnetUrl === 'string' ? magnetUrl.trim() : '';
  const torrentUrl = isMagnetUri(normalizedMagnetUrl)
    ? normalizedMagnetUrl
    : normalizedUrl || normalizedMagnetUrl;

  if (!torrentUrl) {
    throw new Error('No usable torrent source provided');
  }

  const source = isMagnetUri(torrentUrl) ? 'magnet' : 'url';

  logger.info('[downloader] Adding torrent', {
    id,
    client: clientConf.name || clientConf.type,
    clientType: clientConf.type,
    type,
    destination,
    tag,
    source,
    usingDownloadUrl: source === 'url' && torrentUrl === normalizedUrl,
    usingMagnetFallbackUrl:
      source === 'url' &&
      torrentUrl === normalizedMagnetUrl &&
      normalizedMagnetUrl !== normalizedUrl,
  });

  const hash = await client.addTorrent(torrentUrl, destination, tag);

  const download: DownloadEntry = {
    id,
    name: name || metadata?.title || 'Unknown',
    hash,
    type,
    clientId: clientConf.id,
    status: 'downloading',
    progress: 0,
    destination,
    metadata: (metadata || {}) as BookMetadata,
    metadataPath: metadataPath || null,
    addedAt: Date.now(),
  };

  downloads.set(id, download);
  saveDownloads();
  logger.info('[downloader] Torrent added', { id, hash, clientId: clientConf.id, destination });
  return download;
}

export function getDownloads(): DownloadEntry[] {
  return Array.from(downloads.values());
}

export function getDownload(id: string): DownloadEntry | null {
  return downloads.get(id) || null;
}

export function removeDownload(id: string): void {
  downloads.delete(id);
  saveDownloads();
}

function resolveMetadata(dl: DownloadEntry): BookMetadata {
  if (dl.metadataPath) {
    try {
      const fileMeta = readBookMeta(dl.metadataPath);
      if (fileMeta && fileMeta.title) return fileMeta;
    } catch {
      // fall through to stored metadata
    }
  }
  return dl.metadata || ({} as BookMetadata);
}

export async function pollDownloads({ dryRun = false } = {}): Promise<void> {
  if (downloads.size === 0) {
    if (dryRun) log('[import] [DRY RUN] Aucun téléchargement en cours.');
    return;
  }

  const clientConf = getActiveClientConfig();
  if (!clientConf) {
    if (dryRun) log('[import] [DRY RUN] Aucun client torrent configuré.');
    return;
  }

  let client;
  try {
    client = createClient(clientConf);
  } catch {
    return;
  }

  const appConfig = getConfig('app');

  if (dryRun) {
    log(
      `[import] [DRY RUN] Début — ${downloads.size} téléchargement(s) en mémoire, client: ${clientConf.name || clientConf.type}`,
    );
  }

  let skipped = 0;
  for (const [id, dl] of downloads.entries()) {
    // Skip downloads already processed or explicitly failed
    if (dl.status === 'error' || dl.status === 'imported') {
      if (dryRun) {
        skipped++;
        log(
          `[import] [DRY RUN] "${dl.metadata?.title || id}" — ignoré (erreur: ${dl.error || '?'})`,
        );
      }
      continue;
    }
    if (!dl.hash) continue;

    try {
      const torrent = await client.getTorrent(dl.hash);
      if (!torrent) {
        if (dryRun)
          log(
            `[import] [DRY RUN] "${dl.metadata?.title || id}" — torrent introuvable dans le client (statut: ${dl.status})`,
          );
        continue;
      }

      if (!dryRun) {
        dl.progress = torrent.progress;
        dl.state = torrent.state;
      }

      if (torrent.state === 'error') {
        if (dryRun) {
          log(`[import] [DRY RUN] Torrent en erreur : ${dl.metadata?.title || id}`);
        } else {
          dl.status = 'error';
          logError(`[import] Erreur torrent : ${dl.metadata?.title || id}`);
          saveDownloads();
        }
      } else if (torrent.progress >= 100 && dl.status !== 'organizing') {
        // Apply pathMap before checking fs.existsSync so mapped paths resolve correctly
        const savePath = resolveSavePathMapped(torrent, clientConf);
        const title = dl.metadata?.title || id;
        const pattern =
          (appConfig.renamePatterns as unknown as Record<string, string>)?.[dl.type] ||
          '{author}/{title}';
        const libsConfig = getConfig('libraries');
        const targetLib = (libsConfig[dl.type] || [])[0] || (libsConfig.mixed || [])[0];
        const destRoot = targetLib?.path || '(aucune bibliothèque configurée)';

        if (dryRun) {
          log(`[import] [DRY RUN] "${title}"`);
          log(`[import] [DRY RUN]   source    : ${savePath || 'chemin inconnu'}`);
          log(`[import] [DRY RUN]   dest lib  : ${destRoot}`);
          log(`[import] [DRY RUN]   pattern   : ${pattern}`);
          log(`[import] [DRY RUN]   statut    : organizing → supprimé (succès) ou error`);
        } else {
          dl.status = 'organizing';
          saveDownloads();
          log(`[import] "${title}" — statut: organizing`);
          log(`[import]   source : ${savePath || '(vide)'}`);
          log(`[import]   dest   : ${destRoot} (pattern: ${pattern})`);

          try {
            if (!savePath)
              throw new Error('Chemin source introuvable — vérifier le path map du client torrent');
            const metadata = resolveMetadata(dl);
            await organizeDownloadedFiles(savePath, metadata, dl.type, pattern);
            log(`[import] "${title}" — statut: importé`);
            // Mark as imported only after successful copy
            dl.status = 'imported';
            saveDownloads();
          } catch (orgErr) {
            logError(`[import] "${title}" — statut: error`);
            logError(`[import]   raison : ${(orgErr as Error).message}`);
            dl.error = (orgErr as Error).message;
            dl.status = 'error';
            saveDownloads();
          }
        }
      } else if (!dryRun && dl.status !== 'organizing') {
        dl.status = torrent.state === 'seeding' ? 'seeding' : 'downloading';
      } else if (dryRun) {
        log(
          `[import] [DRY RUN] "${dl.metadata?.title || id}" — progression: ${torrent.progress.toFixed(1)}%`,
        );
      }
    } catch (err) {
      warn(`[import] Poll échoué pour ${id} : ${(err as Error).message}`);
    }
  }

  if (dryRun && skipped > 0) {
    log(`[import] [DRY RUN] ${skipped} téléchargement(s) en erreur ignoré(s).`);
  }
}

function findExistingBookDir(destRoot: string, metadata: BookMetadata): string | null {
  const authorDir = path.join(destRoot, sanitize(metadata.author));
  if (!fs.existsSync(authorDir)) return null;
  try {
    for (const seriesEntry of fs.readdirSync(authorDir, { withFileTypes: true })) {
      if (!seriesEntry.isDirectory()) continue;
      const seriesPath = path.join(authorDir, seriesEntry.name);
      for (const bookEntry of fs.readdirSync(seriesPath, { withFileTypes: true })) {
        if (!bookEntry.isDirectory()) continue;
        const bookPath = path.join(seriesPath, bookEntry.name);
        const metaFile = path.join(bookPath, 'metadata.json');
        if (fs.existsSync(metaFile)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { title?: string };
            if (meta.title === metadata.title) return bookPath;
          } catch {
            /* skip unreadable metadata */
          }
        }
      }
    }
  } catch {
    /* ignore permission errors */
  }
  return null;
}

async function organizeDownloadedFiles(
  savePath: string,
  metadata: BookMetadata,
  type: ContentType,
  pattern: string,
): Promise<void> {
  if (!fs.existsSync(savePath)) return;

  const libsConfig = getConfig('libraries');
  const exactLibs = libsConfig[type] || [];
  const mixedLibs = libsConfig.mixed || [];
  const targetLib = exactLibs[0] || mixedLibs[0];

  if (!targetLib) {
    logger.warn(`[downloader] No library configured for type "${type}", skipping file copy`);
    return;
  }

  const destRoot = targetLib.path;

  const EBOOK_EXTS = new Set(['.epub', '.pdf', '.mobi', '.azw3', '.cbz', '.cbr']);
  const AUDIO_EXTS = new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg', '.opus']);
  const targetExts = type === 'audiobook' ? AUDIO_EXTS : EBOOK_EXTS;

  const stat = fs.statSync(savePath);
  let files: string[] = [];

  if (stat.isFile()) {
    files = [savePath];
  } else if (stat.isDirectory()) {
    files = walkDir(savePath).filter((f) => targetExts.has(path.extname(f).toLowerCase()));
  }

  const existingDir = findExistingBookDir(destRoot, metadata) ?? undefined;
  if (existingDir) {
    logger.info(`[downloader] Reusing existing directory: ${existingDir}`);
  }

  let destDir: string | null = null;
  for (const file of files) {
    try {
      const result = await copyOrganize(file, destRoot, metadata, type, pattern, existingDir);
      destDir = destDir || result.destDir;
    } catch (err) {
      logger.warn(`[downloader] Could not copy ${file}:`, (err as Error).message);
    }
  }

  if (destDir && metadata?.title) {
    try {
      const {
        wishlist,
        wishlistFormat,
        wishlistDownloadTriggered,
        wishlistTriggeredAt,
        ...cleanMeta
      } = metadata;
      writeBookMeta(destDir, cleanMeta as Partial<BookMetadata> & Record<string, unknown>);
      logger.info(`[downloader] Wrote metadata.json to ${destDir}`);
    } catch (err) {
      logger.warn(`[downloader] Could not write metadata.json:`, (err as Error).message);
    }
  }
}

function applyPathMap(savePath: string | null, clientConf: ClientConfig | null): string | null {
  const from = clientConf?.pathMap?.from;
  const to = clientConf?.pathMap?.to;
  if (from && to && savePath && savePath.startsWith(from)) {
    return to + savePath.slice(from.length);
  }
  return savePath;
}

function resolveSavePathMapped(
  torrent: TorrentInfo,
  clientConf: ClientConfig | null,
): string | null {
  const base = torrent.savePath;
  if (!base) return null;
  if (torrent.name) {
    const raw = path.join(base, torrent.name);
    const mapped = applyPathMap(raw, clientConf);
    if (mapped && fs.existsSync(mapped)) return mapped;
  }
  const mappedBase = applyPathMap(base, clientConf);
  if (mappedBase && fs.existsSync(mappedBase)) return mappedBase;
  return null;
}

export async function retriggerOrganize(dl: DownloadEntry): Promise<void> {
  const appConfig = getConfig('app');
  const pattern =
    (appConfig.renamePatterns as unknown as Record<string, string>)?.[dl.type] ||
    '{author}/{title}';

  let savePath: string | null = dl.destination || null;

  const clientConf = getActiveClientConfig();
  if (clientConf && dl.hash) {
    try {
      const client = createClient(clientConf);
      const torrent = await client.getTorrent(dl.hash);
      if (torrent) savePath = resolveSavePathMapped(torrent, clientConf) || savePath;
    } catch {
      /* fall back to dl.destination */
    }
  }
  savePath = applyPathMap(savePath, clientConf);

  if (!savePath) throw new Error('Save path unknown — torrent may have been removed from client');

  const metadata = resolveMetadata(dl);
  if (!metadata || !metadata.title) throw new Error('No metadata available for this download');

  await organizeDownloadedFiles(savePath, metadata, dl.type, pattern);
}

function walkDir(dir: string): string[] {
  let results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    /* ignore permission errors */
  }
  return results;
}

// Start polling interval
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs = 5000): void {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      await pollDownloads();
    } catch (err) {
      logger.error('[downloader] Poll error:', (err as Error).message);
    }
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
