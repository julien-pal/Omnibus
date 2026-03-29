import AdmZip from 'adm-zip';
import path from 'path';
import logger from '../lib/logger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CFI = require('epub-cfi-resolver');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DOMParser } = require('@xmldom/xmldom');

export interface SpineItem {
  id: string;
  href: string; // relative to OPF directory
  absoluteHref: string; // relative to epub root (zip entry path)
  text: string;
  charStart: number;
  charEnd: number;
}

export interface EpubTextMap {
  items: SpineItem[];
  totalChars: number;
}

function normalizeUnicode(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // curly/prime apostrophes → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // curly double quotes → "
    .replace(/[\u00AB\u00BB\u2039\u203A]/g, '"')             // guillemets → "
    .replace(/[\u2013\u2014\u2015]/g, '-')                   // en/em dash → -
    .replace(/\u2026/g, '...')                               // ellipsis → ...
    .replace(/\u00A0/g, ' ');                                // non-breaking space → space
}

function stripHtml(html: string): string {
  return normalizeUnicode(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/(\w)<[^>]+>(\w)/g, '$1$2')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function parseOpf(zip: AdmZip): {
  opfDir: string;
  manifest: Record<string, string>;
  spineIds: string[];
} {
  const containerEntry = zip.getEntry('META-INF/container.xml');
  if (!containerEntry) throw new Error('Invalid EPUB: missing META-INF/container.xml');
  const containerXml = containerEntry.getData().toString('utf8');
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error('Invalid EPUB: cannot find OPF path');
  const opfPath = opfMatch[1];
  const opfDir = path.dirname(opfPath) === '.' ? '' : path.dirname(opfPath);

  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) throw new Error(`Invalid EPUB: missing OPF at ${opfPath}`);
  const opfXml = opfEntry.getData().toString('utf8');

  const manifest: Record<string, string> = {};
  // Parse id and href independently — handles any attribute order
  const manifestRe = /<item\s([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = manifestRe.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
    if (idMatch && hrefMatch) manifest[idMatch[1]] = hrefMatch[1];
  }

  const spineIds: string[] = [];
  const spineRe = /<itemref\s[^>]*idref="([^"]+)"/g;
  while ((m = spineRe.exec(opfXml)) !== null) spineIds.push(m[1]);

  return { opfDir, manifest, spineIds };
}

// ── EPUB text map cache ──────────────────────────────────────────────────────
const epubTextCache = new Map<string, { map: EpubTextMap; mtime: number }>();

