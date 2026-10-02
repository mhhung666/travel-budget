import coverage from './pdfFontCoverage.json';

/** Missing glyphs are preserved as explicit Unicode code points, never invisible boxes. */
export function pdfText(text: string): string {
  return Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0)!;
      if (character === '\n' || character === '\t') return character;
      let low = 0;
      let high = coverage.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        const [start, end] = coverage[mid];
        if (code < start) high = mid - 1;
        else if (code > end) low = mid + 1;
        else return character;
      }
      return `[U+${code.toString(16).toUpperCase()}]`;
    })
    .join('');
}

/** Empty syllables create zero-width break opportunities without inserted hyphens. */
export function pdfBreakWord(word: string): string[] {
  if (!/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u.test(word) && word.length <= 36) return [word];
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)
  ).flatMap(({ segment }) => [segment, '']);
}
