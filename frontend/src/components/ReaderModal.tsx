'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  List,
  Sun,
  Moon,
  Minus,
  Plus,
  AlignLeft,
  Search,
  Settings2,
} from 'lucide-react';
import { useReaderStore } from '@/store/useReaderStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useQueryClient } from '@tanstack/react-query';
import { readerService, playerService, syncService } from '@/api';
import { toast } from '@/store/useToastStore';
import { coverUrl } from '@/lib/utils';
import { useSyncPrefStore } from '@/store/useSyncPrefStore';
import ProgressSyncDialog, { type syncInfo } from '@/components/ProgressSyncDialog';
import type { ProgressEntry } from '@/types';
import { useT } from '@/i18n';
import Tooltip from '@/components/Tooltip';

type Theme = 'dark' | 'sepia' | 'light';

const THEMES: Record<Theme, { bg: string; fg: string; link: string }> = {
  dark: { bg: '#0f1117', fg: '#d1d5db', link: '#818cf8' },
  sepia: { bg: '#f5ebe0', fg: '#4a3728', link: '#7c5c3a' },
  light: { bg: '#ffffff', fg: '#1a1a1a', link: '#4f46e5' },
};

interface TocItem {
  label: string;
  href: string;
}

export default function ReaderModal() {
  const tl = useT();
  const { book, close } = useReaderStore();
  const queryClient = useQueryClient();
  const { pref } = useSyncPrefStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<import('epubjs').Rendition | null>(null);
  const bookRef = useRef<import('epubjs').Book | null>(null);

  const currentCfiRef = useRef<string>('');
  const currentPctRef = useRef<number>(0);
  const currentChapterLabelRef = useRef<string>('');
  const touchStartX = useRef<number>(0);
  const syncTargetPctRef = useRef<number | null>(null);
  const syncChapterTitleRef = useRef<string | null>(null);
  const autoSyncRef = useRef<{ audioFileIndex?: number; audioSeconds?: number } | null>(null);
  const savedCfiRef = useRef<string | undefined>(undefined);
  const syncTargetHrefRef = useRef<string | null>(null);
  const pendingHighlightRef = useRef<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchHighlightCfiRef = useRef<string | null>(null);
  const typoRef = useRef({ lineHeight: 1.2, pageMargin: 2, fontFamily: 'default' });
  const tocRef = useRef<TocItem[]>([]);
  const SWIPE_THRESHOLD = 50;
  const epubPathRef = useRef<string | null>(null);
  epubPathRef.current = book?.ebookFiles?.[0]?.path ?? null;

  const [loading, setLoading] = useState(true);
  const [syncReady, setSyncReady] = useState(false);
  const [syncDialog, setSyncDialog] = useState<{
    sourceFormat: 'audiobook' | 'ebook';
    audioFileIndex?: number;
    audioSeconds?: number;
    syncInfo?: syncInfo;
    precomputedSync?: {
      spineHref?: string;
      percentage?: number;
      confidence: string;
      matchedText?: string;
    } | null;
    precomputedAudioSync?: {
      fileIndex?: number;
      fileSeconds?: number;
      audioSeconds?: number;
      percentage?: number;
      confidence: string;
    } | null;
  } | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState(100);
  const [percentage, setPercentage] = useState(0);
  const [currentSection, setCurrentSection] = useState('');
  const [totalLocations, setTotalLocations] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ cfi: string; excerpt: string; chapter: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontFamily, setFontFamily] = useState<
    | 'default'
    | 'georgia'
    | 'palatino'
    | 'times'
    | 'arial'
    | 'verdana'
    | 'trebuchet'
    | 'optima'
    | 'mono'
  >('default');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [pageMargin, setPageMargin] = useState(2); // percentage

  const fileUrl = book?.ebookFiles?.[0]
    ? `/api/reader/file?path=${encodeURIComponent(book.ebookFiles[0].path)}`
    : null;

  const bookPath = book?.path ?? '';

  // ── persist progress ────────────────────────────────────────────────────────
  const saveProgressNow = useCallback(async () => {
    if (!bookPath || (!currentCfiRef.current && !currentPctRef.current)) return;
    await readerService
      .updateProgress({
        bookPath,
        cfi: currentCfiRef.current || undefined,
        percentage: currentPctRef.current,
        ...(currentChapterLabelRef.current && { chapterTitle: currentChapterLabelRef.current }),
        epubPath: epubPathRef.current || undefined,
      })
      .catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['reader-progress-all'] });
  }, [bookPath, queryClient]);

  // ── sync check (phase 1) — fetch progress, show dialog or proceed directly ───
  useEffect(() => {
    if (!book || !fileUrl) return;

    const ext = book.ebookFiles?.[0]?.ext?.toLowerCase();
    if (ext === 'pdf') {
      setIsPdf(true);
      setLoading(false);
      setSyncReady(true);
      return;
    }

    setSyncReady(false);
    setSyncDialog(null);
    savedCfiRef.current = undefined;
    syncTargetHrefRef.current = null;
    syncTargetPctRef.current = null;
    setLoading(true);
    setShowToc(false);
    setPercentage(0);
    setCurrentSection('');

    const hasAudio = (book.audiobookFiles?.length ?? 0) > 0 || !!book._audioPresent;

    (async () => {
      try {
        const [readerRes, playerRes] = await Promise.all([
          readerService.getProgress(bookPath),
          hasAudio
            ? playerService.getProgress(bookPath).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
        ]);
        savedCfiRef.current = readerRes.data?.cfi;
        const readerPct = readerRes.data?.percentage ?? 0;
        const playerPct = playerRes.data?.percentage ?? 0;
        if (readerPct) setPercentage(readerPct);

        const ebookUpdatedAt = readerRes.data?.updatedAt ?? 0;
        const audioUpdatedAt = playerRes.data?.updatedAt ?? 0;
        const sourceFormat: 'audiobook' | 'ebook' =
          audioUpdatedAt >= ebookUpdatedAt ? 'audiobook' : 'ebook';
        if (hasAudio && pref !== 'ignore' && playerPct > 0 && audioUpdatedAt !== ebookUpdatedAt) {
          const audioChapterTitle = playerRes.data?.chapterTitle ?? null;
          const epubPath = book?.ebookFiles?.[0]?.path;
          const ebookChapter = readerRes.data?.chapterTitle ?? null;
          const audioFileIndex = playerRes.data?.fileIndex ?? null;
          const audioSeconds = playerRes.data?.position ?? null;
          const rawPath =
            audioFileIndex != null ? (book?.audiobookFiles?.[audioFileIndex]?.path ?? '') : '';
          const audioFileName = rawPath.split(/[/\\]/).pop() || null;
          // Use pre-saved snippets from progress files to skip the debug-positions API call
          const ebookSnippet = readerRes.data?.snippet ?? null;
          const audioSnippet = playerRes.data?.snippet ?? null;
          const snippetsReady = !!(ebookSnippet || audioSnippet);
          // For pref=sync, only auto-navigate when audio is ahead
          if (pref === 'sync' && sourceFormat === 'audiobook') {
            autoSyncRef.current = {
              audioFileIndex: audioFileIndex ?? undefined,
              audioSeconds: audioSeconds ?? undefined,
            };
            setSyncReady(true);
          } else if (sourceFormat === 'ebook') {
            setSyncReady(true); // ebook ahead: no dialog, just open normally
          } else {
            setSyncDialog({
              sourceFormat,
              audioFileIndex: audioFileIndex ?? undefined,
              audioSeconds: audioSeconds ?? undefined,
              syncInfo: {
                loading: !snippetsReady,
                ebookChapter,
                ebookUpdatedAt,
                ...(ebookSnippet && { ebookText: ebookSnippet }),
                audioFileName,
                audioUpdatedAt,
                ...(audioSnippet && { audioText: audioSnippet }),
              },
            });
            syncChapterTitleRef.current =
              sourceFormat === 'audiobook' ? audioChapterTitle : ebookChapter;

            if (epubPath) {
              (async () => {
                try {
                  if (sourceFormat === 'audiobook') {
                    // ── Audio → Ebook: text-based fuzzy search via transcript ──────────────
                    // Percentages are display-only — always use text-based search.
                    type T2EResult = {
                      spineHref?: string;
                      percentage?: number;
                      confidence: string;
                      matchedText?: string;
                    };
                    const [debugRes, t2eRes] = await Promise.all([
                      !snippetsReady
                        ? syncService
                            .debugPositions({ bookPath, cfi: savedCfiRef.current ?? undefined })
                            .catch(() => null)
                        : Promise.resolve(null),
                      syncService
                        .transcriptToEbook({
                          bookPath,
                          audioSeconds: audioSeconds ?? 0,
                          fileIndex: audioFileIndex ?? undefined,
                        })
                        .catch(() => null),
                    ]);

                    const bestSync = t2eRes?.data?.confidence === 'high' ? t2eRes.data : null;

                    setSyncDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            precomputedSync: bestSync,
                            syncInfo: {
                              ...prev.syncInfo,
                              ...(debugRes?.data ?? {}),
                              computedSpineHref: bestSync?.spineHref ?? null,
                              computedPct: bestSync?.percentage ?? null,
                              computedConfidence: bestSync?.confidence ?? null,
                              loading: false,
                            },
                          }
                        : null,
                    );
                  } else {
                    // ── Ebook → Audio: text-based fuzzy search via transcript ──────────────
                    // Percentages are display-only — always use text-based search.
                    type E2AResult = {
                      fileIndex?: number;
                      fileSeconds?: number;
                      audioSeconds?: number;
                      percentage?: number;
                      confidence: string;
                    };
                    const [debugRes, e2aRes] = await Promise.all([
                      !snippetsReady
                        ? syncService
                            .debugPositions({ bookPath, cfi: savedCfiRef.current ?? undefined })
                            .catch(() => null)
                        : Promise.resolve(null),
                      syncService
                        .ebookToAudio({
                          bookPath,
                          ebookPct: readerPct,
                          cfi: savedCfiRef.current ?? undefined,
                        })
                        .catch(() => null),
                    ]);

                    const bestAudioSync = e2aRes?.data?.confidence === 'high' ? e2aRes.data : null;

                    setSyncDialog((prev) =>
                      prev
                        ? {
                            ...prev,
                            precomputedAudioSync: bestAudioSync,
                            syncInfo: {
                              ...prev.syncInfo,
                              ...(debugRes?.data ?? {}),
                              computedConfidence: bestAudioSync?.confidence ?? null,
                              loading: false,
                            },
                          }
                        : null,
                    );
                  }
                } catch {
                  setSyncDialog((prev) =>
                    prev ? { ...prev, syncInfo: { ...prev.syncInfo, loading: false } } : null,
                  );
                }
              })();
            } else {
              setSyncDialog((prev) =>
                prev ? { ...prev, syncInfo: { ...prev.syncInfo, loading: false } } : null,
              );
            }
            // epub loads only after user dismisses the dialog (syncReady set in onSync/onKeep)
            return;
          }
        } else {
          setSyncReady(true);
        }
      } catch {
        setSyncReady(true); /* on error, proceed to load epub */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  // ── epub init (phase 2) — only after sync dialog dismissed ──────────────────
  useEffect(() => {
    if (!book || !fileUrl || !syncReady) return;

    const ext = book.ebookFiles?.[0]?.ext?.toLowerCase();
    if (ext === 'pdf') return; // handled in phase 1

    let destroyed = false;

    (async () => {
      if (destroyed || !containerRef.current) return;

      const ePub = (await import('epubjs')).default;
      const epubBook = ePub(fileUrl);
      bookRef.current = epubBook;

      const rendition = epubBook.renderTo(containerRef.current, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'auto',
        minSpreadWidth: 768,
      });
      renditionRef.current = rendition;

      // Inject styles + highlight on every page load
      rendition.hooks.content.register((contents: { document: Document }) => {
        const doc = contents.document;

        // ── Typography (line-height, margin, font-family) ─────────────────────
        const { lineHeight: lh, pageMargin: pm, fontFamily: ff } = typoRef.current;
        const fontMap: Record<string, string> = {
          default: 'inherit',
          georgia: 'Georgia, "Times New Roman", serif',
          palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
          times: '"Times New Roman", Times, serif',
          arial: 'Arial, Helvetica, sans-serif',
          verdana: 'Verdana, Geneva, sans-serif',
          trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
          optima: 'Optima, Candara, "Gill Sans", sans-serif',
          mono: '"Courier New", Courier, monospace',
        };
        let typoStyle = doc.getElementById('omnibus-typo') as HTMLStyleElement | null;
        if (!typoStyle) {
          typoStyle = doc.createElement('style') as HTMLStyleElement;
          typoStyle.id = 'omnibus-typo';
          (doc.head || doc.documentElement).appendChild(typoStyle);
        }
        typoStyle.textContent = `
          body, p, div, span, li, td { line-height: ${lh} !important; }
          body { font-family: ${fontMap[ff]} !important; }
        `;

        // ── Highlight animation ───────────────────────────────────────────────
        if (!doc.getElementById('omnibus-hl-style')) {
          const hlStyle = doc.createElement('style');
          hlStyle.id = 'omnibus-hl-style';
          hlStyle.textContent = `
            @keyframes omnibus-fade {
              0%   { background: rgba(99,102,241,0.55); }
              30%  { background: rgba(99,102,241,0.55); }
              100% { background: transparent; }
            }
            .omnibus-hl {
              color: #fff !important;
              border-radius: 2px;
              padding: 0 1px;
              animation: omnibus-fade 5s ease-out forwards;
            }
          `;
          (doc.head || doc.documentElement).appendChild(hlStyle);
        }

        // ── Pending text highlight ────────────────────────────────────────────
        const text = pendingHighlightRef.current;
        if (!text) return;
        pendingHighlightRef.current = null;
        try {
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          const searchText = text.toLowerCase().slice(0, 60);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const content = (node.textContent ?? '').toLowerCase();
            const idx = content.indexOf(searchText);
            if (idx !== -1) {
              const range = doc.createRange();
              range.setStart(node, idx);
              range.setEnd(node, Math.min(idx + text.length, node.textContent!.length));
              const mark = doc.createElement('mark');
              mark.className = 'omnibus-hl';
              mark.style.cssText =
                'background:rgba(99,102,241,0.45);border-radius:2px;padding:0 1px;';
              try {
                range.surroundContents(mark);
                mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } catch {
                /* range spans multiple nodes */
              }
              break;
            }
          }
        } catch {
          /* ignore */
        }
      });

      // Apply theme
      const t = THEMES[theme];
      rendition.themes.register('custom', {
        body: {
          background: `${t.bg} !important`,
          color: `${t.fg} !important`,
          'font-size': `${fontSize}% !important`,
        },
        'a:link': { color: `${t.link} !important` },
        '*': { 'max-width': '100% !important' },
      });
      rendition.themes.select('custom');

      // Navigate to sync href target (high-confidence) or saved CFI
      const initialTarget = syncTargetHrefRef.current ?? savedCfiRef.current;
      syncTargetHrefRef.current = null;
      if (initialTarget) {
        await rendition.display(initialTarget);
      } else {
        await rendition.display();
      }

      setLoading(false);

      // TOC
      epubBook.loaded.navigation.then((nav) => {
        const items = nav.toc.map((item) => ({ label: item.label.trim(), href: item.href }));
        tocRef.current = items;
        setToc(items);
      });

      // Swipe inside iframe
      rendition.on('touchstart', (event: TouchEvent) => {
        touchStartX.current = event.touches[0].clientX;
      });
      rendition.on('touchend', (event: TouchEvent) => {
        const delta = event.changedTouches[0].clientX - touchStartX.current;
        if (delta > SWIPE_THRESHOLD) rendition.prev();
        else if (delta < -SWIPE_THRESHOLD) rendition.next();
      });

      // Track location changes
      rendition.on('relocated', (location: import('epubjs').Location) => {
        const cfi = location.start.cfi;
        const href = location.start.href || '';
        currentCfiRef.current = cfi;
        setCurrentSection(href);
        // Update current chapter label for progress saving
        // Strip fragment (#anchor) before matching — epubjs may include it in href
        const hrefBase = href.split('#')[0];
        const matchedToc = tocRef.current.find((item) => {
          const tocBase = item.href.split('#')[0];
          return hrefBase === tocBase || hrefBase.endsWith(tocBase) || tocBase.endsWith(hrefBase);
        });
        currentChapterLabelRef.current = matchedToc?.label ?? '';
        const pct = epubBook.locations.percentageFromCfi(cfi);
        if (pct) {
          currentPctRef.current = pct;
          setPercentage(pct);
          saveProgressNow();
        }
      });

      // Generate locations for percentage (async, can take a moment)
      epubBook.locations
        .generate(1024)
        .then(async () => {
          const total = (epubBook.locations as unknown as { total: number }).total ?? 0;
          setTotalLocations(total);

          // Recompute percentage from current CFI now that locations are ready
          if (currentCfiRef.current) {
            const pct = epubBook.locations.percentageFromCfi(currentCfiRef.current);
            if (pct && pct !== currentPctRef.current) {
              currentPctRef.current = pct;
              setPercentage(pct);
              saveProgressNow();
            }
          }

          // Auto-sync (pref === 'sync'): silently sync to audio position
          if (autoSyncRef.current !== null) {
            const { audioFileIndex: afi, audioSeconds: asec } = autoSyncRef.current;
            autoSyncRef.current = null;
            const epubPathForSync = book?.ebookFiles?.[0]?.path;
            // Sync is text-based only — percentages are display data, never used for navigation.
            if (epubPathForSync) {
              try {
                const t2e = await syncService.transcriptToEbook({
                  bookPath,
                  audioSeconds: asec ?? 0,
                  fileIndex: afi,
                });
                if (t2e.data.confidence === 'high') {
                  if (t2e.data.cfi) {
                    if (t2e.data.matchedText) pendingHighlightRef.current = t2e.data.matchedText;
                    rendition.display(t2e.data.cfi);
                    return;
                  }
                  if (t2e.data.spineHref) {
                    if (t2e.data.matchedText) pendingHighlightRef.current = t2e.data.matchedText;
                    rendition.display(t2e.data.spineHref);
                    return;
                  }
                }
              } catch {
                /* ignore — epub stays at saved position */
              }
            }
            // No high-confidence match → stay at saved CFI position (already displayed)
            return;
          }

          // Apply pending cross-format sync (from dialog)
          if (syncTargetPctRef.current !== null) {
            const cfi = epubBook.locations.cfiFromPercentage(syncTargetPctRef.current);
            if (cfi) rendition.display(cfi);
            syncTargetPctRef.current = null;
          } else if (currentCfiRef.current) {
            // Now that locations are ready, compute accurate percentage and save
            const pct = epubBook.locations.percentageFromCfi(currentCfiRef.current);
            if (pct) {
              currentPctRef.current = pct;
              setPercentage(pct);
              saveProgressNow();
            }
          }
        })
        .catch(() => {});
    })();

    return () => {
      destroyed = true;
      // Final save on unmount
      if (bookPath && (currentCfiRef.current || currentPctRef.current)) {
        readerService
          .updateProgress({
            bookPath,
            cfi: currentCfiRef.current || undefined,
            percentage: currentPctRef.current,
          })
          .then(() => queryClient.invalidateQueries({ queryKey: ['reader-progress-all'] }))
          .catch(() => {});
      }
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, syncReady]);

  // ── theme / font / typography changes ────────────────────────────────────────
  useEffect(() => {
    if (!renditionRef.current) return;
    const t = THEMES[theme];
    const fontMap: Record<string, string> = {
      default: 'inherit',
      georgia: 'Georgia, "Times New Roman", serif',
      palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
      times: '"Times New Roman", Times, serif',
      arial: 'Arial, Helvetica, sans-serif',
      verdana: 'Verdana, Geneva, sans-serif',
      trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
      optima: 'Optima, Candara, "Gill Sans", sans-serif',
      mono: '"Courier New", Courier, monospace',
    };
    // Update the ref so newly loaded pages get the right values
    typoRef.current = { lineHeight, pageMargin, fontFamily };

    // Update epubjs theme (handles bg, fg, font-size)
    renditionRef.current.themes.register('custom', {
      body: {
        background: `${t.bg} !important`,
        color: `${t.fg} !important`,
        'font-size': `${fontSize}% !important`,
      },
      'a:link': { color: `${t.link} !important` },
      '*': { 'max-width': '100% !important' },
    });
    renditionRef.current.themes.select('custom');

    // Directly patch the omnibus-typo <style> in every currently-loaded iframe
    const typoCss = `
      body, p, div, span, li, td { line-height: ${lineHeight} !important; }
      body { font-family: ${fontMap[fontFamily]} !important; }`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const views: any[] = (renditionRef.current as any).manager?.views?._views ?? [];
      views.forEach((view: any) => {
        const doc: Document | undefined = view.document ?? view.contents?.document;
        if (!doc) return;
        let el = doc.getElementById('omnibus-typo') as HTMLStyleElement | null;
        if (!el) {
          el = doc.createElement('style') as HTMLStyleElement;
          el.id = 'omnibus-typo';
          (doc.head ?? doc.documentElement).appendChild(el);
        }
        el.textContent = typoCss;
      });
    } catch {
      /* ignore */
    }

    // Force epubjs to repaginate with the new CSS (needed for margins & line-height)
    setTimeout(() => {
      if (!renditionRef.current || !containerRef.current) return;
      const { offsetWidth: w, offsetHeight: h } = containerRef.current;
      renditionRef.current.resize(w, h);
    }, 30);
  }, [theme, fontSize, fontFamily, lineHeight, pageMargin]);

  // ── keyboard + outer touch nav ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current?.next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') renditionRef.current?.prev();
      if (e.key === 'Escape') handleClose();
    }
    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
    }
    function onTouchEnd(e: TouchEvent) {
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      if (delta > SWIPE_THRESHOLD) renditionRef.current?.prev();
      else if (delta < -SWIPE_THRESHOLD) renditionRef.current?.next();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => handleSearch(value), 500);
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim() || !bookRef.current) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const results: Array<{ cfi: string; excerpt: string; chapter: string }> = [];
    const tocs = tocRef.current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Promise.all(
        (bookRef.current as any).spine.spineItems.map((item: any) =>
          item
            .load((bookRef.current as any).load.bind(bookRef.current))
            .then(() => {
              const itemHref: string = item.href ?? '';
              const itemBase = itemHref.split('#')[0];
              const tocMatch = tocs.find((t) => {
                const tocBase = t.href.split('#')[0];
                return (
                  itemBase === tocBase || itemBase.endsWith(tocBase) || tocBase.endsWith(itemBase)
                );
              });
              const chapter = tocMatch?.label ?? '';
              const found: Array<{ cfi: string; excerpt: string }> = item.find(query) ?? [];
              results.push(...found.map((r) => ({ ...r, chapter })));
              item.unload();
            })
            .catch(() => {}),
        ),
      );
    } catch {
      /* ignore */
    }
    setSearchResults(results);
    setSearchLoading(false);
  }

  function handleSearchResultClick(r: { cfi: string; excerpt: string; chapter: string }) {
    const rendition = renditionRef.current;
    if (!rendition) return;
    // Remove previous search highlight
    if (searchHighlightCfiRef.current) {
      try {
        rendition.annotations.remove(searchHighlightCfiRef.current, 'highlight');
      } catch {
        /* ignore */
      }
    }
    searchHighlightCfiRef.current = r.cfi;
    rendition.display(r.cfi).then(() => {
      try {
        rendition.annotations.highlight(r.cfi, {}, undefined, 'omnibus-search-hl', {
          fill: 'rgba(99,102,241,0.45)',
          'fill-opacity': '1',
        });
      } catch {
        /* ignore if CFI not highlightable */
      }
    });
  }

  async function handleMarkComplete() {
    await readerService.markComplete(bookPath);
    queryClient.invalidateQueries({ queryKey: ['reader-progress-all'] });
    setPercentage(1);
    toast.success(tl('reader_mark_complete'));
  }

  function handleClose() {
    if (bookPath && (currentCfiRef.current || currentPctRef.current)) {
      readerService
        .updateProgress({
          bookPath,
          cfi: currentCfiRef.current || undefined,
          percentage: currentPctRef.current,
        })
        .then(() => queryClient.invalidateQueries({ queryKey: ['reader-progress-all'] }))
        .catch(() => {});
    }
    close();
  }

  if (!book || !fileUrl) return null;

  const cover = coverUrl(book.savedMeta?.cover || book.cover);
  const title = book.savedMeta?.title || book.title;
  const themeColors = THEMES[theme];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: themeColors.bg }}>
      {/* Header — row 1: close + cover + title */}
      <div
        className="flex items-center gap-2 px-3 h-11 flex-shrink-0 border-b"
        style={{
          background: themeColors.bg,
          borderColor: theme === 'dark' ? '#ffffff15' : '#00000015',
        }}
      >
        {cover && <img src={cover} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />}
        <span className="text-sm font-medium truncate flex-1" style={{ color: themeColors.fg }}>
          {title}
        </span>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" style={{ color: themeColors.fg }} />
        </button>
      </div>

      {/* Header — row 2: toc left | zoom center | theme + complete right */}
      <div
        className="flex items-center px-4 h-12 flex-shrink-0 border-b"
        style={{
          background: themeColors.bg,
          borderColor: theme === 'dark' ? '#ffffff15' : '#00000015',
        }}
      >
        {/* Left: TOC + Search */}
        <div className="flex-1 flex items-center justify-start gap-1">
          {toc.length > 0 && (
            <button
              onClick={() => {
                setShowToc((v) => !v);
                setShowSearch(false);
              }}
              className={`p-2 rounded-lg transition-colors ${showToc ? 'bg-indigo-500/30' : 'hover:bg-white/10'}`}
            >
              <List className="w-5 h-5" style={{ color: showToc ? '#818cf8' : themeColors.fg }} />
            </button>
          )}
          {!isPdf && (
            <button
              onClick={() => {
                setShowSearch((v) => !v);
                setShowToc(false);
              }}
              className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-indigo-500/30' : 'hover:bg-white/10'}`}
            >
              <Search
                className="w-5 h-5"
                style={{ color: showSearch ? '#818cf8' : themeColors.fg }}
              />
            </button>
          )}
        </div>

        {/* Center: font size */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFontSize((s) => Math.max(70, s - 10))}
            className="p-2 rounded-lg hover:bg-white/10"
          >
            <Minus className="w-5 h-5" style={{ color: themeColors.fg }} />
          </button>
          <span className="text-xs w-9 text-center tabular-nums" style={{ color: themeColors.fg }}>
            {fontSize}%
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(180, s + 10))}
            className="p-2 rounded-lg hover:bg-white/10"
          >
            <Plus className="w-5 h-5" style={{ color: themeColors.fg }} />
          </button>
        </div>

        {/* Right: theme + settings + mark complete */}
        <div className="flex-1 flex items-center justify-end gap-1">
          <button
            onClick={() =>
              setTheme((t) => (t === 'dark' ? 'sepia' : t === 'sepia' ? 'light' : 'dark'))
            }
            className="p-2 rounded-lg hover:bg-white/10"
          >
            {theme === 'dark' ? (
              <Moon className="w-5 h-5" style={{ color: themeColors.fg }} />
            ) : theme === 'sepia' ? (
              <AlignLeft className="w-5 h-5" style={{ color: themeColors.fg }} />
            ) : (
              <Sun className="w-5 h-5" style={{ color: themeColors.fg }} />
            )}
          </button>
          {!isPdf && (
            <button
              onClick={() => {
                setShowSettings((v) => !v);
                setShowToc(false);
                setShowSearch(false);
              }}
              className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-indigo-500/30' : 'hover:bg-white/10'}`}
            >
              <Settings2
                className="w-5 h-5"
                style={{ color: showSettings ? '#818cf8' : themeColors.fg }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* TOC overlay (floats over the reader) */}
        {showToc && (
          <div
            className="absolute top-0 left-0 bottom-0 z-20 w-64 flex flex-col shadow-2xl"
            style={{
              background: themeColors.bg,
              borderRight: `1px solid ${theme === 'dark' ? '#ffffff15' : '#00000015'}`,
            }}
          >
            <div
              className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
              style={{ borderColor: theme === 'dark' ? '#ffffff15' : '#00000015' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: themeColors.fg, opacity: 0.5 }}
              >
                {tl('reader_toc_title')}
              </span>
              <button onClick={() => setShowToc(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: themeColors.fg }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {toc.map((item, i) => {
                const active =
                  currentSection.includes(item.href) || item.href.includes(currentSection);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      renditionRef.current?.display(item.href);
                      setShowToc(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex-shrink-0 ${active ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
                    style={{ color: active ? '#818cf8' : themeColors.fg }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings overlay */}
        {showSettings && (
          <div
            className="absolute top-0 right-0 bottom-0 z-20 w-72 flex flex-col shadow-2xl overflow-y-auto"
            style={{
              background: themeColors.bg,
              borderLeft: `1px solid ${theme === 'dark' ? '#ffffff15' : '#00000015'}`,
            }}
          >
            <div
              className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: theme === 'dark' ? '#ffffff15' : '#00000015' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: themeColors.fg, opacity: 0.5 }}
              >
                {tl('reader_settings_title')}
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-4 h-4" style={{ color: themeColors.fg }} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-6">
              {/* Theme */}
              <div>
                <p
                  className="text-[11px] uppercase tracking-widest mb-2"
                  style={{ color: themeColors.fg, opacity: 0.4 }}
                >
                  {tl('reader_settings_theme')}
                </p>
                <div className="flex gap-2">
                  {(['dark', 'sepia', 'light'] as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className="flex-1 py-2 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        background: THEMES[t].bg,
                        color: THEMES[t].fg,
                        borderColor: theme === t ? '#818cf8' : themeColors.fg + '20',
                        boxShadow: theme === t ? '0 0 0 1px #818cf8' : 'none',
                      }}
                    >
                      {t === 'dark' ? '🌙' : t === 'sepia' ? '📜' : '☀️'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font family */}
              <div>
                <p
                  className="text-[11px] uppercase tracking-widest mb-2"
                  style={{ color: themeColors.fg, opacity: 0.4 }}
                >
                  {tl('reader_settings_font')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'default', label: tl('reader_font_default'), css: 'inherit' },
                      { id: 'georgia', label: 'Georgia', css: 'Georgia, serif' },
                      { id: 'palatino', label: 'Palatino', css: '"Palatino Linotype", serif' },
                      { id: 'times', label: 'Times', css: '"Times New Roman", serif' },
                      { id: 'arial', label: 'Arial', css: 'Arial, sans-serif' },
                      { id: 'verdana', label: 'Verdana', css: 'Verdana, sans-serif' },
                      { id: 'trebuchet', label: 'Trebuchet', css: '"Trebuchet MS", sans-serif' },
                      { id: 'optima', label: 'Optima', css: 'Optima, Candara, sans-serif' },
                      { id: 'mono', label: 'Mono', css: '"Courier New", monospace' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFontFamily(f.id)}
                      className="py-2 px-2 rounded-lg border text-xs transition-all text-left truncate"
                      style={{
                        borderColor: fontFamily === f.id ? '#818cf8' : themeColors.fg + '20',
                        background: fontFamily === f.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                        color: fontFamily === f.id ? '#818cf8' : themeColors.fg,
                        fontFamily: f.css,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font size */}
              <div>
                <p
                  className="text-[11px] uppercase tracking-widest mb-2"
                  style={{ color: themeColors.fg, opacity: 0.4 }}
                >
                  {tl('reader_settings_size')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFontSize((s) => Math.max(70, s - 10))}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={{ borderColor: themeColors.fg + '20', color: themeColors.fg }}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <div
                    className="flex-1 text-center text-sm font-semibold tabular-nums"
                    style={{ color: themeColors.fg }}
                  >
                    {fontSize}%
                  </div>
                  <button
                    onClick={() => setFontSize((s) => Math.min(200, s + 10))}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={{ borderColor: themeColors.fg + '20', color: themeColors.fg }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Line height */}
              <div>
                <p
                  className="text-[11px] uppercase tracking-widest mb-2"
                  style={{ color: themeColors.fg, opacity: 0.4 }}
                >
                  {tl('reader_settings_line_height')}
                </p>
                <div className="flex gap-2">
                  {([1.2, 1.5, 1.6, 1.8, 2.0] as const).map((lh) => (
                    <button
                      key={lh}
                      onClick={() => setLineHeight(lh)}
                      className="flex-1 py-1.5 rounded-lg border text-xs transition-all"
                      style={{
                        borderColor: lineHeight === lh ? '#818cf8' : themeColors.fg + '20',
                        background: lineHeight === lh ? 'rgba(99,102,241,0.12)' : 'transparent',
                        color: lineHeight === lh ? '#818cf8' : themeColors.fg,
                      }}
                    >
                      {lh}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin */}
              <div>
                <p
                  className="text-[11px] uppercase tracking-widest mb-2"
                  style={{ color: themeColors.fg, opacity: 0.4 }}
                >
                  {tl('reader_settings_margin')}
                </p>
                <div className="flex gap-2">
                  {([2, 5, 8, 12, 18] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPageMargin(m)}
                      className="flex-1 py-1.5 rounded-lg border text-xs transition-all"
                      style={{
                        borderColor: pageMargin === m ? '#818cf8' : themeColors.fg + '20',
                        background: pageMargin === m ? 'rgba(99,102,241,0.12)' : 'transparent',
                        color: pageMargin === m ? '#818cf8' : themeColors.fg,
                      }}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {showSearch && (
          <div
            className="absolute top-0 left-0 bottom-0 z-20 w-80 flex flex-col shadow-2xl"
            style={{
              background: themeColors.bg,
              borderRight: `1px solid ${theme === 'dark' ? '#ffffff15' : '#00000015'}`,
            }}
          >
            {/* Search header */}
            <div
              className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
              style={{ borderColor: theme === 'dark' ? '#ffffff15' : '#00000015' }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: themeColors.fg, opacity: 0.5 }}
              >
                {tl('reader_search_title')}
              </span>
              <button
                onClick={() => setShowSearch(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-4 h-4" style={{ color: themeColors.fg }} />
              </button>
            </div>
            {/* Search input */}
            <div
              className="px-3 py-2.5 border-b flex items-center gap-2"
              style={{ borderColor: theme === 'dark' ? '#ffffff15' : '#00000015' }}
            >
              <Search
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: themeColors.fg, opacity: 0.4 }}
              />
              <input
                autoFocus
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder={tl('reader_search_placeholder')}
                className="flex-1 bg-transparent outline-none text-xs"
                style={{ color: themeColors.fg }}
              />
              {searchLoading && (
                <svg className="animate-spin w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
            </div>
            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {!searchLoading && searchQuery && searchResults.length === 0 && (
                <p className="px-3 py-4 text-xs opacity-40" style={{ color: themeColors.fg }}>
                  {tl('reader_search_no_results')}
                </p>
              )}
              {searchResults.map((r, i) => {
                const showChapter = r.chapter && r.chapter !== searchResults[i - 1]?.chapter;
                return (
                  <React.Fragment key={i}>
                    {showChapter && (
                      <div
                        className="px-3 pt-3 pb-1"
                        style={{ color: themeColors.fg, opacity: 0.4 }}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-widest">
                          {r.chapter}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => handleSearchResultClick(r)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 border-b"
                      style={{
                        color: themeColors.fg,
                        borderColor: theme === 'dark' ? '#ffffff08' : '#00000008',
                      }}
                    >
                      <span
                        dangerouslySetInnerHTML={{
                          __html: r.excerpt.replace(
                            new RegExp(
                              `(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
                              'gi',
                            ),
                            '<mark style="background:rgba(99,102,241,0.35);color:inherit;border-radius:2px">$1</mark>',
                          ),
                        }}
                      />
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Reader area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: themeColors.bg }}
            >
              <svg className="animate-spin w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {isPdf ? (
            <iframe src={fileUrl} className="flex-1 w-full border-0" title={title} />
          ) : (
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                paddingLeft: `${pageMargin}%`,
                paddingRight: `${pageMargin}%`,
                background: themeColors.bg,
              }}
            >
              <div ref={containerRef} className="w-full h-full overflow-hidden" />
            </div>
          )}

          {/* Page nav buttons */}
          {!isPdf && (
            <>
              <button
                onClick={() => renditionRef.current?.prev()}
                className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity group"
                aria-label={tl('reader_prev_page')}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/20 group-hover:bg-black/40 transition-colors">
                  <ChevronLeft className="w-4 h-4" style={{ color: themeColors.fg }} />
                </span>
              </button>
              <button
                onClick={() => renditionRef.current?.next()}
                className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity group"
                aria-label={tl('reader_next_page')}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/20 group-hover:bg-black/40 transition-colors">
                  <ChevronRight className="w-4 h-4" style={{ color: themeColors.fg }} />
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!isPdf && (
        <>
          {totalLocations > 0 && percentage < 1 && (
            <div className="flex-shrink-0 px-3 py-0.5 flex justify-end">
              <span
                className="text-[10px] tabular-nums"
                style={{ color: theme === 'dark' ? '#ffffff40' : '#00000040' }}
              >
                {tl('reader_pages_remaining').replace(
                  '{n}',
                  String(Math.round((1 - percentage) * totalLocations)),
                )}
              </span>
            </div>
          )}
          <div
            className="h-0.5 flex-shrink-0"
            style={{ background: theme === 'dark' ? '#ffffff10' : '#00000010' }}
          >
            <div
              className={`h-full transition-all duration-300 ${percentage >= 1 ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(percentage * 100, 100)}%` }}
            />
          </div>
        </>
      )}

      {syncDialog && (
        <ProgressSyncDialog
          sourceFormat={syncDialog.sourceFormat}
          syncInfo={syncDialog.syncInfo}
          onSync={() => {
            const {
              precomputedSync,
              precomputedAudioSync,
              sourceFormat: dialogSourceFormat,
              syncInfo: dialogsyncInfo,
            } = syncDialog;
            setSyncDialog(null);
            syncChapterTitleRef.current = null;

            if (dialogSourceFormat === 'ebook') {
              // ── Ebook → Audio: seek the player to the computed position ──────────
              if (precomputedAudioSync?.confidence === 'high') {
                const fileIdx = precomputedAudioSync.fileIndex ?? 0;
                const fileSecs = precomputedAudioSync.fileSeconds ?? 0;
                const audioPct = precomputedAudioSync.percentage ?? 0;

                // Seek the player if it's currently loaded on this book
                const playerState = usePlayerStore.getState();
                if (playerState.track?.bookPath === bookPath) {
                  if (playerState.track.fileIndex === fileIdx) {
                    playerState.seek(fileSecs);
                  } else {
                    playerState.play({ ...playerState.track, fileIndex: fileIdx }, fileSecs);
                  }
                }

                // Update server-side audio progress; stamp ebookUpdatedAt so dialog won't reappear
                playerService
                  .updateProgress({
                    bookPath,
                    position: fileSecs,
                    fileIndex: fileIdx,
                    percentage: audioPct,
                    updatedAt: dialogsyncInfo?.ebookUpdatedAt ?? Date.now(),
                  })
                  .catch(() => {});
              } else {
                // No high-confidence match — stamp audio timestamp to match ebook so dialog won't reappear
                const ebookTs = dialogsyncInfo?.ebookUpdatedAt;
                if (bookPath && ebookTs) {
                  playerService.updateProgress({ bookPath, updatedAt: ebookTs }).catch(() => {});
                }
              }
            } else {
              // ── Audio → Ebook: navigate the epub to the computed ebook position ──
              // Sync is text-based only — percentages are display data, never used for navigation.
              // If no high-confidence text match was found, load epub at saved position (no nav).
              if (precomputedSync?.confidence === 'high') {
                if (precomputedSync.spineHref) {
                  syncTargetHrefRef.current = precomputedSync.spineHref;
                  if (precomputedSync.matchedText)
                    pendingHighlightRef.current = precomputedSync.matchedText;
                }
                // percentage-only result from sync map: also valid (sync map built from text alignment)
                else if (precomputedSync.percentage) {
                  syncTargetPctRef.current = precomputedSync.percentage;
                }
              }
              // No high-confidence match → epub loads at savedCfiRef (no sync navigation)

              // Stamp ebook progress with audio timestamp so the dialog won't reappear
              const audioTs = dialogsyncInfo?.audioUpdatedAt;
              if (bookPath && audioTs) {
                readerService.updateProgress({ bookPath, updatedAt: audioTs }).catch(() => {});
              }
            }

            setSyncReady(true);
          }}
          onKeep={() => {
            // Stamp ebook progress with audio timestamp so the dialog won't reappear
            const audioTs = syncDialog.syncInfo?.audioUpdatedAt;
            if (bookPath && audioTs) {
              readerService.updateProgress({ bookPath, updatedAt: audioTs }).catch(() => {});
            }
            setSyncDialog(null);
            syncChapterTitleRef.current = null;
            setSyncReady(true);
          }}
          onClose={() => {
            setSyncDialog(null);
            syncChapterTitleRef.current = null;
            setSyncReady(true);
          }}
        />
      )}
    </div>
  );
}
