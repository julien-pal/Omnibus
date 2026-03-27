import axios from 'axios';
import { ClientConfig, TorrentClientType, TorrentSource } from '../../types';

export const DEFAULT_CLIENT_TIMEOUT_MS = 30000;
export const DEFAULT_TORRENT_FETCH_TIMEOUT_MS = 60000;

function ensureHttpScheme(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    return `http://${url}`;
  }
  return url;
}

export function normalizeClientUrl(rawUrl: string, type: TorrentClientType): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Client URL is required');
  }

  let url = ensureHttpScheme(rawUrl.trim()).replace(/\/+$/, '');

  switch (type) {
    case 'qbittorrent':
      url = url.replace(/\/api\/v2$/i, '');
      break;
    case 'transmission':
      url = url.replace(/\/transmission\/rpc$/i, '');
      break;
    case 'deluge':
      url = url.replace(/\/json$/i, '');
      break;
    case 'aria2':
      url = url.replace(/\/jsonrpc$/i, '');
      break;
    case 'rtorrent':
      url = url.replace(/\/RPC2$/i, '');
      break;
    default:
      break;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new Error(`Invalid client URL: ${rawUrl}`);
  }

  return url;
}

type TimeoutConfig = Partial<
  Pick<ClientConfig, 'timeout' | 'torrentFetchTimeout'> & { timeoutMs?: number }
>;

export function resolveTimeout(
  config: TimeoutConfig,
  fallback = DEFAULT_CLIENT_TIMEOUT_MS,
): number {
  const value = Number(config?.timeoutMs ?? config?.timeout ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveTorrentFetchTimeout(
  config: Partial<ClientConfig & { torrentFetchTimeoutMs?: number }>,
): number {
  return resolveTimeout(
    {
      timeoutMs:
        config?.torrentFetchTimeoutMs ??
        config?.torrentFetchTimeout ??
        DEFAULT_TORRENT_FETCH_TIMEOUT_MS,
    },
    DEFAULT_TORRENT_FETCH_TIMEOUT_MS,
  );
}

export function formatClientError(err: unknown, action: string, timeoutMs: number): Error {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')) {
    return new Error(`${action} timed out after ${timeoutMs}ms`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Fetches a torrent file URL, handling the case where the URL redirects to a
 * magnet: URI (which HTTP clients cannot follow). Returns either:
 *   { isMagnet: true,  magnetUrl: string }
 *   { isMagnet: false, buffer: Buffer }
 */
export async function fetchTorrentSource(url: string, timeoutMs: number): Promise<TorrentSource> {
  // Probe without following redirects so we can detect a magnet: redirect.
  let probe: {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    data: unknown;
  } | null = null;
  try {
    probe = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      maxRedirects: 0,
      validateStatus: () => true, // never throw on HTTP status
    });
  } catch {
    // Network error at probe stage — try a normal fetch below.
    probe = null;
  }

  if (probe) {
    const status = probe.status;
    if (status >= 200 && status < 300) {
      // Direct file response — no redirect.
      return { isMagnet: false, buffer: Buffer.from(probe.data as ArrayBuffer) };
    }
    if (status >= 300 && status < 400) {
      const locationHeader = probe.headers?.['location'];
      const location = (
        Array.isArray(locationHeader) ? locationHeader[0] : locationHeader || ''
      ).trim();
      if (location.startsWith('magnet:')) {
        return { isMagnet: true, magnetUrl: location };
      }
      // Normal HTTP → HTTP redirect — fall through to follow-redirect fetch.
    }
  }

  // Follow redirects normally (HTTP → HTTP).
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: timeoutMs });
  return { isMagnet: false, buffer: Buffer.from(response.data as ArrayBuffer) };
}
