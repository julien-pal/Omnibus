import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/manager';

export interface ReaderProgressEntry {
  cfi?: string; // epub CFI location
  page?: number; // PDF page number
  chapterTitle?: string;
  snippet?: string; // text extract at current position (for sync popup)
  percentage: number; // 0-1
  completed?: boolean;
  updatedAt: number;
}

function progressFilename(profileId: string): string {
  return profileId === 'default' ? 'reader-progress.json' : `reader-progress-${profileId}.json`;
}

// Legacy centralized store (fallback for migration)
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
const LEGACY_FILE = path.join(CONFIG_DIR, 'reader-progress.json');

function readLegacyStore(): Record<string, ReaderProgressEntry> {
  try {
    return JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function getProgress(bookPath: string, profileId = 'default'): ReaderProgressEntry | null {
  const file = path.join(bookPath, progressFilename(profileId));
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Fallback to legacy centralized store (only for default profile)
    if (profileId === 'default') return readLegacyStore()[bookPath] ?? null;
    return null;
  }
}

export function saveProgress(bookPath: string, entry: ReaderProgressEntry, profileId = 'default'): void {
  fs.writeFileSync(path.join(bookPath, progressFilename(profileId)), JSON.stringify(entry, null, 2));
  const cache = allProgressCaches.get(profileId);
  if (cache) cache.data[bookPath] = entry;
}

function findProgressFiles(dir: string, filename: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === filename) {
        results.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...findProgressFiles(path.join(dir, entry.name), filename, maxDepth, depth + 1));
      }
    }
  } catch {}
  return results;
}

const ALL_PROGRESS_TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  data: Record<string, ReaderProgressEntry>;
  at: number;
}
const allProgressCaches = new Map<string, CacheEntry>();

export function getAllProgress(profileId = 'default'): Record<string, ReaderProgressEntry> {
  const cached = allProgressCaches.get(profileId);
  if (cached && Date.now() - cached.at < ALL_PROGRESS_TTL_MS) {
    return cached.data;
  }

  const result: Record<string, ReaderProgressEntry> = {};
  const filename = progressFilename(profileId);

  const librariesConfig = getConfig('libraries') as unknown as Record<
    string,
    Array<{ path: string }>
  >;
  const roots = new Set<string>();
  for (const libs of Object.values(librariesConfig)) {
    for (const lib of libs) roots.add(lib.path);
  }

  for (const root of roots) {
    for (const file of findProgressFiles(root, filename, 4)) {
      const bookPath = path.dirname(file);
      try {
        result[bookPath] = JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch {}
    }
  }

  allProgressCaches.set(profileId, { data: result, at: Date.now() });
  return result;
}
