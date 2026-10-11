import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Puts this build into the local WebTwizz preview site and restarts its dev server (about 10s).
const container = process.env.PREVIEW_CONTAINER || 'webtwizz-nextjs-docker-app-1';
const target = '/app/nextjs/node_modules/@webtwizz/cloud';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
manifest.version = `${manifest.version.split('-')[0]}-dev.${Date.now()}`;

const staging = mkdtempSync(path.join(tmpdir(), 'webtwizz-cloud-'));
try {
  cpSync('dist', path.join(staging, 'dist'), { recursive: true });
  cpSync('AI_GUIDE.md', path.join(staging, 'AI_GUIDE.md'));
  writeFileSync(path.join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('docker', ['exec', '-u', 'root', container, 'sh', '-c', `mkdir -p ${target} && rm -rf ${target}/dist`]);
  execFileSync('docker', ['cp', `${staging}/.`, `${container}:${target}/`]);
  execFileSync('docker', ['exec', '-u', 'root', container, 'sh', '-c', 'rm -rf /app/nextjs/.next/cache/webpack; pkill -f "[n]ext dev" || true']);
  console.log(`@webtwizz/cloud ${manifest.version} is in the preview; its dev server is restarting`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
