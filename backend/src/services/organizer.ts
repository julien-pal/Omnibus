import fs from 'fs';
import path from 'path';
import { BookMetadata, OrganizeResult } from '../types';
import logger from '../lib/logger';
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAILING_DOTS_SPACES = /[. ]+$/;

export function sanitize(str: string | undefined | null): string {
  if (!str) return 'Unknown';
  return str.replace(ILLEGAL_CHARS, '').replace(TRAILING_DOTS_SPACES, '').trim() || 'Unknown';
}

export function applyPattern(pattern: string, metadata: Partial<BookMetadata>): string {
  const author = sanitize(metadata.author as string | undefined);
  const title = sanitize(metadata.title);
  const series = sanitize((metadata.series as string | undefined) || '');
  const year = metadata.year ? String(metadata.year) : '';

  return pattern
    .replace('{author}', author)
    .replace('{title}', title)
    .replace('{series}', series || title)
    .replace('{year}', year);
}

/**
 * Moves a file to a destination based on pattern.
 */
export async function organize(
  filePath: string,
  destinationRoot: string,
  metadata: Partial<BookMetadata>,
  type: string,
  pattern: string,
): Promise<OrganizeResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file not found: ${filePath}`);
  }

  const relativePath = applyPattern(pattern, metadata);
  const ext = path.extname(filePath);
  const fileName = sanitize(path.basename(filePath, ext)) + ext;
  const destDir = path.join(destinationRoot, relativePath);
  const destFile = path.join(destDir, fileName);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // If dest already exists, append a counter
  let finalPath = destFile;
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(destDir, `${sanitize(path.basename(filePath, ext))} (${counter})${ext}`);
    counter++;
  }

  fs.renameSync(filePath, finalPath);
  logger.info(`[organizer] Moved ${filePath} -> ${finalPath}`);
  return { filePath: finalPath, destDir };
}

/**
 * Copies a file to a destination based on pattern (keeps original for seeding).
 */
export async function copyOrganize(
  filePath: string,
  destinationRoot: string,
  metadata: Partial<BookMetadata>,
  type: string,
  pattern: string,
  destDirOverride?: string,
): Promise<OrganizeResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file not found: ${filePath}`);
  }

  const relativePath = applyPattern(pattern, metadata);
  const ext = path.extname(filePath);
  const fileName = sanitize(path.basename(filePath, ext)) + ext;
  const destDir = destDirOverride ?? path.join(destinationRoot, relativePath);
  const destFile = path.join(destDir, fileName);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let finalPath = destFile;
  let counter = 1;
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(destDir, `${sanitize(path.basename(filePath, ext))} (${counter})${ext}`);
    counter++;
  }

  fs.copyFileSync(filePath, finalPath);
  logger.info(`[organizer] Copied ${filePath} -> ${finalPath}`);
  return { filePath: finalPath, destDir };
}
