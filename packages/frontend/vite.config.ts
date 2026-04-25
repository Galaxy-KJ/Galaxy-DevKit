import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, '..')],
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@galaxy-kj/core-wallet': resolve(__dirname, '../core/wallet/src/index.ts'),
      '@galaxy-kj/core-stellar-sdk': resolve(__dirname, '../core/stellar-sdk/src/browser.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@stellar/stellar-sdk', 'buffer'],
  },
});
