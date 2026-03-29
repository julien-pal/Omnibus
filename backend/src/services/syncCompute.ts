import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WhisperConfig } from '../types';
import { transcribeClip, transcribeFile, extractClip, ensureModelLoaded } from './whisperClient';
import {
  extractEpubText,
  getTextAtCfi,
  getTextAtPercentage,
  charPositionToPercentage,
  generateCfiFromMatchedText,
  EpubTextMap,
} from './epubText';
import logger from '../lib/logger';

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TranscriptWord {
  text: string; // phrase/segment text
  start: number;
  end: number;
  globalStart: number; // start offset in seconds from beginning of book (multi-file)
  fileName?: string; // source audio file name
}

export interface AudioTranscript {
  bookPath: string;
  builtAt: number;
  files: Record<string, TranscriptWord[]>; // filename -> words
  totalDuration: number;
  complete: boolean; // true only when all audio files have been transcribed
  syncMap?: SyncMapEntry[]; // pre-computed audio↔ebook alignment
}

export interface SyncResult {
  percentage: number; // 0-1 in target format
  spineHref?: string; // for audio→ebook: the spine item href
  audioSeconds?: number; // for ebook→audio: seconds from start of book
  fileIndex?: number; // for ebook→audio: which file
  fileSeconds?: number; // for ebook→audio: seconds within the file
  confidence: 'high' | 'low';
  matchedText?: string;
  // Debug fields (transcript-to-ebook)
  searchPhrase?: string; // phrase extracted from transcript and searched
  matchedScore?: number; // raw fuzzy match score (0-1)
  spineIndex?: number; // 0-based spine index of matched item
  charOffsetInItem?: number; // char offset within the matched spine item's plain text
  cfi?: string; // computed CFI (spine-level)
}

/** Pre-computed alignment entry: maps audio time ↔ ebook position */
export interface SyncMapEntry {
  audioSeconds: number; // global audio position in seconds
  ebookPct: number; // ebook percentage 0-1
  spineHref?: string; // epub spine item
  score: number; // fuzzy match confidence at build time
}

// ── Transcript cache / storage ─────────────────────────────────────────────────

function transcriptPath(bookPath: string): string {
  return path.join(bookPath, '.omnibus_transcript.json');
}

export function hasTranscript(bookPath: string): boolean {
  const t = loadTranscript(bookPath);
  return t?.complete === true;
}

export function loadTranscript(bookPath: string): AudioTranscript | null {
  const p = transcriptPath(bookPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as AudioTranscript;
  } catch {
    return null;
  }
}

function saveTranscript(t: AudioTranscript): void {
  fs.writeFileSync(transcriptPath(t.bookPath), JSON.stringify(t));
}

/** Flatten all files into a single word array sorted by globalStart. */
export function flattenTranscriptWords(transcript: AudioTranscript): TranscriptWord[] {
  return Object.entries(transcript.files)
    .flatMap(([fileName, words]) => words.map((w) => ({ ...w, fileName })))
    .sort((a, b) => a.globalStart - b.globalStart);
}

// ── Chapter alignment ────────────────────────────────────────────────────────

interface ChapterAlignment {
  spineIndices: number[]; // which spine items belong to this chapter region
  wordStart: number; // first word index in flattened transcript
  wordEnd: number; // last word index (exclusive) in flattened transcript
}

/**
 * Build a rough chapter-level alignment between transcript segments and spine items.
 * Uses a monotonic walking approach: divide the transcript into N equal chunks
 * (where N = number of spine items) and assign each chunk to the corresponding spine item.
 * Then widen search to ±1 spine item to handle boundary overlaps.
 */
function alignChapters(allWords: TranscriptWord[], epubMap: EpubTextMap): ChapterAlignment[] {
  const nSpine = epubMap.items.length;
  const nWords = allWords.length;
  if (nSpine === 0 || nWords === 0) return [];

  // Simple proportional assignment: divide words across spine items by text proportion
  const alignments: ChapterAlignment[] = [];
  let wordCursor = 0;

  for (let s = 0; s < nSpine; s++) {
    const item = epubMap.items[s];
    const textProportion = item.text.length / Math.max(epubMap.totalChars, 1);
    const wordsForThisChapter = Math.max(1, Math.round(textProportion * nWords));
    const wordStart = wordCursor;
    const wordEnd = Math.min(nWords, wordCursor + wordsForThisChapter);

    // Search in this spine item ± 1 neighbor for better matching
    const searchSpine: number[] = [];
    if (s > 0) searchSpine.push(s - 1);
    searchSpine.push(s);
    if (s < nSpine - 1) searchSpine.push(s + 1);

    alignments.push({
      spineIndices: searchSpine,
      wordStart,
      wordEnd,
    });

    wordCursor = wordEnd;
  }

  // Ensure the last alignment covers remaining words
  if (alignments.length > 0) {
    alignments[alignments.length - 1].wordEnd = nWords;
  }

  return alignments;
}

/**
 * Given a word index, find which chapter alignment it belongs to.
 */
function findChapterForWord(
  alignments: ChapterAlignment[],
  wordIdx: number,
): ChapterAlignment | null {
  for (const a of alignments) {
    if (wordIdx >= a.wordStart && wordIdx < a.wordEnd) return a;
  }
  return alignments.length > 0 ? alignments[alignments.length - 1] : null;
}

