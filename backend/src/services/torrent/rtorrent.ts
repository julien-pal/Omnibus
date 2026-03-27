import axios, { AxiosInstance } from 'axios';
import { ClientConfig, ITorrentClient, TorrentInfo, TorrentState } from '../../types';
import {
  resolveTimeout,
  resolveTorrentFetchTimeout,
  formatClientError,
  fetchTorrentSource,
} from './utils';

// rTorrent uses XML-RPC
class RTorrentClient implements ITorrentClient {
  private url: string;
  private username: string;
  private password: string;
  private timeout: number;
  private torrentFetchTimeout: number;
  private _client: AxiosInstance;

  constructor(config: ClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.username = config.username || '';
    this.password = config.password || '';
    this.timeout = resolveTimeout(config);
    this.torrentFetchTimeout = resolveTorrentFetchTimeout(config);
    this._client = axios.create({
      baseURL: this.url,
      timeout: this.timeout,
      auth: this.username ? { username: this.username, password: this.password } : undefined,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  private _buildXml(method: string, params: unknown[] = []): string {
    const paramXml = params
      .map((p) => {
        if (typeof p === 'string')
          return `<param><value><string>${this._escape(p)}</string></value></param>`;
        if (typeof p === 'number') return `<param><value><int>${p}</int></value></param>`;
        if (Array.isArray(p)) {
          const items = (p as string[])
            .map((i) => `<value><string>${this._escape(i)}</string></value>`)
            .join('');
          return `<param><value><array><data>${items}</data></array></value></param>`;
        }
        return `<param><value><string>${this._escape(String(p))}</string></value></param>`;
      })
      .join('\n');

    return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
  }

  private _escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private async _call(method: string, params: unknown[] = []): Promise<string[]> {
    const xml = this._buildXml(method, params);
    let res;
    try {
      res = await this._client.post('/RPC2', xml);
    } catch (err) {
      throw formatClientError(err, `rTorrent ${method}`, this.timeout);
    }
    return this._parseXml(res.data as string);
  }

  private _parseXml(xml: string): string[] {
    // Simple extraction of string/int values from XML-RPC response
    const match = xml.match(/<fault>/);
    if (match) {
      throw new Error(`rTorrent XMLRPC fault: ${xml}`);
    }

    const strings: string[] = [];
    const regex = /<string>([\s\S]*?)<\/string>|<i[48]>([\s\S]*?)<\/i[48]>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      strings.push(m[1] !== undefined ? m[1] : m[2]);
    }
    return strings;
  }

  async testConnection(): Promise<boolean> {
    await this._call('system.pid');
    return true;
  }

  async addTorrent(url: string, destination: string, tag: string): Promise<string | null> {
    let hash: string | null = null;
    if (url.startsWith('magnet:')) {
      if (destination) {
        await this._call('d.add_uri', [url, `d.directory.set=${destination}`]);
      } else {
        await this._call('d.add_uri', [url]);
      }
      // Extract hash from magnet link
      const infoHashMatch = url.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
      hash = infoHashMatch ? infoHashMatch[1].toUpperCase() : null;
    } else {
      let source;
      try {
        source = await fetchTorrentSource(url, this.torrentFetchTimeout);
      } catch (err) {
        throw formatClientError(
          err,
          'Downloading torrent file for rTorrent',
          this.torrentFetchTimeout,
        );
      }
      if (source.isMagnet) {
        if (destination) {
          await this._call('d.add_uri', [source.magnetUrl, `d.directory.set=${destination}`]);
        } else {
          await this._call('d.add_uri', [source.magnetUrl]);
        }
        const infoHashMatch = source.magnetUrl.match(
          /xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i,
        );
        hash = infoHashMatch ? infoHashMatch[1].toUpperCase() : null;
      } else {
        await this._call('load.raw_start', ['', Buffer.from(source.buffer) as unknown as string]);
        hash = null;
      }
    }

    if (tag && hash) {
      try {
        await this._call('d.custom1.set', [hash, tag]);
      } catch {
        /* ignore */
      }
    }

    return hash;
  }

  async getTorrents(): Promise<TorrentInfo[]> {
    const result = await this._call('d.multicall2', [
      '',
      'main',
      'd.hash=',
      'd.name=',
      'd.completed_chunks=',
      'd.size_chunks=',
      'd.state=',
      'd.directory=',
      'd.size_bytes=',
    ]);

    return this._parseMulticall(result);
  }

  private _parseMulticall(strings: string[]): TorrentInfo[] {
    // Group by 7 (number of fields)
    const fields = 7;
    const torrents: TorrentInfo[] = [];
    for (let i = 0; i + fields <= strings.length; i += fields) {
      const [hash, name, completed, total, state, savePath, size] = strings.slice(i, i + fields);
      const progress =
        parseInt(total) > 0 ? Math.round((parseInt(completed) / parseInt(total)) * 100) : 0;
      torrents.push({
        hash,
        name,
        progress,
        state: parseInt(state) === 1 ? 'downloading' : 'seeding',
        savePath,
        size: parseInt(size) || 0,
        dlspeed: 0,
      });
    }
    return torrents;
  }

  async getTorrent(hash: string): Promise<TorrentInfo | null> {
    try {
      const [name, completed, total, state, savePath, size] = await this._call('d.multicall2', [
        hash,
        'main',
        'd.name=',
        'd.completed_chunks=',
        'd.size_chunks=',
        'd.state=',
        'd.directory=',
        'd.size_bytes=',
      ]);
      const progress =
        parseInt(total) > 0 ? Math.round((parseInt(completed) / parseInt(total)) * 100) : 0;
      return {
        hash,
        name,
        progress,
        state: parseInt(state) === 1 ? 'downloading' : ('seeding' as TorrentState),
        savePath,
        size: parseInt(size) || 0,
        dlspeed: 0,
      };
    } catch {
      return null;
    }
  }
}

export default RTorrentClient;
