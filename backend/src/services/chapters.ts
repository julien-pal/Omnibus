import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export interface Chapter {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
}

const cache = new Map<string, Chapter[]>();

export async function extractChapters(filePath: string): Promise<Chapter[]> {
  if (cache.has(filePath)) return cache.get(filePath)!;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_chapters',
      filePath,
    ]);
    const data = JSON.parse(stdout);
    const chapters: Chapter[] = (data.chapters || []).map((c: any, i: number) => ({
      index: i,
      title: c.tags?.title || `Chapter ${i + 1}`,
      startTime: parseFloat(c.start_time),
      endTime: parseFloat(c.end_time),
    }));
    cache.set(filePath, chapters);
    return chapters;
  } catch {
    cache.set(filePath, []);
    return [];
  }
}
