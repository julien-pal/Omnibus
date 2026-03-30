import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { WhisperConfig } from '../types';
import logger from '../lib/logger';
const execFileAsync = promisify(execFile);

// Node.js 17+ resolves "localhost" to ::1 (IPv6) but Docker only binds IPv4
function normalizeUrl(url: string): string {
  return url.replace(/localhost/g, '127.0.0.1');
}

export interface WhisperSegment {
  text: string;
  start: number; // seconds
  end: number;
}

export interface WhisperResult {
  text: string;
  words: WhisperSegment[]; // segments (phrase-level)
}

/** Extract an audio clip with ffmpeg and return a temp file path. Caller must delete it. */
export async function extractClip(
  audioPath: string,
  startSec: number,
  durationSec: number,
): Promise<string> {
  const tmp = path.join(os.tmpdir(), `omnibus_clip_${Date.now()}.mp3`);
  await execFileAsync('ffmpeg', [
    '-ss',
    String(startSec),
    '-t',
    String(durationSec),
    '-i',
    audioPath,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-q:a',
    '0',
    '-y',
    tmp,
  ]);
  return tmp;
}

/** Ensure the model is loaded in speaches (POST /api/ps/{model_id}) and wait until ready. */
export async function ensureModelLoaded(
  baseUrl: string,
  model: string,
  apiKey?: string,
): Promise<void> {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const encodedModel = encodeURIComponent(model);
  try {
    await axios.post(
      `${baseUrl}/api/ps/${encodedModel}`,
      {},
      { headers, timeout: 30_000, validateStatus: () => true },
    );
    // Poll until the model appears in /v1/models (max 60s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const r = await axios.get<{ data: Array<{ id: string }> }>(`${baseUrl}/v1/models`, {
          headers,
          timeout: 5000,
        });
        const loaded = (r.data?.data ?? []).some((m) => m.id === model);
        if (loaded) {
          logger.info(`[whisper] model "${model}" ready`);
          return;
        }
      } catch {
        /* keep waiting */
      }
    }
    logger.warn(`[whisper] model "${model}" not confirmed ready after 60s — proceeding anyway`);
  } catch (err) {
    // Non-fatal: some servers don't need explicit model loading
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[whisper] ensureModelLoaded failed (non-fatal): ${msg}`);
  }
}

/** Transcribe an audio file using the Whisper API (OpenAI-compatible). */
export async function transcribeFile(
  audioPath: string,
  config: WhisperConfig,
  skipModelLoad = false,
): Promise<WhisperResult> {
  const form = new FormData();
  const model = config.model || 'whisper-1';
  form.append('file', fs.createReadStream(audioPath), path.basename(audioPath));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const baseUrl = normalizeUrl(config.baseUrl.replace(/\/$/, ''));

  if (!skipModelLoad) {
    await ensureModelLoaded(baseUrl, model, config.apiKey);
  }

  logger.info(`[whisper] POST ${baseUrl}/v1/audio/transcriptions model=${model} file=${path.basename(audioPath)}`);
  let response;
  try {
    response = await axios.post(`${baseUrl}/v1/audio/transcriptions`, form, {
      headers: {
        ...form.getHeaders(),
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      maxBodyLength: Infinity,
      timeout: 1_200_000, // 20 minutes — large-v3 can take >2min per 5min chunk
      validateStatus: () => true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Whisper connection failed: ${msg}`);
  }

  if (response.status >= 400) {
    const detail =
      response.data?.detail ||
      response.data?.error ||
      response.data?.message ||
      JSON.stringify(response.data);
    throw new Error(`Whisper error ${response.status}: ${detail}`);
  }

  const data = response.data as {
    text: string;
    segments?: Array<{ text: string; start: number; end: number }>;
  };

  logger.info(
    `[whisper] response: text=${data.text?.length ?? 0}chars, segments=${data.segments?.length ?? 0}`,
  );
  if (!data.segments?.length) {
    logger.warn(
      `[whisper] WARNING: no segments in response. Keys: ${Object.keys(data).join(', ')}`,
    );
  }

  const words: WhisperSegment[] = (data.segments ?? []).map((s) => ({
    text: s.text.replace(/^[\s\p{P}]+/u, ''),
    start: s.start,
    end: s.end,
  }));

  logger.info(`[whisper] extracted ${words.length} segments from response`);
  return { text: data.text || '', words };
}

/** Transcribe an audio clip from startSec..startSec+durationSec, then delete the temp file. */
export async function transcribeClip(
  audioPath: string,
  startSec: number,
  durationSec: number,
  config: WhisperConfig,
): Promise<WhisperResult> {
  const tmp = await extractClip(audioPath, startSec, durationSec);
  try {
    const result = await transcribeFile(tmp, config);
    // Offset timestamps by startSec
    result.words = result.words.map((w) => ({
      ...w,
      start: w.start + startSec,
      end: w.end + startSec,
    }));
    return result;
  } finally {
    fs.unlink(tmp, () => {});
  }
}
