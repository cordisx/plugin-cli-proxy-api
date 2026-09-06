import sourcePolicy from '@cordisx/eslint-config'
import tsParser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**']),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [sourcePolicy],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [sourcePolicy],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
])
