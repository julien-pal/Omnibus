import express from 'express';
import { search as prowlarrSearch } from '../services/prowlarr';
import { getConfig } from '../config/manager';
import { ProwlarrConfig } from '../types';

const router = express.Router();

// POST /api/search
router.post('/', async (req, res) => {
  const {
    query,
    author,
    title,
    series,
    type = 'both',
    indexerIds = [],
  } = req.body as {
    query?: string;
    author?: string;
    title?: string;
    series?: string;
    type?: string;
    indexerIds?: number[];
  };

  if (!query && !author && !title) {
    return res.status(400).json({ error: 'At least one search term is required' });
  }

  const prowlarrConfig = getConfig('prowlarr');
  const categories = buildCategories(type, prowlarrConfig);
  const searchQuery = buildQuery({ query, author, title, series });

  let results;
  try {
    results = await prowlarrSearch(searchQuery, categories, indexerIds);
  } catch (err) {
    return res.status(502).json({ error: `Prowlarr search failed: ${(err as Error).message}` });
  }

  results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
  res.json({ results, total: results.length });
});

function buildQuery({
  query,
  author,
  title,
  series,
}: {
  query?: string;
  author?: string;
  title?: string;
  series?: string;
}): string {
  const parts: string[] = [];
  if (title) parts.push(title);
  else if (query) parts.push(query);
  if (author) parts.push(author);
  if (series) parts.push(series);
  return parts.join(' ');
}

function buildCategories(type: string, prowlarrConfig: ProwlarrConfig): number[] {
  const indexers = prowlarrConfig.indexers || [];
  const categories = new Set<number>();

  for (const indexer of indexers) {
    if (type === 'ebook' || type === 'both') {
      (indexer.categories?.book || []).forEach((c) => categories.add(c));
    }
    if (type === 'audiobook' || type === 'both') {
      (indexer.categories?.audiobook || []).forEach((c) => categories.add(c));
    }
  }

  if (categories.size === 0) {
    if (type === 'ebook' || type === 'both') {
      [7000, 7020, 8010].forEach((c) => categories.add(c));
    }
    if (type === 'audiobook' || type === 'both') {
      [7030, 8020].forEach((c) => categories.add(c));
    }
  }

  return Array.from(categories);
}

export default router;