// ── Pre-computed sync map ────────────────────────────────────────────────────

const SYNC_MAP_INTERVAL = 30; // one entry every ~30 seconds of audio

/**
 * Build a sync map that aligns transcript segments to epub positions.
 * Uses chapter-scoped matching for better accuracy and performance.
 * Called once after transcript build completes. Results are cached in the transcript file.
 */
export function buildSyncMap(bookPath: string, epubPath: string): SyncMapEntry[] {
  const transcript = loadTranscript(bookPath);
  if (!transcript || !transcript.complete) return [];

  const allWords = flattenTranscriptWords(transcript);
  if (allWords.length === 0) return [];

  const epubMap = extractEpubText(epubPath);
  if (epubMap.totalChars === 0) return [];

  logger.info(
    `[syncMap] building for ${bookPath}: ${allWords.length} segments, ${epubMap.items.length} spine items`,
  );

  // Build chapter alignment to scope searches
  const chapters = alignChapters(allWords, epubMap);
  logger.info(`[syncMap] chapter alignments: ${chapters.length} regions`);

  const entries: SyncMapEntry[] = [];
  let nextTime = 0;

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    if (word.globalStart < nextTime && i < allWords.length - 1) continue;

    // Gather ~3 consecutive segments for a longer phrase
    const start = Math.max(0, i - 1);
    const end = Math.min(allWords.length, i + 3);
    const phrase = allWords
      .slice(start, end)
      .map((w) => w.text)
      .join(' ');
    if (!phrase.trim()) continue;

    // Search only in relevant spine items (chapter-scoped)
    const chapter = findChapterForWord(chapters, i);
    const searchItems = chapter
      ? chapter.spineIndices.map((si) => epubMap.items[si]).filter(Boolean)
      : epubMap.items; // fallback: search all

    let bestScore = 0;
    let bestCharPos = 0;
    let bestHref: string | undefined;

    for (const item of searchItems) {
      const { offset, score } = fuzzySearch(item.text, phrase);
      if (score > bestScore && offset >= 0) {
        bestScore = score;
        bestCharPos = item.charStart + offset;
        bestHref = item.absoluteHref;
      }
    }

    // If chapter-scoped search failed, try full search as fallback
    if (bestScore < 0.4 && chapter && searchItems.length < epubMap.items.length) {
      for (const item of epubMap.items) {
        if (chapter.spineIndices.includes(epubMap.items.indexOf(item))) continue;
        const { offset, score } = fuzzySearch(item.text, phrase);
        if (score > bestScore && offset >= 0) {
          bestScore = score;
          bestCharPos = item.charStart + offset;
          bestHref = item.absoluteHref;
        }
      }
    }

    // If still no match, split phrase on punctuation and try each sub-phrase
    if (bestScore < 0.4) {
      const subPhrases = phrase
        .split(/[\p{P}]+/u)
        .map((s) => s.trim())
        .filter((s) => s.split(/\s+/).length >= 3);
      for (const sub of subPhrases) {
        for (const item of searchItems) {
          const { offset, score } = fuzzySearch(item.text, sub);
          if (score > bestScore && offset >= 0) {
            bestScore = score;
            bestCharPos = item.charStart + offset;
            bestHref = item.absoluteHref;
          }
        }
        if (bestScore >= 0.4) break;
      }
    }

    if (bestScore >= 0.4) {
      entries.push({
        audioSeconds: word.globalStart,
        ebookPct: charPositionToPercentage(epubMap, bestCharPos),
        spineHref: bestHref,
        score: bestScore,
      });
    }

    nextTime = word.globalStart + SYNC_MAP_INTERVAL;
  }

  logger.info(`[syncMap] built ${entries.length} entries`);

  // Save into transcript
  transcript.syncMap = entries;
  saveTranscript(transcript);

  return entries;
}

/**
 * Lookup the sync map to convert between audio and ebook positions.
 * Uses linear interpolation between the two nearest entries.
 */
