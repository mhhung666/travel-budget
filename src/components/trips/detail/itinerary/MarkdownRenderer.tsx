'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography, Link, Box } from '@mui/material';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  h1: ({ children }) => (
    <Typography variant="h5" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 1.5 }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 1 }}>
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.8 }}>
      {children}
    </Typography>
  ),
  a: ({ href, children }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2, mb: 1, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2, mb: 1, '& li': { mb: 0.5 } }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body2" sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  ),
  blockquote: ({ children }) => (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: 'primary.main',
        pl: 2,
        py: 0.5,
        my: 1,
        bgcolor: 'action.hover',
        borderRadius: '0 4px 4px 0',
      }}
    >
      {children}
    </Box>
  ),
  code: ({ children, className }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <Box
          component="code"
          sx={{
            bgcolor: 'action.hover',
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontSize: '0.85em',
            fontFamily: 'monospace',
          }}
        >
          {children}
        </Box>
      );
    }
    return (
      <Box
        component="pre"
        sx={{
          bgcolor: 'grey.900',
          color: 'grey.100',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          my: 1,
          fontSize: '0.85em',
          fontFamily: 'monospace',
        }}
      >
        <code>{children}</code>
      </Box>
    );
  },
  hr: () => <Box component="hr" sx={{ my: 2, border: 'none', borderTop: 1, borderColor: 'divider' }} />,
  table: ({ children }) => (
    <Box sx={{ overflowX: 'auto', my: 1 }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          '& th, & td': {
            border: 1,
            borderColor: 'divider',
            px: 1.5,
            py: 0.75,
            fontSize: '0.875rem',
          },
          '& th': {
            bgcolor: 'action.hover',
            fontWeight: 600,
          },
        }}
      >
        {children}
      </Box>
    </Box>
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
