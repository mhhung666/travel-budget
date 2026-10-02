const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expo,
  prettier,
  { ignores: ['dist/**', '.expo/**', 'coverage/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'mongoose',
                '@aws-sdk/*',
                '@travel-budget/web',
                '@travel-budget/web/**',
                '**/web',
                '**/web/**',
                '**/apps/web/**',
              ],
              message:
                'Mobile only consumes HTTP contracts; server and Web source imports are forbidden.',
            },
          ],
        },
      ],
    },
  },
]);
