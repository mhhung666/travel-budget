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
