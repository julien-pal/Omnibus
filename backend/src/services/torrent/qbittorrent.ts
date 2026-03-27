import axios, { AxiosInstance } from 'axios';
import { ClientConfig, ITorrentClient, TorrentInfo, TorrentState } from '../../types';
import {
  resolveTimeout,
  resolveTorrentFetchTimeout,
  formatClientError,
  fetchTorrentSource,
} from './utils';

class QBittorrentClient implements ITorrentClient {
  private url: string;
  private username: string;
  private password: string;
  private cookie: string | null;
  private timeout: number;
  private torrentFetchTimeout: number;
  private _client: AxiosInstance;

  constructor(config: ClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.username = config.username || 'admin';
    this.password = config.password || '';
    this.cookie = null;
    this.timeout = resolveTimeout(config);
    this.torrentFetchTimeout = resolveTorrentFetchTimeout(config);
    this._client = axios.create({
      baseURL: this.url,
      timeout: this.timeout,
      withCredentials: true,
    });
  }

  private async _login(): Promise<void> {
    const params = new URLSearchParams();
    params.append('username', this.username);
    params.append('password', this.password);
    let res;
    try {
      res = await this._client.post('/api/v2/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      throw formatClientError(err, 'qBittorrent login', this.timeout);
    }
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      this.cookie = setCookie.map((c: string) => c.split(';')[0]).join('; ');
    }
    if (res.data !== 'Ok.') {
      throw new Error('qBittorrent login failed');
    }
  }

  private async _request(
    method: string,
    reqPath: string,
    options: Record<string, unknown> = {},
  ): Promise<{ data: unknown; status: number }> {
    if (!this.cookie) await this._login();
    try {
      const res = await this._client.request({
        method,
        url: reqPath,
        headers: { Cookie: this.cookie },
        ...options,
      });
      return res;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e.response && e.response.status === 403) {
        this.cookie = null;
        await this._login();
        const res = await this._client.request({
          method,
          url: reqPath,
          headers: { Cookie: this.cookie },
          ...options,
        });
        return res;
      }
      throw formatClientError(err, `qBittorrent ${method} ${reqPath}`, this.timeout);
    }
  }

  async testConnection(): Promise<boolean> {
    await this._login();
    const res = await this._request('GET', '/api/v2/app/version');
    return res.status === 200;
  }

  async addTorrent(url: string, destination: string, tag: string): Promise<string | null> {
    if (url.startsWith('magnet:')) {
      const form = new URLSearchParams();
      form.append('urls', url);
      if (destination) form.append('savepath', destination);
      if (tag) form.append('tags', tag);
      await this._request('POST', '/api/v2/torrents/add', {
        data: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookie },
      });
    } else {
      // fetchTorrentSource handles HTTP→magnet redirects gracefully.
      let source;
      try {
        source = await fetchTorrentSource(url, this.torrentFetchTimeout);
      } catch (err) {
        throw formatClientError(
          err,
          'Downloading torrent file for qBittorrent',
          this.torrentFetchTimeout,
        );
      }
      if (source.isMagnet) {
        // URL redirected to a magnet — add as URL instead
        const form = new URLSearchParams();
        form.append('urls', source.magnetUrl);
        if (destination) form.append('savepath', destination);
        if (tag) form.append('tags', tag);
        await this._request('POST', '/api/v2/torrents/add', {
          data: form,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: this.cookie },
        });
      } else {
        const form = new FormData();
        form.append(
          'torrents',
          new Blob([new Uint8Array(source.buffer)], { type: 'application/x-bittorrent' }),
          'file.torrent',
        );
        if (destination) form.append('savepath', destination);
        if (tag) form.append('tags', tag);
        if (!this.cookie) await this._login();
        try {
          await this._client.request({
            method: 'POST',
            url: '/api/v2/torrents/add',
            headers: { Cookie: this.cookie },
            data: form,
          });
        } catch (err) {
          throw formatClientError(err, 'qBittorrent torrent upload', this.timeout);
        }
      }
    }

    // qBittorrent doesn't return hash on add; query recent torrent
    await new Promise((r) => setTimeout(r, 1500));
    const torrents = await this.getTorrents();
    const sorted = torrents.sort((a, b) => (b.addedOn || 0) - (a.addedOn || 0));
    return sorted[0]?.hash || null;
  }

  async getTorrents(): Promise<TorrentInfo[]> {
    const res = await this._request('GET', '/api/v2/torrents/info');
    return ((res.data as unknown[]) || []).map((t: unknown) => {
      const torrent = t as Record<string, unknown>;
      return {
        hash: torrent.hash as string,
        name: torrent.name as string,
        progress: Math.round((torrent.progress as number) * 100),
        state: this._mapState(torrent.state as string),
        savePath: torrent.save_path as string,
        size: torrent.size as number,
        dlspeed: torrent.dlspeed as number,
        addedOn: torrent.added_on as number,
      };
    });
  }

  async getTorrent(hash: string): Promise<TorrentInfo | null> {
    const res = await this._request('GET', `/api/v2/torrents/info?hashes=${hash}`);
    const t = ((res.data as unknown[]) || [])[0] as Record<string, unknown> | undefined;
    if (!t) return null;
    return {
      hash: t.hash as string,
      name: t.name as string,
      progress: Math.round((t.progress as number) * 100),
      state: this._mapState(t.state as string),
      savePath: t.save_path as string,
      size: t.size as number,
      dlspeed: t.dlspeed as number,
    };
  }

  private _mapState(state: string): TorrentState {
    const map: Record<string, TorrentState> = {
      downloading: 'downloading',
      stalledDL: 'downloading',
      uploading: 'seeding',
      stalledUP: 'seeding',
      pausedDL: 'paused',
      pausedUP: 'paused',
      checkingDL: 'checking',
      checkingUP: 'checking',
      error: 'error',
      missingFiles: 'error',
      queuedDL: 'queued',
      queuedUP: 'queued',
    };
    return map[state] || state;
  }
}

export default QBittorrentClient;
