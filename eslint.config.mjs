import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['build/', 'node_modules/', 'playwright-report/', 'test-results/', 'public/', 'web-explorer.html', 'ethics-explorer.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,mjs}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node }
  }
);
