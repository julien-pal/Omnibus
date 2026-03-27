/**
 * Returns true if two chapter titles likely refer to the same chapter.
 * Uses exact match, substring match, and chapter number match.
 */
export function chaptersMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\d]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Match by chapter number (e.g. "Chapter 3" ↔ "Chapter 03" ↔ "3. The Journey")
  const extractNum = (s: string) => {
    const m = s.match(/\b(\d+)\b/);
    return m ? parseInt(m[1], 10) : null;
  };
  const numA = extractNum(a);
  const numB = extractNum(b);
  if (numA !== null && numA === numB) return true;
  return false;
}
