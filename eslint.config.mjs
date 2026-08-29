import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  globalIgnores(['node_modules/**', 'pages-dist/**', 'dist/**', '.next/**', '.vinext/**', '.wrangler/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
  },
]);

export default eslintConfig;
