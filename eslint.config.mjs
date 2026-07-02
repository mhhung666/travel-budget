import next from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';

const eslintConfig = [
  ...next,
  prettier,
  {
    // TypeScript-specific rules (the @typescript-eslint plugin is only
    // registered for these files by eslint-config-next).
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    rules: {
      // React
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },
  {
    // 設計 token 化（UI_UX_REDESIGN.md Phase 3）：UI 層禁止 Tailwind 調色盤色
    // （text-rose-600、bg-amber-500…），一律使用語意 token
    // （primary / success / warning / info / destructive / muted，圖表用 --chart-*）。
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/(^|[^a-zA-Z-])(text|bg|border|ring|stroke|fill|from|via|to|divide|outline|decoration|caret|accent|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]/]',
          message:
            'Tailwind 調色盤色只能出現在 design token（globals.css）；元件請改用語意 token class（如 text-success、bg-warning/10）。',
        },
        {
          selector:
            'TemplateElement[value.raw=/(^|[^a-zA-Z-])(text|bg|border|ring|stroke|fill|from|via|to|divide|outline|decoration|caret|accent|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]/]',
          message:
            'Tailwind 調色盤色只能出現在 design token（globals.css）；元件請改用語意 token class（如 text-success、bg-warning/10）。',
        },
      ],
    },
  },
  {
    // `public/sw*.js` are Serwist build artifacts (generated, minified) — never lint them.
    ignores: [
      'out/',
      'dist/',
      'build/',
      'docs/archive/',
      'scripts/',
      'public/sw.js',
      'public/sw.js.map',
      'public/swe-worker-*.js',
    ],
  },
];

export default eslintConfig;
