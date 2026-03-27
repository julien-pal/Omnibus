import axios, { AxiosInstance } from 'axios';
import { ClientConfig, ITorrentClient, TorrentInfo, TorrentState } from '../../types';
import {
  resolveTimeout,
  resolveTorrentFetchTimeout,
  formatClientError,
  fetchTorrentSource,
} from './utils';

class TransmissionClient implements ITorrentClient {
  private url: string;
  private username: string;
  private password: string;
  private sessionId: string | null;
  private timeout: number;
  private torrentFetchTimeout: number;
  private _client: AxiosInstance;

  constructor(config: ClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.username = config.username || '';
    this.password = config.password || '';
    this.sessionId = null;
    this.timeout = resolveTimeout(config);
    this.torrentFetchTimeout = resolveTorrentFetchTimeout(config);
    this._client = axios.create({
      baseURL: this.url,
      timeout: this.timeout,
      auth: this.username ? { username: this.username, password: this.password } : undefined,
    });
  }

  private async _rpc(
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionId) headers['X-Transmission-Session-Id'] = this.sessionId;

    try {
      const res = await this._client.post(
        '/transmission/rpc',
        { method, arguments: args },
        { headers },
      );
      const data = res.data as { result: string; arguments: Record<string, unknown> };
      if (data.result !== 'success') {
        throw new Error(`Transmission RPC failed: ${data.result}`);
      }
      return data.arguments;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; headers?: Record<string, string> } };
      if (e.response && e.response.status === 409) {
        this.sessionId = e.response.headers?.['x-transmission-session-id'] || null;
        return this._rpc(method, args);
      }
      throw formatClientError(err, `Transmission ${method}`, this.timeout);
    }
  }

  async testConnection(): Promise<boolean> {
    await this._rpc('session-get');
    return true;
  }

  async addTorrent(url: string, destination: string, tag: string): Promise<string | null> {
    const args: Record<string, unknown> = {};
    if (url.startsWith('magnet:')) {
      args.filename = url;
    } else {
      // Download the .torrent file on the backend side, then send as base64.
      // fetchTorrentSource also handles URLs that redirect to a magnet: URI.
      let source;
      try {
        source = await fetchTorrentSource(url, this.torrentFetchTimeout);
      } catch (err) {
        throw formatClientError(
          err,
          'Downloading torrent file for Transmission',
          this.torrentFetchTimeout,
        );
      }
      if (source.isMagnet) {
        args.filename = source.magnetUrl;
      } else {
        args.metainfo = source.buffer.toString('base64');
      }
    }
    if (destination) args['download-dir'] = destination;

    const result = await this._rpc('torrent-add', args);
    const torrent = (result['torrent-added'] || result['torrent-duplicate']) as
      | Record<string, unknown>
      | undefined;
    const hash = torrent ? String(torrent.hashString) : null;

    // Apply label after adding (Transmission 3.00+ supports labels).
    if (hash && tag) {
      try {
        await this._rpc('torrent-set', { ids: [hash], labels: [tag] });
      } catch {
        /* older Transmission versions don't support labels — ignore */
      }
    }

    return hash;
  }

  async getTorrents(): Promise<TorrentInfo[]> {
    const fields = [
      'hashString',
      'name',
      'percentDone',
      'status',
      'downloadDir',
      'totalSize',
      'rateDownload',
    ];
    const result = await this._rpc('torrent-get', { fields });
    return ((result.torrents as Record<string, unknown>[]) || []).map((t) => ({
      hash: t.hashString as string,
      name: t.name as string,
      progress: Math.round((t.percentDone as number) * 100),
      state: this._mapStatus(t.status as number),
      savePath: t.downloadDir as string,
      size: t.totalSize as number,
      dlspeed: t.rateDownload as number,
    }));
  }

  async getTorrent(hash: string): Promise<TorrentInfo | null> {
    const fields = [
      'hashString',
      'name',
      'percentDone',
      'status',
      'downloadDir',
      'totalSize',
      'rateDownload',
    ];
    const result = await this._rpc('torrent-get', { ids: [hash], fields });
    const t = ((result.torrents as Record<string, unknown>[]) || [])[0];
    if (!t) return null;
    return {
      hash: t.hashString as string,
      name: t.name as string,
      progress: Math.round((t.percentDone as number) * 100),
      state: this._mapStatus(t.status as number),
      savePath: t.downloadDir as string,
      size: t.totalSize as number,
      dlspeed: t.rateDownload as number,
    };
  }

  private _mapStatus(status: number): TorrentState {
    // Transmission status codes: 0=stopped, 1=check-wait, 2=check, 3=download-wait, 4=download, 5=seed-wait, 6=seed
    const map: Record<number, TorrentState> = {
      0: 'paused',
      1: 'queued',
      2: 'checking',
      3: 'queued',
      4: 'downloading',
      5: 'queued',
      6: 'seeding',
    };
    return map[status] || 'unknown';
  }
}

export default TransmissionClient;