export function lookupSyncMap(
  bookPath: string,
  direction: 'audio-to-ebook' | 'ebook-to-audio',
  value: number, // audioPct (0-1) for audio-to-ebook, ebookPct (0-1) for ebook-to-audio
): SyncResult {
  const transcript = loadTranscript(bookPath);
  const map = transcript?.syncMap;
  if (!map || map.length === 0) {
    return { percentage: value, confidence: 'low' };
  }

  if (direction === 'audio-to-ebook') {
    const targetSeconds = value * (transcript!.totalDuration || 1);

    // Find bracketing entries
    let lo = 0;
    let hi = map.length - 1;
    for (let i = 0; i < map.length; i++) {
      if (map[i].audioSeconds <= targetSeconds) lo = i;
      if (map[i].audioSeconds >= targetSeconds) {
        hi = i;
        break;
      }
    }

    if (lo === hi || map[lo].audioSeconds === map[hi].audioSeconds) {
      return {
        percentage: map[lo].ebookPct,
        spineHref: map[lo].spineHref,
        confidence: map[lo].score >= 0.7 ? 'high' : 'low',
      };
    }

    // Linear interpolation
    const t =
      (targetSeconds - map[lo].audioSeconds) / (map[hi].audioSeconds - map[lo].audioSeconds);
    const ebookPct = map[lo].ebookPct + t * (map[hi].ebookPct - map[lo].ebookPct);
    const nearestEntry = t < 0.5 ? map[lo] : map[hi];

    return {
      percentage: ebookPct,
      spineHref: nearestEntry.spineHref,
      confidence: nearestEntry.score >= 0.7 ? 'high' : 'low',
    };
  } else {
    // ebook-to-audio: find entries by ebookPct
    const sorted = [...map].sort((a, b) => a.ebookPct - b.ebookPct);
    let lo = 0;
    let hi = sorted.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].ebookPct <= value) lo = i;
      if (sorted[i].ebookPct >= value) {
        hi = i;
        break;
      }
    }

    let audioSeconds: number;
    let confidence: 'high' | 'low';
    if (lo === hi || sorted[lo].ebookPct === sorted[hi].ebookPct) {
      audioSeconds = sorted[lo].audioSeconds;
      confidence = sorted[lo].score >= 0.7 ? 'high' : 'low';
    } else {
      const t = (value - sorted[lo].ebookPct) / (sorted[hi].ebookPct - sorted[lo].ebookPct);
      audioSeconds =
        sorted[lo].audioSeconds + t * (sorted[hi].audioSeconds - sorted[lo].audioSeconds);
      const nearestEntry = t < 0.5 ? sorted[lo] : sorted[hi];
      confidence = nearestEntry.score >= 0.7 ? 'high' : 'low';
    }

    const percentage =
      transcript!.totalDuration > 0 ? audioSeconds / transcript!.totalDuration : value;

    // Find file index and offset within file.
    // Use first word's globalStart of each file — robust against empty files.
    let fileIndex = 0;
    let fileSeconds = audioSeconds;
    const filenames = Object.keys(transcript!.files);
    if (filenames.length > 0) {
      const fileStarts: Array<{ audioIdx: number; globalStart: number }> = [];
      for (let i = 0; i < filenames.length; i++) {
        const words = transcript!.files[filenames[i]];
        if (words && words.length > 0) {
          fileStarts.push({ audioIdx: i, globalStart: words[0].globalStart });
        }
      }
      let matched = fileStarts[0] ?? null;
      for (const fs of fileStarts) {
        if (fs.globalStart <= audioSeconds) matched = fs;
        else break;
      }
      if (matched) {
        fileIndex = matched.audioIdx;
        fileSeconds = audioSeconds - matched.globalStart;
      }
      logger.info(
        `[syncMap:e→a] audioSeconds=${audioSeconds.toFixed(1)} → file ${fileIndex} (${filenames[fileIndex]}) @ ${fileSeconds.toFixed(1)}s`,
      );
    }

    return {
      percentage,
      audioSeconds,
      fileIndex,
      fileSeconds,
      confidence,
    };
  }
}

// ── In-progress build tracking ─────────────────────────────────────────────────

export interface BuildProgress {
  total: number;
  done: number[]; // file indices fully transcribed
  inProgress: number[]; // file indices currently being transcribed
  fileProgress: Record<number, number>; // fileIndex -> seconds processed so far
  fileErrors: Record<number, string>; // fileIndex -> error message
}

const buildInProgress = new Map<string, boolean>();
const buildProgress = new Map<string, BuildProgress>();
const buildErrors = new Map<string, string>();

export function isBuildInProgress(bookPath: string): boolean {
  return buildInProgress.get(bookPath) === true;
}

export function getBuildProgress(bookPath: string): BuildProgress | null {
  return buildProgress.get(bookPath) ?? null;
}

export function getBuildError(bookPath: string): string | null {
  return buildErrors.get(bookPath) ?? null;
}

export function clearBuildError(bookPath: string): void {
  buildErrors.delete(bookPath);
}

export function getActiveBuilds(): string[] {
  return Array.from(buildInProgress.keys());
}

// ── Audio duration helper ──────────────────────────────────────────────────────

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      filePath,
    ]);
    const data = JSON.parse(stdout) as { format?: { duration?: string } };
    return parseFloat(data.format?.duration || '0') || 0;
  } catch {
    return 0;
  }
}

// ── Fuzzy text matching ────────────────────────────────────────────────────────

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein edit distance between two strings.
 * Used for per-word fuzzy comparison (handles ASR errors like "their"/"there").
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length,
    lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Optimize: if lengths differ by more than max tolerance, skip full computation
  if (Math.abs(la - lb) > 2) return Math.abs(la - lb);

  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/**
 * Check if two words are a fuzzy match.
 * Exact match = 1.0, edit distance 1 = 0.8, edit distance 2 = 0.6.
 * Short words (<=3 chars) require exact match to avoid false positives.
 */
function wordScore(a: string, b: string): number {
  if (a === b) return 1.0;
  // Short words: require exact match (e.g. "a", "an", "the", "to")
  if (a.length <= 3 || b.length <= 3) return 0;
  const dist = editDistance(a, b);
  if (dist === 1) return 0.8;
  if (dist === 2) return 0.6;
  return 0;
}

/**
 * Split text into words and track the char offset of each word in the original string.
 * Returns [normalizedWord, charOffsetInOriginal][].
 */
