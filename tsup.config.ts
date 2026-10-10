import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

// Bundles the sign-in library under WebTwizz names, reading next/headers through src/next-headers.ts.
const renames: [string, string][] = [
  ['[neon-auth]', '[webtwizz-auth]'],
  ['"X-Neon-Client-Info"', '"X-WebTwizz-Client-Info"'],
  ['name = "@neondatabase/auth"', 'name = "@webtwizz/cloud"'],
];

const SHIM = fileURLToPath(new URL('./src/next-headers.ts', import.meta.url));

const library = {
  name: 'webtwizz-sign-ins',
  setup(build: {
    onLoad: (options: { filter: RegExp }, callback: (args: { path: string }) => { contents: string; loader: 'js' }) => void;
  }) {
    build.onLoad({ filter: /@neondatabase[\\/]auth[\\/]dist[\\/].*\.mjs$/ }, ({ path }) => ({
      contents: renames.reduce((code, [from, to]) => code.replaceAll(from, to), readFileSync(path, 'utf8')).replaceAll('from "next/headers"', `from ${JSON.stringify(SHIM)}`),
      loader: 'js',
    }));
  },
};

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts', 'src/client.ts', 'src/db.ts', 'src/files.ts'],
  format: ['esm'],
  dts: { resolve: [/^@neondatabase\/auth/] },
  clean: true,
  target: 'es2022',
  splitting: true,
  noExternal: [/^@neondatabase\/auth/],
  esbuildPlugins: [library],
});
