'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import Link from 'next/link';

interface MarkdownRendererProps {
  content: string;
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

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
