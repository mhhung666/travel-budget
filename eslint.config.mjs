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

      // React Hooks — new opinionated rules in eslint-plugin-react-hooks@7
      // (bundled with eslint-config-next 16). Kept as warnings to match the
      // pre-migration enforcement level; can be promoted to errors later.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['out/', 'dist/', 'build/', 'docs/archive/', 'scripts/'],
  },
];

export default eslintConfig;
