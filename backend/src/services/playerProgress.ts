import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/manager';

export interface ProgressEntry {
  position: number;
  fileIndex: number;
  percentage: number;
  chapterTitle?: string;
  snippet?: string; // transcript text at current position (for sync popup)
  completed?: boolean;
  updatedAt: number;
}

const FILENAME = 'player-progress.json';

// Legacy centralized store (fallback for migration)
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
const LEGACY_FILE = path.join(CONFIG_DIR, 'player-progress.json');

function readLegacyStore(): Record<string, ProgressEntry> {
  try {
    return JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function getProgress(bookPath: string): ProgressEntry | null {
  const file = path.join(bookPath, FILENAME);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Fallback to legacy centralized store
    return readLegacyStore()[bookPath] ?? null;
  }
}

export function saveProgress(bookPath: string, entry: ProgressEntry): void {
  fs.writeFileSync(path.join(bookPath, FILENAME), JSON.stringify(entry, null, 2));
  // Update in-memory cache directly so next getAllProgress call reflects the change immediately
  if (allProgressCache) allProgressCache[bookPath] = entry;
}

function findProgressFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === FILENAME) {
        results.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...findProgressFiles(path.join(dir, entry.name), maxDepth, depth + 1));
      }
    }
  } catch {}
  return results;
}

const ALL_PROGRESS_TTL_MS = 5 * 60 * 1000;
let allProgressCache: Record<string, ProgressEntry> | null = null;
let allProgressCacheAt = 0;

export function getAllProgress(): Record<string, ProgressEntry> {
  if (allProgressCache && Date.now() - allProgressCacheAt < ALL_PROGRESS_TTL_MS) {
    return allProgressCache;
  }

  const result: Record<string, ProgressEntry> = {};

  const librariesConfig = getConfig('libraries') as unknown as Record<
    string,
    Array<{ path: string }>
  >;
  const roots = new Set<string>();
  for (const libs of Object.values(librariesConfig)) {
    for (const lib of libs) roots.add(lib.path);
  }

  for (const root of roots) {
    for (const file of findProgressFiles(root, 4)) {
      const bookPath = path.dirname(file);
      try {
        result[bookPath] = JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch {}
    }
  }

  allProgressCache = result;
  allProgressCacheAt = Date.now();
  return result;
}
