import axios, { AxiosInstance } from 'axios';
import { getConfig } from '../config/manager';
import { IndexerCategory, SearchResult } from '../types';

function getClient(url?: string, apiKey?: string): AxiosInstance {
  if (!url || !apiKey) {
    const config = getConfig('prowlarr');
    url = url || config.url;
    apiKey = apiKey || config.apiKey;
  }
  if (!url || !apiKey) {
    throw new Error('Prowlarr is not configured. Please set URL and API key in Settings.');
  }
  return axios.create({
    baseURL: url.replace(/\/$/, ''),
    headers: { 'X-Api-Key': apiKey },
    timeout: 15000,
  });
}

// Full standard Newznab category list — used as fallback when Prowlarr doesn't return categories
const STANDARD_CATEGORIES: IndexerCategory[] = [
  { id: 1000, name: 'Console' },
  { id: 1010, name: 'Console / NDS' },
  { id: 1020, name: 'Console / PSP' },
  { id: 1030, name: 'Console / Wii' },
  { id: 1040, name: 'Console / XBox' },
  { id: 1050, name: 'Console / XBox 360' },
  { id: 1060, name: 'Console / WiiWare' },
  { id: 1070, name: 'Console / XBox 360 DLC' },
  { id: 1080, name: 'Console / PS3' },
  { id: 1090, name: 'Console / Other' },
  { id: 2000, name: 'Movies' },
  { id: 2010, name: 'Movies / Foreign' },
  { id: 2020, name: 'Movies / Other' },
  { id: 2030, name: 'Movies / SD' },
  { id: 2040, name: 'Movies / HD' },
  { id: 2045, name: 'Movies / UHD' },
  { id: 2050, name: 'Movies / BluRay' },
  { id: 2060, name: 'Movies / 3D' },
  { id: 3000, name: 'Audio' },
  { id: 3010, name: 'Audio / MP3' },
  { id: 3020, name: 'Audio / Video' },
  { id: 3030, name: 'Audio / Audiobook' },
  { id: 3040, name: 'Audio / Lossless' },
  { id: 3050, name: 'Audio / Other' },
  { id: 3060, name: 'Audio / Foreign' },
  { id: 4000, name: 'PC' },
  { id: 4010, name: 'PC / 0day' },
  { id: 4020, name: 'PC / ISO' },
  { id: 4030, name: 'PC / Mac' },
  { id: 4040, name: 'PC / Mobile Other' },
  { id: 4050, name: 'PC / Games' },
  { id: 4060, name: 'PC / Mobile iOS' },
  { id: 4070, name: 'PC / Mobile Android' },
  { id: 5000, name: 'TV' },
  { id: 5020, name: 'TV / Foreign' },
  { id: 5030, name: 'TV / SD' },
  { id: 5040, name: 'TV / HD' },
  { id: 5045, name: 'TV / UHD' },
  { id: 5050, name: 'TV / Other' },
  { id: 5060, name: 'TV / Sport' },
  { id: 5070, name: 'TV / Anime' },
  { id: 5080, name: 'TV / Documentary' },
  { id: 6000, name: 'XXX' },
  { id: 7000, name: 'Books' },
  { id: 7010, name: 'Books / Mags' },
  { id: 7020, name: 'Books / eBook' },
  { id: 7030, name: 'Books / Comics' },
  { id: 7040, name: 'Books / Technical' },
  { id: 7050, name: 'Books / Other' },
  { id: 7060, name: 'Books / Foreign' },
  { id: 8000, name: 'Other' },
  { id: 8010, name: 'Other / Misc' },
  { id: 8020, name: 'Other / Hashed' },
];

interface RawIndexer {
  id: number;
  name: string;
  enable?: boolean;
  capabilities?: {
    categories?: Array<{
      id: number;
      name: string;
      subCategories?: Array<{ id: number; name: string }>;
    }>;
  };
}

interface NormalizedIndexer {
  id: number;
  name: string;
  available: IndexerCategory[];
}

export async function getIndexers(): Promise<NormalizedIndexer[]> {
  const client = getClient();
  const response = await client.get('api/v1/indexer');
  const indexers = ((response.data || []) as RawIndexer[]).filter((idx) => idx.enable !== false);

  // Fetch detailed capabilities for each indexer in parallel
  const detailed = await Promise.all(
    indexers.map(async (idx) => {
      try {
        const detail = await client.get(`api/v1/indexer/${idx.id}`);
        return detail.data as RawIndexer;
      } catch {
        return idx; // fallback to basic data
      }
    }),
  );

  return detailed.filter((idx) => idx.enable !== false).map(normalizeIndexer);
}

function normalizeIndexer(indexer: RawIndexer): NormalizedIndexer {
  const available: IndexerCategory[] = [];
  const rawCats = indexer.capabilities?.categories || [];

  for (const cat of rawCats) {
    available.push({ id: cat.id, name: cat.name });
    for (const sub of cat.subCategories || []) {
      available.push({ id: sub.id, name: sub.name, parentId: cat.id });
    }
  }

  // If Prowlarr didn't return any categories, use full standard Newznab list
  const final = available.length > 0 ? available : [...STANDARD_CATEGORIES];

  // Deduplicate by id
  const seen = new Set<number>();
  const deduped = final.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return {
    id: indexer.id,
    name: indexer.name,
    available: deduped,
  };
}

export async function testConnection(
  url: string,
  apiKey: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const client = getClient(url, apiKey);
    const response = await client.get('api/v1/system/status');
    return { ok: true, version: (response.data as { version: string }).version };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function search(
  query: string,
  categories: number[] = [],
  indexerIds: number[] = [],
  { exact = true }: { exact?: boolean } = {},
): Promise<SearchResult[]> {
  const client = getClient();

  const params = new URLSearchParams();
  const q = String(query || '').trim();
  params.append('query', q && exact ? `"${q}"` : q);

  for (const category of categories || []) {
    const value = Number(category);
    if (Number.isFinite(value)) {
      params.append('categories', String(value));
    }
  }

  for (const indexerId of indexerIds || []) {
    const value = Number(indexerId);
    if (Number.isFinite(value)) {
      params.append('indexerIds', String(value));
    }
  }

  const response = await client.get('api/v1/search', {
    params,
    paramsSerializer: (p: unknown) => (p as URLSearchParams).toString(),
  });

  return ((response.data || []) as Record<string, unknown>[]).map(normalizeResult);
}

function normalizeResult(item: Record<string, unknown>): SearchResult {
  return {
    guid: (item.guid || item.downloadUrl) as string,
    title: (item.title || '') as string,
    size: (item.size || 0) as number,
    seeders: (item.seeders || 0) as number,
    leechers: (item.leechers || 0) as number,
    indexer: (item.indexer || '') as string,
    indexerId: (item.indexerId || null) as number | null,
    downloadUrl: (item.downloadUrl || '') as string,
    magnetUrl: (item.magnetUrl || '') as string,
    publishDate: (item.publishDate || null) as string | null,
    infoUrl: (item.infoUrl || '') as string,
  } as unknown as SearchResult;
}