export function extractEpubText(epubPath: string): EpubTextMap {
  // Check cache — invalidate if file has been modified
  const stat = require('fs').statSync(epubPath);
  const cached = epubTextCache.get(epubPath);
  if (cached && cached.mtime === stat.mtimeMs) return cached.map;

  const zip = new AdmZip(epubPath);
  const { opfDir, manifest, spineIds } = parseOpf(zip);

  const items: SpineItem[] = [];
  let charOffset = 0;

  for (const id of spineIds) {
    const href = manifest[id];
    if (!href) continue;

    const absoluteHref = opfDir ? `${opfDir}/${href}` : href;
    const entry = zip.getEntry(absoluteHref) || zip.getEntry(absoluteHref.replace(/^\//, ''));
    if (!entry) continue;

    const html = entry.getData().toString('utf8');
    const text = stripHtml(html);

    items.push({
      id,
      href,
      absoluteHref,
      text,
      charStart: charOffset,
      charEnd: charOffset + text.length,
    });
    charOffset += text.length;
  }

  const map = { items, totalChars: charOffset };
  epubTextCache.set(epubPath, { map, mtime: stat.mtimeMs });
  return map;
}

/** Given a percentage (0-1), return the text around that position (up to maxChars). */
export function getTextAtPercentage(map: EpubTextMap, pct: number, maxChars = 500): string {
  const targetChar = Math.floor(pct * map.totalChars);

  for (const item of map.items) {
    if (targetChar >= item.charStart && targetChar < item.charEnd) {
      const localOffset = targetChar - item.charStart;
      const start = Math.max(0, localOffset - 100);
      const end = Math.min(item.text.length, localOffset + maxChars - 100);
      return item.text.slice(start, end);
    }
  }

  const last = map.items[map.items.length - 1];
  return last ? last.text.slice(-maxChars) : '';
}

/** Given a text match position in totalChars, return the percentage. */
export function charPositionToPercentage(map: EpubTextMap, charPos: number): number {
  return map.totalChars > 0 ? charPos / map.totalChars : 0;
}

/** Find the spine item href that contains the given char position. */
export function charPositionToHref(map: EpubTextMap, charPos: number): string | null {
  for (const item of map.items) {
    if (charPos >= item.charStart && charPos < item.charEnd) {
      return item.absoluteHref;
    }
  }
  return null;
}

/**
 * Extract text around a precise CFI position using epub-cfi-resolver + xmldom.
 * Returns up to `maxChars` characters of plain text centred on the CFI location.
 * Returns empty string on any error (falls back to percentage-based extraction).
 */
/**
 * Extract the spine item index from the CFI package step.
 * e.g. epubcfi(/6/68!/4/...) → spineIndex 33 (0-based, since CFI uses even steps)
 */
function spineIndexFromCfi(cfi: string): number {
  // Match the package document step: /6/N! where N is the CFI step number
  const m = cfi.match(/epubcfi\(\/\d+\/(\d+)!/);
  if (!m) return -1;
  return Math.floor(parseInt(m[1], 10) / 2) - 1;
}

export function getTextAtCfi(epubPath: string, cfi: string, maxChars = 500): string {
  try {
    logger.info(`[cfi] start — cfi="${cfi}"`);
    const zip = new AdmZip(epubPath);
    const { opfDir, manifest, spineIds } = parseOpf(zip);
    logger.info(`[cfi] spine items: ${spineIds.length}, opfDir="${opfDir}"`);

    // Step 1: resolve spine item from CFI numerically (avoids querySelector requirement)
    const spineIdx = spineIndexFromCfi(cfi);
    logger.info(`[cfi] spineIdx=${spineIdx}`);
    if (spineIdx < 0 || spineIdx >= spineIds.length) {
      logger.warn(`[cfi] spine index ${spineIdx} out of range (${spineIds.length} items)`);
      return '';
    }
    const spineItemId = spineIds[spineIdx];
    const spineItemHref = manifest[spineItemId];
    logger.info(`[cfi] spineItemId="${spineItemId}" href="${spineItemHref}"`);
    if (!spineItemHref) {
      logger.warn(`[cfi] no manifest entry for spine id="${spineItemId}"`);
      return '';
    }

    const absoluteHref = opfDir ? `${opfDir}/${spineItemHref}` : spineItemHref;
    logger.info(`[cfi] absoluteHref="${absoluteHref}"`);
    const htmlEntry = zip.getEntry(absoluteHref) || zip.getEntry(spineItemHref);
    if (!htmlEntry) {
      logger.warn(`[cfi] zip entry not found: "${absoluteHref}" nor "${spineItemHref}"`);
      const entries = zip
        .getEntries()
        .map((e) => e.entryName)
        .filter((n) => n.endsWith('.html') || n.endsWith('.xhtml') || n.endsWith('.htm'));
      logger.warn(`[cfi] available html entries: ${entries.slice(0, 10).join(', ')}`);
      return '';
    }
    logger.info(`[cfi] found zip entry: "${htmlEntry.entryName}"`);

    const parser = new DOMParser({ onError: () => {} });

    const htmlContent = htmlEntry.getData().toString('utf8');
    const plainText = stripHtml(htmlContent);
    logger.info(
      `[cfi] htmlContent length=${htmlContent.length}, plainText length=${plainText.length}, first 80 chars: "${plainText.slice(0, 80)}"`,
    );
    const htmlDoc = parser.parseFromString(htmlContent, 'application/xhtml+xml');

    // Step 2: try to resolve exact position within the HTML doc
    const cfiObj = new CFI(cfi, { flattenRange: true });
    let resolved: { node: Node; offset?: number } | null = null;
    try {
      resolved = cfiObj.resolveLast(htmlDoc) as { node: Node; offset?: number };
      logger.info(
        `[cfi] resolveLast ok — nodeType=${(resolved?.node as { nodeType?: number })?.nodeType} offset=${resolved?.offset}`,
      );
    } catch (e) {
      logger.warn(`[cfi] resolveLast failed: ${(e as Error).message}`);
    }

    // Fallback: if resolveLast failed, return text from the first <p> in the spine item
    if (!resolved?.node) {
      const pMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const fallback = pMatch
        ? stripHtml(pMatch[1]).replace(/\s+/g, ' ').trim().slice(0, maxChars)
        : plainText.slice(0, maxChars).replace(/\s+/g, ' ').trim();
      logger.info(
        `[cfi] using fallback first-p (${fallback.length} chars): "${fallback.slice(0, 60)}..."`,
      );
      return fallback;
    }

    // Extract text: get parent element's full text, find position within it
    type DomNode = {
      nodeType: number;
      nodeValue?: string;
      parentNode?: DomNode;
      textContent?: string;
      nextSibling?: DomNode;
    };
    const node = resolved.node as DomNode;
    const offset = resolved.offset ?? 0;

    const isTextNode = node.nodeType === 3;
    const nodeText = isTextNode ? (node.nodeValue ?? '') : (node.textContent ?? '');
    logger.info(
      `[cfi] isTextNode=${isTextNode} offset=${offset} nodeText(60)="${nodeText.slice(0, 60)}"`,
    );

    // Walk up the DOM until we find an ancestor with substantial text
    let contextText = node.parentNode?.textContent ?? nodeText;
    let ancestor = node.parentNode;
    let depth = 0;
    while (contextText.trim().length < 80 && ancestor?.parentNode) {
      ancestor = ancestor.parentNode;
      const t = ancestor?.textContent ?? '';
      if (t.trim().length > contextText.trim().length) contextText = t;
      depth++;
    }
    logger.info(
      `[cfi] contextText length=${contextText.length} after walking up ${depth} levels, first 80: "${contextText.slice(0, 80)}"`,
    );

    let globalOffset = offset;
    if (isTextNode && contextText !== nodeText) {
      const nodeIdx = contextText.indexOf(nodeText.trim().slice(0, 30));
      if (nodeIdx >= 0) globalOffset = nodeIdx + offset;
    }

    const start = Math.max(0, globalOffset - 100);
    const end = Math.min(contextText.length, start + maxChars);
    const result = contextText.slice(start, end).replace(/\s+/g, ' ').trim();
    logger.info(`[cfi] result(60)="${result.slice(0, 60)}" (${result.length} chars)`);

    if (!result && node.parentNode) {
      let sibling = (node.parentNode as DomNode & { nextSibling?: DomNode }).nextSibling;
      const parts: string[] = [];
      while (sibling && parts.join(' ').length < maxChars) {
        const t = (sibling.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
        sibling = sibling.nextSibling;
      }
      const sibResult = parts.join(' ').slice(0, maxChars);
      logger.info(`[cfi] sibling fallback: "${sibResult.slice(0, 60)}"`);
      return sibResult;
    }

    return result;
  } catch (e) {
    logger.warn(`[epubText] getTextAtCfi error for cfi="${cfi}": ${(e as Error).message}`);
    return '';
  }
}

/**
 * Given a spine item index and matched text, compute a precise intra-document CFI.
 * Returns a full CFI like epubcfi(/6/46!/4/240/1:5) or null on failure.
 *
 * Algorithm:
 *  1. Parse the spine item HTML
 *  2. Walk body's children, accumulate plain text per element
 *  3. Find the element whose text contains the start of matchedText
 *  4. Within that element, find the exact text node and char offset
 *  5. Build the CFI path bottom-up
 */
export function generateCfiFromMatchedText(
  epubPath: string,
  spineIndex: number,
  matchedText: string,
): string | null {
  try {
    const zip = new AdmZip(epubPath);
    const { opfDir, manifest, spineIds } = parseOpf(zip);

    const spineItemId = spineIds[spineIndex];
    const spineItemHref = manifest[spineItemId];
    if (!spineItemHref) return null;

    const absoluteHref = opfDir ? `${opfDir}/${spineItemHref}` : spineItemHref;
    const entry = zip.getEntry(absoluteHref) || zip.getEntry(spineItemHref);
    if (!entry) return null;

    const html = entry.getData().toString('utf8');
    const parser = new DOMParser({ onError: () => {} });
    const doc = parser.parseFromString(html, 'application/xhtml+xml');

    const body = doc.getElementsByTagName('body')[0];
    if (!body) return null;

    // Use first 50 normalized chars of matchedText as search key
    const searchKey = matchedText.replace(/\s+/g, ' ').toLowerCase().trim().slice(0, 50);

    // ── Step 1: find element child of body containing the text ──────────────
    // Collect all element children of body (ignoring pure-whitespace text nodes)
    // CFI step = (1-based position among element children) × 2
    const ELEMENT = 1;
    const TEXT = 3;

    type Node = {
      nodeType: number;
      childNodes: { length: number; [i: number]: Node };
      textContent?: string;
      tagName?: string;
      nodeValue?: string;
    };

    function elemText(node: Node): string {
      if (node.nodeType === TEXT) return (node.nodeValue ?? '').replace(/\s+/g, ' ');
      if (node.nodeType === ELEMENT) {
        const tag = node.tagName?.toLowerCase() ?? '';
        if (tag === 'style' || tag === 'script') return '';
        let s = '';
        for (let i = 0; i < node.childNodes.length; i++) s += elemText(node.childNodes[i]);
        return s;
      }
      return '';
    }

    let foundElemStep = -1;
    let foundElem: Node | null = null;
    let elemPosition = 0; // 1-based count of element children of body

    for (let i = 0; i < body.childNodes.length; i++) {
      const child = body.childNodes[i] as unknown as Node;
      if (child.nodeType !== ELEMENT) continue;
      elemPosition++;

      const text = elemText(child).toLowerCase();
      if (text.includes(searchKey)) {
        foundElemStep = elemPosition * 2;
        foundElem = child;
        break;
      }
    }

    if (!foundElem || foundElemStep < 0) return null;

    // ── Step 2: find text node within the element ────────────────────────────
    // Walk all text nodes, accumulating text, find which one contains searchKey
    const textNodes: { node: Node; start: number }[] = [];
    let acc = '';

    function collectText(node: Node): void {
      if (node.nodeType === TEXT) {
        const t = (node.nodeValue ?? '').replace(/\s+/g, ' ');
        textNodes.push({ node, start: acc.length });
        acc += t;
      } else if (node.nodeType === ELEMENT) {
        const tag = node.tagName?.toLowerCase() ?? '';
        if (tag === 'style' || tag === 'script') return;
        for (let i = 0; i < node.childNodes.length; i++)
          collectText(node.childNodes[i] as unknown as Node);
      }
    }

    collectText(foundElem);

    const accLower = acc.toLowerCase();
    const matchIdx = accLower.indexOf(searchKey);
    if (matchIdx < 0) return null;

    // Find which text node contains matchIdx
    let foundTextNode: Node | null = null;
    let charOffsetInTextNode = 0;
    for (let i = 0; i < textNodes.length; i++) {
      const nodeStart = textNodes[i].start;
      const nodeEnd = i + 1 < textNodes.length ? textNodes[i + 1].start : acc.length;
      if (matchIdx >= nodeStart && matchIdx < nodeEnd) {
        foundTextNode = textNodes[i].node;
        charOffsetInTextNode = matchIdx - nodeStart;
        break;
      }
    }

    if (!foundTextNode) return null;

    // ── Step 3: compute text node step within its parent ────────────────────
    // In CFI: count all preceding siblings — each element contributes +2, each text +2
    // but for the text node itself it's at an odd position between elements.
    // Simplified: count position among ALL children (elem+text alike), odd/even by type.
    const textParent = foundElem; // the matched element IS the parent in simple cases
    // Walk up to find actual parent of the text node
    function findParentOf(node: Node, target: Node): Node | null {
      if (node.nodeType !== ELEMENT) return null;
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i] as unknown as Node;
        if (child === target) return node;
        const found = findParentOf(child, target);
        if (found) return found;
      }
      return null;
    }

    const actualParent = findParentOf(foundElem, foundTextNode) ?? textParent;

    // Count CFI step for the text node within actualParent
    // Elements get even steps, text nodes get steps based on position
    let textNodeStep = 1;
    for (let i = 0; i < actualParent.childNodes.length; i++) {
      const sib = actualParent.childNodes[i] as unknown as Node;
      if (sib === foundTextNode) break;
      textNodeStep += 2; // each preceding sibling (elem or text) adds 2
    }

    // ── Step 4: build path from actualParent up to foundElem ────────────────
    const innerSteps: string[] = [`/${textNodeStep}:${charOffsetInTextNode}`];

    let cur: Node = actualParent;
    while (cur !== foundElem) {
      const par = findParentOf(foundElem, cur) ?? foundElem;
      let step = 2;
      for (let i = 0; i < par.childNodes.length; i++) {
        const sib = par.childNodes[i] as unknown as Node;
        if (sib === cur) break;
        if (sib.nodeType === ELEMENT) step += 2;
      }
      innerSteps.unshift(`/${step}`);
      cur = par;
    }

    const spineStep = (spineIndex + 1) * 2;
    const cfi = `epubcfi(/6/${spineStep}!/4/${foundElemStep}${innerSteps.join('')})`;
    logger.info(
      `[cfi:gen] spineIdx=${spineIndex} elemStep=${foundElemStep} textNodeStep=${textNodeStep} offset=${charOffsetInTextNode} → ${cfi}`,
    );
    return cfi;
  } catch (e) {
    logger.warn(`[cfi:gen] failed: ${(e as Error).message}`);
    return null;
  }
}
