'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Components } from 'react-markdown';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  /**
   * `page`（預設）＝整頁文件字級（行程日 Markdown）。
   * `compact`＝卡片內嵌字級（隨手記），並啟用 remark-breaks——速記的單一換行
   * 就是換行（與純文字時代的 whitespace-pre-wrap 行為相容，舊筆記顯示不變樣）。
   */
  variant?: 'page' | 'compact';
  /**
   * compact 專用：GFM task checkbox 是否呈現為可點擊（實際點擊由外層以事件
   * 委派處理——見 NoteCard；此處只控制 disabled 樣式）。
   */
  interactiveTasks?: boolean;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mt-6 mb-4">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 mt-6 mb-4">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }) => <p className="leading-7 [&:not(:first-child)]:mt-4">{children}</p>,
  a: ({ href, children }) => (
    <Link
      href={href || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-4"
    >
      {children}
    </Link>
  ),
  ul: ({ children }) => <ul className="my-4 ml-6 list-disc [&>li]:mt-2">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 ml-6 list-decimal [&>li]:mt-2">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-primary pl-6 italic bg-muted/50 py-1 rounded-r-sm">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
          {children}
        </code>
      );
    }
    return (
      <pre className="mb-4 mt-6 overflow-x-auto rounded-lg border bg-black py-4 px-4 text-white">
        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
          {children}
        </code>
      </pre>
    );
  },
  hr: () => <hr className="my-4 border-muted" />,
  table: ({ children }) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className="w-full border-collapse border border-border text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted text-muted-foreground">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">{children}</td>
  ),
};

/** 卡片內嵌用的緊湊樣式（隨手記）：字級縮到 sm/xs、間距減半、code 區塊走主題色。 */
function buildCompactComponents(interactiveTasks: boolean): Components {
  return {
    h1: ({ children }) => <p className="mt-3 mb-1 text-base font-bold first:mt-0">{children}</p>,
    h2: ({ children }) => <p className="mt-3 mb-1 text-sm font-bold first:mt-0">{children}</p>,
    h3: ({ children }) => <p className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</p>,
    h4: ({ children }) => <p className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</p>,
    h5: ({ children }) => <p className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</p>,
    h6: ({ children }) => <p className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</p>,
    p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary underline underline-offset-2 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="my-1 ml-5 list-disc [&>li]:mt-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 ml-5 list-decimal [&>li]:mt-0.5">{children}</ol>,
    // GFM task item 拿掉圓點（checkbox 就是視覺記號），一般項目照舊
    li: ({ children, className }) => (
      <li className={cn(className, className?.includes('task-list-item') && 'list-none')}>
        {children}
      </li>
    ),
    // GFM task checkbox：受控於原文（checked 來自 markdown），點擊由外層委派處理，
    // readOnly + preventDefault 避免原生勾選與 React 狀態打架
    input: ({ checked, type }) =>
      type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={!!checked}
          readOnly
          disabled={!interactiveTasks}
          className={cn(
            'mr-1.5 h-3.5 w-3.5 translate-y-[2px] accent-primary',
            interactiveTasks && 'cursor-pointer'
          )}
        />
      ) : null,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-primary pl-3 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="rounded bg-muted px-[0.3rem] py-[0.1rem] font-mono text-xs">
            {children}
          </code>
        );
      }
      return (
        <pre className="my-2 overflow-x-auto rounded-md bg-muted p-2">
          <code className="font-mono text-xs">{children}</code>
        </pre>
      );
    },
    hr: () => <hr className="my-2 border-muted" />,
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        className="my-2 max-h-64 max-w-full rounded-md"
      />
    ),
    table: ({ children }) => (
      <div className="my-2 w-full overflow-x-auto">
        <table className="w-full border-collapse border border-border text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted text-muted-foreground">{children}</thead>,
    tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
    th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
  };
}

const compactComponents = buildCompactComponents(true);
const compactComponentsReadonly = buildCompactComponents(false);

export default function MarkdownRenderer({
  content,
  variant = 'page',
  interactiveTasks = false,
}: MarkdownRendererProps) {
  if (!content) return null;

  if (variant === 'compact') {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={interactiveTasks ? compactComponents : compactComponentsReadonly}
      >
        {content}
      </ReactMarkdown>
    );
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
