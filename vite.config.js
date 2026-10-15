import { resolve } from 'node:path';

import { defineConfig } from 'vite';

// 게임을 추가하면 폴더/index.html을 만들고 여기에 등록한다
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        mazeEscape: resolve(import.meta.dirname, 'maze-escape/index.html'),
      },
    },
  },
});
