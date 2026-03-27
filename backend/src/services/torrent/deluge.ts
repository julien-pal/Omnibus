import axios, { AxiosInstance } from 'axios';
import { ClientConfig, ITorrentClient, TorrentInfo, TorrentState } from '../../types';
import {
  resolveTimeout,
  resolveTorrentFetchTimeout,
  formatClientError,
  fetchTorrentSource,
} from './utils';

class DelugeClient implements ITorrentClient {
  private url: string;
  private password: string;
  private cookie: string | null;
  private _msgId: number;
  private timeout: number;
  private torrentFetchTimeout: number;
  private _client: AxiosInstance;

  constructor(config: ClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.password = config.password || '';
    this.cookie = null;
    this._msgId = 1;
    this.timeout = resolveTimeout(config);
    this.torrentFetchTimeout = resolveTorrentFetchTimeout(config);
    this._client = axios.create({ baseURL: this.url, timeout: this.timeout });
  }

  private async _rpc(method: string, params: unknown[] = []): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cookie) headers['Cookie'] = this.cookie;

    const body = { method, params, id: this._msgId++ };
    let res;
    try {
      res = await this._client.post('/json', body, { headers });
    } catch (err) {
      throw formatClientError(err, `Deluge ${method}`, this.timeout);
    }

    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      this.cookie = (setCookie as string[]).map((c: string) => c.split(';')[0]).join('; ');
    }

    const data = res.data as { error?: unknown; result: unknown };
    if (data.error) {
      throw new Error(`Deluge RPC error: ${JSON.stringify(data.error)}`);
    }
    return data.result;
  }

  private async _login(): Promise<void> {
    const result = await this._rpc('auth.login', [this.password]);
    if (!result) throw new Error('Deluge login failed');
  }

  async testConnection(): Promise<boolean> {
    await this._login();
    return true;
  }

  async addTorrent(url: string, destination: string, tag: string): Promise<string | null> {
    if (!this.cookie) await this._login();

    const options: Record<string, string> = {};
    if (destination) options.download_location = destination;

    let hash: string | null;
    if (url.startsWith('magnet:')) {
      hash = (await this._rpc('core.add_torrent_magnet', [url, options])) as string;
    } else {
      let source;
      try {
        source = await fetchTorrentSource(url, this.torrentFetchTimeout);
      } catch (err) {
        throw formatClientError(
          err,
          'Downloading torrent file for Deluge',
          this.torrentFetchTimeout,
        );
      }
      if (source.isMagnet) {
        hash = (await this._rpc('core.add_torrent_magnet', [source.magnetUrl, options])) as string;
      } else {
        const base64 = source.buffer.toString('base64');
        hash = (await this._rpc('core.add_torrent_file', [
          'torrent.torrent',
          base64,
          options,
        ])) as string;
      }
    }

    if (tag && hash) {
      try {
        await this._rpc('label.add_torrent_label', [hash, tag]);
      } catch {
        /* label plugin may not be installed */
      }
    }

    return hash;
  }

  async getTorrents(): Promise<TorrentInfo[]> {
    if (!this.cookie) await this._login();
    const fields = [
      'name',
      'progress',
      'state',
      'save_path',
      'total_size',
      'download_payload_rate',
    ];
    const result = (await this._rpc('core.get_torrents_status', [{}, fields])) as Record<
      string,
      Record<string, unknown>
    >;
    return Object.entries(result || {}).map(([hash, t]) => ({
      hash,
      name: t.name as string,
      progress: Math.round(t.progress as number),
      state: this._mapState(t.state as string),
      savePath: t.save_path as string,
      size: t.total_size as number,
      dlspeed: t.download_payload_rate as number,
    }));
  }

  async getTorrent(hash: string): Promise<TorrentInfo | null> {
    if (!this.cookie) await this._login();
    const fields = [
      'name',
      'progress',
      'state',
      'save_path',
      'total_size',
      'download_payload_rate',
    ];
    const result = (await this._rpc('core.get_torrent_status', [hash, fields])) as Record<
      string,
      unknown
    > | null;
    if (!result) return null;
    return {
      hash,
      name: result.name as string,
      progress: Math.round(result.progress as number),
      state: this._mapState(result.state as string),
      savePath: result.save_path as string,
      size: result.total_size as number,
      dlspeed: result.download_payload_rate as number,
    };
  }

  private _mapState(state: string): TorrentState {
    const map: Record<string, TorrentState> = {
      Downloading: 'downloading',
      Seeding: 'seeding',
      Paused: 'paused',
      Checking: 'checking',
      Queued: 'queued',
      Error: 'error',
    };
    return map[state] || (state || '').toLowerCase();
  }
}

export default DelugeClient;