function splitWithOffsets(original: string): Array<{ word: string; offset: number }> {
  const normalized = normalizeText(original);
  const words = normalized.split(' ').filter(Boolean);

  // Map normalized words back to approximate positions in original text
  const result: Array<{ word: string; offset: number }> = [];
  const lowerOriginal = original.toLowerCase();
  let searchFrom = 0;

  for (const word of words) {
    // Find this word's approximate position in the original text
    let pos = lowerOriginal.indexOf(word, searchFrom);
    if (pos === -1) {
      // Fallback: search from beginning
      pos = lowerOriginal.indexOf(word);
    }
    if (pos === -1) {
      // Last resort: use searchFrom as position
      pos = searchFrom;
    }
    result.push({ word, offset: pos });
    searchFrom = pos + word.length;
  }

  return result;
}

/**
 * Find the best match position of `needle` inside `haystack` using a sliding window
 * with Levenshtein-tolerant word matching.
 * Returns the char offset in haystack of the best match, or -1 if confidence is too low.
 */
function fuzzySearch(haystack: string, needle: string): { offset: number; score: number } {
  const nn = normalizeText(needle);
  if (!nn || !haystack) return { offset: -1, score: 0 };

  const needleWords = nn.split(' ').filter(Boolean);
  if (needleWords.length === 0) return { offset: -1, score: 0 };

  const haystackWithOffsets = splitWithOffsets(haystack);
  if (haystackWithOffsets.length === 0) return { offset: -1, score: 0 };

  const nLen = needleWords.length;
  let bestScore = 0;
  let bestIdx = -1;

  for (let i = 0; i <= haystackWithOffsets.length - nLen; i++) {
    let totalScore = 0;
    for (let j = 0; j < nLen; j++) {
      totalScore += wordScore(haystackWithOffsets[i + j].word, needleWords[j]);
    }
    const score = totalScore / nLen;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore < 0.4) return { offset: -1, score: bestScore };

  // Use the actual tracked char offset instead of ratio approximation
  const offset = haystackWithOffsets[bestIdx].offset;
  return { offset, score: bestScore };
}

// ── Transcript → Ebook sync (use pre-built transcript to find ebook position) ──

/**
 * Given an audio percentage (0-1), find the corresponding phrase in the pre-built
 * transcript and fuzzy-search it in the epub to get a spine position.
 *
 * This is the fast path (no live transcription) used when syncing the ebook
 * reader to the current audio position.
 */
