import axios, { AxiosInstance } from 'axios';
import { ClientConfig, ITorrentClient, TorrentInfo, TorrentState } from '../../types';
import {
  resolveTimeout,
  resolveTorrentFetchTimeout,
  formatClientError,
  fetchTorrentSource,
} from './utils';

class Aria2Client implements ITorrentClient {
  private url: string;
  private password: string;
  private _msgId: number;
  private timeout: number;
  private torrentFetchTimeout: number;
  private _client: AxiosInstance;

  constructor(config: ClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.password = config.password || '';
    this._msgId = 1;
    this.timeout = resolveTimeout(config);
    this.torrentFetchTimeout = resolveTorrentFetchTimeout(config);
    this._client = axios.create({ baseURL: this.url, timeout: this.timeout });
  }

  private _token(): string | null {
    return this.password ? `token:${this.password}` : null;
  }

  private async _call(method: string, params: unknown[] = []): Promise<unknown> {
    const token = this._token();
    const rpcParams = token ? [token, ...params] : params;
    const body = { jsonrpc: '2.0', method, params: rpcParams, id: this._msgId++ };
    let res;
    try {
      res = await this._client.post('/jsonrpc', body);
    } catch (err) {
      throw formatClientError(err, `Aria2 ${method}`, this.timeout);
    }
    const data = res.data as { error?: unknown; result: unknown };
    if (data.error) {
      throw new Error(`Aria2 RPC error: ${JSON.stringify(data.error)}`);
    }
    return data.result;
  }

  async testConnection(): Promise<boolean> {
    await this._call('aria2.getVersion');
    return true;
  }

  async addTorrent(url: string, destination: string, tag: string): Promise<string | null> {
    const options: Record<string, string> = {};
    if (destination) options.dir = destination;

    let gid: string;
    if (url.startsWith('magnet:')) {
      gid = (await this._call('aria2.addUri', [[url], options])) as string;
    } else {
      let source;
      try {
        source = await fetchTorrentSource(url, this.torrentFetchTimeout);
      } catch (err) {
        throw formatClientError(
          err,
          'Downloading torrent file for Aria2',
          this.torrentFetchTimeout,
        );
      }
      if (source.isMagnet) {
        gid = (await this._call('aria2.addUri', [[source.magnetUrl], options])) as string;
      } else {
        const b64 = source.buffer.toString('base64');
        gid = (await this._call('aria2.addTorrent', [b64, [], options])) as string;
      }
    }

    // Get hash from gid
    try {
      const status = (await this._call('aria2.tellStatus', [gid, ['infoHash']])) as {
        infoHash?: string;
      };
      return status.infoHash || gid;
    } catch {
      return gid;
    }
  }

  async getTorrents(): Promise<TorrentInfo[]> {
    const fields = [
      'gid',
      'infoHash',
      'bittorrent',
      'completedLength',
      'totalLength',
      'downloadSpeed',
      'status',
      'dir',
    ];
    const [active, waiting, stopped] = await Promise.all([
      (this._call('aria2.tellActive', [fields]) as Promise<unknown[]>).catch(() => [] as unknown[]),
      (this._call('aria2.tellWaiting', [0, 100, fields]) as Promise<unknown[]>).catch(
        () => [] as unknown[],
      ),
      (this._call('aria2.tellStopped', [0, 100, fields]) as Promise<unknown[]>).catch(
        () => [] as unknown[],
      ),
    ]);

    return [...(active as unknown[]), ...(waiting as unknown[]), ...(stopped as unknown[])].map(
      (t) => this._mapTorrent(t as Record<string, unknown>),
    );
  }

  async getTorrent(hash: string): Promise<TorrentInfo | null> {
    const all = await this.getTorrents();
    return all.find((t) => t.hash === hash) || null;
  }

  private _mapTorrent(t: Record<string, unknown>): TorrentInfo {
    const total = parseInt(t.totalLength as string) || 0;
    const completed = parseInt(t.completedLength as string) || 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bittorrent = t.bittorrent as { info?: { name?: string } } | undefined;
    const name = bittorrent?.info?.name || (t.gid as string);
    return {
      hash: (t.infoHash || t.gid) as string,
      name,
      progress,
      state: this._mapStatus(t.status as string),
      savePath: t.dir as string,
      size: total,
      dlspeed: parseInt(t.downloadSpeed as string) || 0,
    };
  }

  private _mapStatus(status: string): TorrentState {
    const map: Record<string, TorrentState> = {
      active: 'downloading',
      waiting: 'queued',
      paused: 'paused',
      error: 'error',
      complete: 'seeding',
      removed: 'removed',
    };
    return map[status] || status;
  }
}

export default Aria2Client;
