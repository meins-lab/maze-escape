import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const root = import.meta.dirname;
const NOT_PAGES = new Set(['dist', 'node_modules', 'public']);

// 루트의 <게임>/index.html을 모두 입력으로 잡는다. 게임을 추가할 때 이 파일은 고치지 않는다
const games = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !NOT_PAGES.has(d.name))
  .filter((d) => existsSync(resolve(root, d.name, 'index.html')))
  .map((d) => [d.name, resolve(root, d.name, 'index.html')]);

export default defineConfig({
  build: {
    rollupOptions: {
      input: { home: resolve(root, 'index.html'), ...Object.fromEntries(games) },
    },
  },
});