export function computeTranscriptToEbook(
  bookPath: string,
  audioPct: number,
  epubPath: string,
  minScore = 0.8,
  hintPct?: number, // expected ebook position (0-1); restricts search to ±searchWindow
  searchWindow = 0.15,
  audioFileIndex?: number, // file index in the book's audio file list (more accurate than audioPct)
  audioSeconds?: number, // playback position within that file in seconds
): SyncResult {
  const transcript = loadTranscript(bookPath);
  const allWords = transcript ? flattenTranscriptWords(transcript) : [];
  logger.info(
    `[sync:t→e] audioPct=${(audioPct * 100).toFixed(1)}% minScore=${minScore} hintPct=${hintPct != null ? (hintPct * 100).toFixed(1) + '%' : 'none'}`,
  );
  if (!transcript || allWords.length === 0) {
    logger.info(`[sync:t→e] no transcript — returning low confidence`);
    return { percentage: audioPct, confidence: 'low' };
  }
  logger.info(
    `[sync:t→e] transcript: ${allWords.length} segments, duration=${transcript.totalDuration.toFixed(1)}s`,
  );

  // Find the segment closest to the target time, then gather a few neighbours
  // to build a longer phrase (~50 words) for a more reliable match.
  // Prefer fileIndex+seconds (accurate) over audioPct*totalDuration (approximate).
  let targetSeconds: number;
  if (audioFileIndex != null && audioSeconds != null) {
    const fileNames = Object.keys(transcript.files);
    const fileName = fileNames[audioFileIndex];
    const fileWords = fileName ? (transcript.files[fileName] ?? []) : [];
    const fileStartGlobal = fileWords.length > 0 ? fileWords[0].globalStart : 0;
    targetSeconds = fileStartGlobal + audioSeconds;
    logger.info(
      `[sync:t→e] using fileIndex=${audioFileIndex} seconds=${audioSeconds.toFixed(1)} → targetSeconds=${targetSeconds.toFixed(1)}`,
    );
  } else {
    targetSeconds = audioPct * transcript.totalDuration;
  }
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < allWords.length; i++) {
    const diff = Math.abs(allWords[i].globalStart - targetSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }

  // Gather a small window of segments around the target to have enough text
  const windowStart = Math.max(0, closestIdx - 1);
  const windowEnd = Math.min(allWords.length, closestIdx + 4);
  const rawWindow = allWords
    .slice(windowStart, windowEnd)
    .map((w) => w.text)
    .join(' ');

  // Strip typographic special chars (quotes, guillemets) that inflate fuzzy-search noise
  const cleanedWindow = rawWindow
    .replace(/[«»""''‹›„"'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Split on sentence boundary (.) and keep only sentences with ≥4 words.
  // Prefer the sentence that overlaps the closest segment (contains the target text).
  const targetSegText = allWords[closestIdx].text
    .replace(/[«»""''‹›„"'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = cleanedWindow
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

  // Pick the sentence that best overlaps the target segment text (prefer longest overlap).
  let searchPhrase = sentences[0] ?? cleanedWindow;
  let bestOverlap = 0;
  for (const s of sentences) {
    // Count how many words of the target segment appear in this sentence
    const targetWords = targetSegText.toLowerCase().split(/\s+/);
    const sentLower = s.toLowerCase();
    const overlap = targetWords.filter((w) => w.length > 3 && sentLower.includes(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      searchPhrase = s;
    }
  }

  // Fallback: if no sentence matched well, use the target segment text directly
  if (bestOverlap === 0 && targetSegText.split(/\s+/).length >= 4) {
    searchPhrase = targetSegText.replace(/\.$/, '').trim();
  }

  logger.info(
    `[sync:t→e] target=${targetSeconds.toFixed(1)}s → seg[${closestIdx}] @${allWords[closestIdx].globalStart.toFixed(1)}s`,
  );
  logger.info(`[sync:t→e] targetSeg: "${targetSegText.slice(0, 100)}"`);
  logger.info(
    `[sync:t→e] searchPhrase (${sentences.length} candidates, overlap=${bestOverlap}): "${searchPhrase.slice(0, 120)}"`,
  );

  const epubMap = extractEpubText(epubPath);
  logger.info(`[sync:t→e] epub: ${epubMap.items.length} spine items, ${epubMap.totalChars} chars`);

  // If a position hint is provided, restrict search to spine items within ±searchWindow
  const minChar = hintPct != null ? Math.max(0, (hintPct - searchWindow) * epubMap.totalChars) : 0;
  const maxChar =
    hintPct != null
      ? Math.min(epubMap.totalChars, (hintPct + searchWindow) * epubMap.totalChars)
      : Infinity;
  const candidateItems =
    hintPct != null
      ? epubMap.items.filter(
          (item) => item.charStart + item.text.length >= minChar && item.charStart <= maxChar,
        )
      : epubMap.items;
  logger.info(
    `[sync:t→e] searching ${candidateItems.length}/${epubMap.items.length} spine items${hintPct != null ? ` (hint ±${(searchWindow * 100).toFixed(0)}%)` : ''}`,
  );

  let bestScore = 0;
  let bestCharPos = 0;
  let bestHref: string | undefined;
  let bestMatchedText = '';
  let bestSearchPhrase = searchPhrase;
  let bestSpineIndex = -1;
  let bestCharOffsetInItem = 0;

  for (let itemIdx = 0; itemIdx < candidateItems.length; itemIdx++) {
    const item = candidateItems[itemIdx];
    // Search with a single clean sentence phrase
    const { offset, score } = fuzzySearch(item.text, searchPhrase);
    if (score > bestScore && offset >= 0) {
      bestScore = score;
      bestCharPos = item.charStart + offset;
      bestHref = item.absoluteHref;
      bestMatchedText = item.text.slice(offset, offset + searchPhrase.length);
      bestSearchPhrase = searchPhrase;
      // Find true spine index (in full epubMap, not filtered candidateItems)
      bestSpineIndex = epubMap.items.indexOf(item);
      bestCharOffsetInItem = offset;
    }
  }

  logger.info(
    `[sync:t→e] best match: score=${bestScore.toFixed(2)} href=${bestHref ?? 'none'} spineIdx=${bestSpineIndex} charOffset=${bestCharOffsetInItem} text="${bestMatchedText.slice(0, 80)}"`,
  );

  if (bestScore < minScore) {
    logger.info(
      `[sync:t→e] score ${bestScore.toFixed(2)} < minScore ${minScore} — returning low confidence`,
    );
    return {
      percentage: audioPct,
      confidence: 'low',
      matchedText: searchPhrase.slice(0, 150),
      searchPhrase: searchPhrase.slice(0, 200),
      matchedScore: bestScore,
    };
  }

  // Compute full intra-document CFI; fall back to spine-level if DOM walk fails
  const cfi =
    generateCfiFromMatchedText(epubPath, bestSpineIndex, bestMatchedText) ??
    `epubcfi(/6/${(bestSpineIndex + 1) * 2}!)`;

  const percentage = charPositionToPercentage(epubMap, bestCharPos);
  logger.info(
    `[sync:t→e] result: percentage=${(percentage * 100).toFixed(1)}% spineHref=${bestHref} cfi=${cfi}`,
  );
  return {
    percentage,
    spineHref: bestHref,
    confidence: 'high',
    matchedText: bestMatchedText.slice(0, 200),
    searchPhrase: bestSearchPhrase.slice(0, 200),
    matchedScore: bestScore,
    spineIndex: bestSpineIndex,
    charOffsetInItem: bestCharOffsetInItem,
    cfi,
  };
}

// ── Audio → Ebook sync ─────────────────────────────────────────────────────────

/**
 * Given a position in the audio (file path + time offset in seconds),
 * transcribe a ~30s clip and find it in the EPUB text.
 */
export async function computeAudioToEbook(
  audioFilePath: string,
  audioSeconds: number,
  epubPath: string,
  config: WhisperConfig,
): Promise<SyncResult> {
  const clipDuration = 30;
  const startSec = Math.max(0, audioSeconds - 5); // small lookback

  const [transcript, epubMap] = await Promise.all([
    transcribeClip(audioFilePath, startSec, clipDuration, config),
    Promise.resolve(extractEpubText(epubPath)),
  ]);

  if (!transcript.text.trim()) {
    return { percentage: 0, confidence: 'low' };
  }

  // Search through all spine items
  let bestScore = 0;
  let bestCharPos = 0;
  let bestHref: string | undefined;

  for (const item of epubMap.items) {
    const { offset, score } = fuzzySearch(item.text, transcript.text);
    if (score > bestScore && offset >= 0) {
      bestScore = score;
      bestCharPos = item.charStart + offset;
      bestHref = item.absoluteHref;
    }
  }

  if (bestScore < 0.4) {
    return { percentage: 0, confidence: 'low', matchedText: transcript.text.slice(0, 100) };
  }

  const percentage = charPositionToPercentage(epubMap, bestCharPos);
  return {
    percentage,
    spineHref: bestHref,
    confidence: bestScore >= 0.7 ? 'high' : 'low',
    matchedText: transcript.text.slice(0, 100),
  };
}

// ── Build full audiobook transcript ───────────────────────────────────────────

const CHUNK_DURATION = 300; // 5-minute chunks for granular progress

export async function buildTranscript(
  bookPath: string,
  audioFiles: Array<{ path: string }>,
  config: WhisperConfig,
  epubPath?: string,
): Promise<void> {
  if (buildInProgress.get(bookPath)) return;
  buildInProgress.set(bookPath, true);
  buildErrors.delete(bookPath);

  logger.info(`[transcript] starting build for ${bookPath}`);
  logger.info(
    `[transcript] ${audioFiles.length} files, model=${config.model}, concurrency=${config.concurrency}`,
  );

  // Pre-populate done list with already-transcribed files for accurate progress display
  const existingCheck = loadTranscript(bookPath);
  const alreadyDone = existingCheck?.files
    ? audioFiles.reduce<number[]>((acc, f, i) => {
        if (existingCheck.files[path.basename(f.path)]) acc.push(i);
        return acc;
      }, [])
    : [];

  const progress: BuildProgress = {
    total: audioFiles.length,
    done: alreadyDone,
    inProgress: [],
    fileProgress: {},
    fileErrors: {},
  };
  buildProgress.set(bookPath, progress);

  const updateProgress = () =>
    buildProgress.set(bookPath, {
      total: progress.total,
      done: [...progress.done],
      inProgress: [...progress.inProgress],
      fileProgress: { ...progress.fileProgress },
      fileErrors: { ...progress.fileErrors },
    });

  try {
    // Ensure model is loaded once before any parallel work
    const baseUrl = config.baseUrl.replace(/\/$/, '').replace(/localhost/g, '127.0.0.1');
    logger.info(`[transcript] ensuring model loaded at ${baseUrl}`);
    await ensureModelLoaded(baseUrl, config.model || 'whisper-1', config.apiKey);
    logger.info(`[transcript] model ready`);

    // Pre-calculate durations and global offsets sequentially
    logger.info(`[transcript] probing audio durations...`);
    const durations = await Promise.all(audioFiles.map((f) => getAudioDuration(f.path)));
    durations.forEach((d, i) =>
      logger.info(`[transcript] file[${i}] duration=${d.toFixed(1)}s  ${audioFiles[i].path}`),
    );
    const globalOffsets = durations.reduce<number[]>((acc, _, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + durations[i - 1]);
      return acc;
    }, []);

    const totalDuration = durations.reduce((s, d) => s + d, 0);
    const transcriptFiles: Record<string, TranscriptWord[]> = {};

    // Resume: load already-transcribed files from a previous partial run
    const existing = loadTranscript(bookPath);
    if (existing?.files) Object.assign(transcriptFiles, existing.files);
    const resumedCount = Object.keys(transcriptFiles).length;
    if (resumedCount > 0) {
      logger.info(`[transcript] resuming: ${resumedCount} file(s) already done, skipping them`);
    }

    // Build flat chunk queue across all files for maximum parallelism.
    // Each worker picks the next available chunk regardless of which file it belongs to,
    // saturating all Whisper server workers (e.g. NUM_WORKERS=4).
    interface ChunkItem {
      fileIndex: number;
      chunkIndex: number;
      startSec: number;
      endSec: number;
    }

    const chunkQueue: ChunkItem[] = [];
    const fileChunkCounts = new Map<number, number>();
    const failedFiles = new Set<number>();

    for (let i = 0; i < audioFiles.length; i++) {
      const filename = path.basename(audioFiles[i].path);
      // Skip files already transcribed (resume)
      if (transcriptFiles[filename]) {
        logger.info(`[transcript] file[${i}] skipped (already transcribed): ${filename}`);
        if (!progress.done.includes(i)) progress.done.push(i);
        continue;
      }

      const duration = durations[i];
      let offset = 0;
      let chunkIdx = 0;
      while (offset < (duration || 3600)) {
        const end = duration > 0 ? Math.min(offset + CHUNK_DURATION, duration) : offset + CHUNK_DURATION;
        chunkQueue.push({ fileIndex: i, chunkIndex: chunkIdx, startSec: offset, endSec: end });
        offset = end;
        chunkIdx++;
        if (duration > 0 && offset >= duration) break;
        if (duration === 0) break;
      }
      fileChunkCounts.set(i, chunkIdx);
    }

    logger.info(`[transcript] chunk queue: ${chunkQueue.length} chunks across ${fileChunkCounts.size} files`);

    // Per-file chunk results, indexed by chunkIndex for ordered assembly
    const fileChunkResults = new Map<number, Map<number, TranscriptWord[]>>();
    for (const [i] of fileChunkCounts) {
      fileChunkResults.set(i, new Map());
      progress.fileProgress[i] = 0;
    }
    updateProgress();

    const processChunk = async (item: ChunkItem): Promise<void> => {
      const { fileIndex, chunkIndex, startSec, endSec } = item;

      // Skip if this file already failed on a previous chunk
      if (failedFiles.has(fileIndex)) return;

      const file = audioFiles[fileIndex];
      const globalOffset = globalOffsets[fileIndex];

      // Mark file as in-progress (idempotent)
      if (!progress.inProgress.includes(fileIndex)) {
        progress.inProgress.push(fileIndex);
        logger.info(`[transcript] file[${fileIndex}] start: ${file.path} (${durations[fileIndex].toFixed(1)}s)`);
        updateProgress();
      }

      logger.info(
        `[transcript] file[${fileIndex}] chunk[${chunkIndex}]: extracting ${startSec.toFixed(0)}s → ${endSec.toFixed(0)}s`,
      );

      let tmpPath: string;
      try {
        tmpPath = await extractClip(file.path, startSec, endSec - startSec);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[transcript] file[${fileIndex}] chunk[${chunkIndex}] extract ERROR: ${msg}`);
        progress.fileErrors[fileIndex] = msg;
        failedFiles.add(fileIndex);
        updateProgress();
        return;
      }

      try {
        const result = await transcribeFile(tmpPath, config, true);
        logger.info(
          `[transcript] file[${fileIndex}] chunk[${chunkIndex}]: transcribed, words=${result.words.length}, text=${result.text.length}chars`,
        );

        const words: TranscriptWord[] = result.words.map((w) => ({
          text: w.text,
          start: startSec + w.start,
          end: startSec + w.end,
          globalStart: globalOffset + startSec + w.start,
        }));

        fileChunkResults.get(fileIndex)!.set(chunkIndex, words);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[transcript] file[${fileIndex}] chunk[${chunkIndex}] transcribe ERROR: ${msg}`);
        progress.fileErrors[fileIndex] = msg;
        failedFiles.add(fileIndex);
        updateProgress();
        return;
      } finally {
        fs.unlink(tmpPath, () => {});
      }

      // Update progress
      progress.fileProgress[fileIndex] = (progress.fileProgress[fileIndex] || 0) + (endSec - startSec);
      updateProgress();

      // Check if all chunks for this file are now complete
      const completedChunks = fileChunkResults.get(fileIndex)!;
      const totalChunks = fileChunkCounts.get(fileIndex)!;
      if (completedChunks.size === totalChunks) {
        // Assemble words in chunk order
        const fileWords: TranscriptWord[] = [];
        for (let c = 0; c < totalChunks; c++) {
          fileWords.push(...(completedChunks.get(c) || []));
        }

        const filename = path.basename(file.path);
        logger.info(`[transcript] file[${fileIndex}] done: ${fileWords.length} words — saving incrementally`);
        transcriptFiles[filename] = fileWords;
        saveTranscript({
          bookPath,
          builtAt: Date.now(),
          files: transcriptFiles,
          totalDuration,
          complete: false,
        });

        progress.inProgress = progress.inProgress.filter((x) => x !== fileIndex);
        progress.done.push(fileIndex);
        updateProgress();
      }
    };

    // Launch workers that drain the chunk queue in parallel
    const concurrency = Math.max(1, config.concurrency ?? 1);
    const workers = Array.from({ length: Math.min(concurrency, chunkQueue.length) }, async () => {
      while (chunkQueue.length > 0) {
        const item = chunkQueue.shift();
        if (item) await processChunk(item);
      }
    });
    await Promise.all(workers);

    const totalWords = Object.values(transcriptFiles).reduce((n, w) => n + w.length, 0);
    logger.info(
      `[transcript] build complete: ${totalWords} total words across ${Object.keys(transcriptFiles).length} files, duration=${totalDuration.toFixed(1)}s`,
    );
    Object.entries(transcriptFiles).forEach(([f, w]) =>
      logger.info(`[transcript]   ${path.basename(f)}: ${w.length} words`),
    );
    saveTranscript({
      bookPath,
      builtAt: Date.now(),
      files: transcriptFiles,
      totalDuration,
      complete: true,
    });

    // Build sync map if epub path is available
    if (epubPath) {
      try {
        buildSyncMap(bookPath, epubPath);
      } catch (err) {
        logger.error(`[transcript] syncMap build error: ${(err as Error).message}`);
      }
    }

    const failedCount = Object.keys(progress.fileErrors).length;
    if (failedCount > 0) {
      const errMsg = `${failedCount} file(s) failed: ${Object.values(progress.fileErrors).join('; ')}`;
      logger.error(`[transcript] ${errMsg}`);
      buildErrors.set(bookPath, errMsg);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[transcript] fatal error: ${msg}`);
    buildErrors.set(bookPath, msg);
  } finally {
    buildInProgress.delete(bookPath);
    buildProgress.delete(bookPath);
    logger.info(`[transcript] build finished for ${bookPath}`);
  }
}

// ── Ebook → Audio sync ─────────────────────────────────────────────────────────

/**
 * Given a position in the ebook (percentage 0-1),
 * find the matching position in the pre-built audio transcript.
 */
export async function computeEbookToAudio(
  epubPath: string,
  ebookPct: number,
  bookPath: string,
  cfi?: string,
  savedSnippet?: string,
  audioFiles?: Array<{ path: string }>,
): Promise<SyncResult> {
  logger.info(`[sync:e→t] ebookPct=${(ebookPct * 100).toFixed(1)}% cfi=${cfi ?? 'none'}`);
  const transcript = loadTranscript(bookPath);
  const allWords = transcript ? flattenTranscriptWords(transcript) : [];
  if (!transcript || allWords.length === 0) {
    logger.info(`[sync:e→t] no transcript — returning low confidence`);
    return { percentage: ebookPct, confidence: 'low' };
  }
  logger.info(
    `[sync:e→t] transcript: ${allWords.length} segments, duration=${transcript.totalDuration.toFixed(1)}s`,
  );

  // Priority: saved snippet from progress > CFI extraction > percentage fallback
  let snippet = savedSnippet?.trim() ?? '';
  if (snippet) {
    logger.info(`[sync:e→t] using saved snippet (${snippet.length} chars): "${snippet.slice(0, 120)}"`);
  } else if (cfi) {
    snippet = getTextAtCfi(epubPath, cfi, 300);
    logger.info(`[sync:e→t] CFI snippet (${snippet.length} chars): "${snippet.slice(0, 120)}"`);
  }
  if (!snippet) {
    const epubMap = extractEpubText(epubPath);
    snippet = getTextAtPercentage(epubMap, ebookPct, 200);
    const targetChar = Math.floor(ebookPct * epubMap.totalChars);
    const spineItem = epubMap.items.find(
      (it) => targetChar >= it.charStart && targetChar < it.charEnd,
    );
    logger.info(
      `[sync:e→t] epub: ${epubMap.items.length} spine items | at ${(ebookPct * 100).toFixed(1)}% → spine "${spineItem?.href ?? 'n/a'}" (char ${targetChar}/${epubMap.totalChars})`,
    );
    logger.info(`[sync:e→t] pct snippet: "${snippet.slice(0, 120)}"`);
  }
  if (!snippet.trim()) {
    logger.info(`[sync:e→t] empty snippet — returning low confidence`);
    return { percentage: ebookPct, confidence: 'low' };
  }

  // Build a text string from transcript words to search
  const transcriptText = allWords.map((w) => w.text).join(' ');
  const { offset: wordOffset, score } = fuzzySearch(transcriptText, snippet);
  logger.info(`[sync:e→t] fuzzy score=${score.toFixed(2)} offset=${wordOffset}`);

  if (wordOffset < 0 || score < 0.4) {
    logger.info(`[sync:e→t] score too low — returning low confidence`);
    return { percentage: ebookPct, confidence: 'low' };
  }

  // Convert char offset in transcript text to segment index by walking actual positions
  let charPos = 0;
  let segIdx = allWords.length - 1;
  for (let i = 0; i < allWords.length; i++) {
    const segEnd = charPos + allWords[i].text.length;
    if (wordOffset <= segEnd) {
      segIdx = i;
      break;
    }
    charPos = segEnd + 1; // +1 for the space separator in join(' ')
  }
  const matchedWord = allWords[segIdx];
  logger.info(
    `[sync:e→t] matched seg[${segIdx}] @${matchedWord.globalStart.toFixed(1)}s: "${matchedWord.text.slice(0, 80)}"`,
  );

  const audioSeconds = matchedWord.globalStart;
  const percentage =
    transcript.totalDuration > 0 ? audioSeconds / transcript.totalDuration : ebookPct;

  // Find fileIndex by matching the word's fileName against the audio files list.
  // Use matchedWord.start (file-relative position) for fileSeconds.
  let fileIndex = 0;
  const fileSeconds = matchedWord.start;
  if (matchedWord.fileName) {
    const list = audioFiles ?? Object.keys(transcript.files).sort().map((f) => ({ path: f }));
    const idx = list.findIndex((f) => path.basename(f.path) === matchedWord.fileName);
    logger.info(
      `[sync:e→t] fileName="${matchedWord.fileName}" audioFiles=${audioFiles ? audioFiles.length : 'none(fallback)'} → idx=${idx}`,
    );
    if (idx >= 0) fileIndex = idx;
  }

  logger.info(
    `[sync:e→t] result: fileIndex=${fileIndex} fileSeconds=${fileSeconds.toFixed(1)}s percentage=${(percentage * 100).toFixed(1)}% confidence=${score >= 0.7 ? 'high' : 'low'}`,
  );
  return {
    percentage,
    audioSeconds,
    fileIndex,
    fileSeconds,
    confidence: score >= 0.7 ? 'high' : 'low',
    matchedText: snippet.slice(0, 100),
  };
}
