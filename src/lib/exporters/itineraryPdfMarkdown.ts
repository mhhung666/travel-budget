import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

interface Node {
  type: string;
  value?: string;
  alt?: string;
  url?: string;
  identifier?: string;
  depth?: number;
  checked?: boolean | null;
  ordered?: boolean;
  start?: number | null;
  children?: Node[];
}
export interface PdfInline {
  text: string;
  bold?: boolean;
  emphasis?: boolean;
  strike?: boolean;
  code?: boolean;
  url?: string;
}
export interface PdfBlock {
  kind: 'paragraph' | 'heading' | 'quote' | 'code' | 'rule';
  depth?: number;
  content: PdfInline[];
}

export function safePdfLink(url: string | undefined): string | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** GFM to a deliberately small, printable model; never fetch images or execute HTML. */
export function itineraryPdfMarkdown(markdown: string, imageOmitted: string): PdfBlock[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Node;
  const definitions = new Map<string, string>();
  const collect = (node: Node) => {
    if (node.type === 'definition' && node.identifier && node.url)
      definitions.set(node.identifier, node.url);
    node.children?.forEach(collect);
  };
  collect(root);
  const inline = (node: Node, style: Omit<PdfInline, 'text'> = {}): PdfInline[] => {
    if (node.type === 'image' || node.type === 'imageReference')
      return [{ ...style, text: `[${imageOmitted}${node.alt ? `: ${node.alt}` : ''}]` }];
    if (node.type === 'break') return [{ ...style, text: '\n' }];
    if (node.type === 'strong') style = { ...style, bold: true };
    if (node.type === 'emphasis') style = { ...style, emphasis: true };
    if (node.type === 'delete') style = { ...style, strike: true };
    if (node.type === 'inlineCode') style = { ...style, code: true };
    if (node.type === 'link' || node.type === 'linkReference')
      style = { ...style, url: safePdfLink(node.url ?? definitions.get(node.identifier ?? '')) };
    if (node.value !== undefined) return [{ ...style, text: node.value }];
    return (node.children ?? []).flatMap((child) => inline(child, style));
  };
  const blocks = (node: Node): PdfBlock[] => {
    const children = node.children ?? [];
    if (node.type === 'definition') return [];
    if (node.type === 'thematicBreak') return [{ kind: 'rule', content: [] }];
    if (node.type === 'heading')
      return [{ kind: 'heading', depth: node.depth, content: inline(node) }];
    if (node.type === 'code') return [{ kind: 'code', content: inline(node) }];
    if (node.type === 'blockquote')
      return children.flatMap(blocks).map((block) => ({ ...block, kind: 'quote' as const }));
    if (node.type === 'table') {
      const headers = (children[0]?.children ?? []).map((cell) =>
        inline(cell)
          .map((part) => part.text)
          .join('')
      );
      // Preserve even a header-only table and every cell in uneven rows.
      const rows = children.length > 1 ? children.slice(1) : children;
      return rows.flatMap((row) => [
        {
          kind: 'paragraph' as const,
          content: (row.children ?? []).flatMap((cell, index) => [
            { text: `${index ? '\n' : ''}${headers[index] ?? String(index + 1)}: `, bold: true },
            ...inline(cell),
          ]),
        },
      ]);
    }
    if (node.type === 'list')
      return children.flatMap((item, index) => {
        const result = (item.children ?? []).flatMap(blocks);
        const prefix =
          typeof item.checked === 'boolean'
            ? item.checked
              ? '[x] '
              : '[ ] '
            : node.ordered
              ? `${(node.start ?? 1) + index}. `
              : '• ';
        if (result[0]) result[0].content.unshift({ text: prefix });
        return result;
      });
    if (node.type === 'root' || node.type === 'listItem') return children.flatMap(blocks);
    return [{ kind: 'paragraph', content: inline(node) }];
  };
  return blocks(root);
}
