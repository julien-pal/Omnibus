import QBittorrentClient from './qbittorrent';
import DelugeClient from './deluge';
import TransmissionClient from './transmission';
import RTorrentClient from './rtorrent';
import Aria2Client from './aria2';
import { normalizeClientUrl } from './utils';
import { ClientConfig, ITorrentClient, TorrentClientType } from '../../types';

const CLIENT_MAP: Record<TorrentClientType, new (config: ClientConfig) => ITorrentClient> = {
  qbittorrent: QBittorrentClient,
  deluge: DelugeClient,
  transmission: TransmissionClient,
  rtorrent: RTorrentClient,
  aria2: Aria2Client,
};

export function createClient(clientConfig: ClientConfig): ITorrentClient {
  const ClientClass = CLIENT_MAP[clientConfig.type];
  if (!ClientClass) {
    throw new Error(`Unknown torrent client type: ${clientConfig.type}`);
  }

  const normalizedConfig: ClientConfig = {
    ...clientConfig,
    url: normalizeClientUrl(clientConfig.url, clientConfig.type),
  };

  return new ClientClass(normalizedConfig);
}

export function getSupportedTypes(): TorrentClientType[] {
  return Object.keys(CLIENT_MAP) as TorrentClientType[];
}
