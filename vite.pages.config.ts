import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const release = `${revision.slice(0, 40)}-${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || Date.now()}`;

export default defineConfig({
  define: { __REPPY_RELEASE__: JSON.stringify(release) },
  root: 'pages-app',
  publicDir: '../public',
  base: './',
  plugins: [react(), { name: 'release-manifest', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ release, revision, builtAt: new Date().toISOString() }) });
  } }],
  build: {
    outDir: '../pages-dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
            },
          ],
        },
      },
    },
  },
});
