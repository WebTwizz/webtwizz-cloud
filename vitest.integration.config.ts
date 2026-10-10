import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) } },
  test: { server: { deps: { inline: ['@neondatabase/auth', /dist\/.*\.js$/] } }, include: ['test/integration/*.test.ts'], testTimeout: 120_000, hookTimeout: 300_000 },
});
