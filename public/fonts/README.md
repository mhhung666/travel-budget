# PDF CJK font

`TravelCJK-Regular.ttf` is a static weight-400 instance of Noto Sans CJK TC,
renamed to TravelCJK-Regular. It retains the source Unicode coverage (including
Traditional/Simplified Chinese, Japanese kana/kanji and Latin). It uses Taiwanese
forms for shared Han characters. It is not a color emoji font. Missing glyphs are
printed as `[U+XXXX]` rather than silently omitted.

- Source: [Noto CJK](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c)
- File: `Sans/Variable/TTF/NotoSansCJKtc-VF.ttf`
- Copyright: © 2014–2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.
- License: SIL Open Font License, included as `OFL-NotoSansCJK.txt`.
- Original source is variable TrueType; the shipped TTF is **static**.
- The approximately 21 MiB font is loaded from this application only on PDF
  generation, excluded from service-worker precaching. No font/CDN request goes
  to a third party. HTTP/runtime caching may reuse it on later exports.
- Bold/italic Markdown uses underline emphasis with this single static face.

To regenerate from the repository root (Python with `fonttools==4.60.2`):

```sh
curl -fL https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/Variable/TTF/NotoSansCJKtc-VF.ttf -o /tmp/NotoSansCJKtc-VF.ttf
python3 scripts/build-itinerary-pdf-font.py /tmp/NotoSansCJKtc-VF.ttf
pnpm exec prettier --write src/lib/exporters/pdfFontCoverage.json
```

The script also regenerates the sorted coverage ranges used by `pdfText.ts`.
Keep font and coverage changes together; rerun actual PDF rendering/selection
checks when changing either.

Static TTF is intentional: profiling found repeated WOFF glyph-table decompression
in the renderer, taking about a minute even for a small document. TTF avoids that
work. Keep the original layout tables; transport compression can reduce transfer
size without repeated font-level decompression.
