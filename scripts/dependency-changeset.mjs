import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const released = `v${manifest.version}`;

let before = {};
try {
  before = JSON.parse(execSync(`git show ${released}:package.json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).dependencies || {};
} catch {
  process.exit(0);
}

const now = manifest.dependencies || {};
const changed = Object.keys({ ...now, ...before }).filter((name) => now[name] !== before[name]);
if (!changed.length) process.exit(0);

const lines = changed.map((name) => `- ${name}: ${before[name] || 'added'} to ${now[name] || 'removed'}`).join('\n');
writeFileSync('.changeset/dependencies.md', `---\n"${manifest.name}": patch\n---\n\nUpdated dependencies\n\n${lines}\n`);
console.log(`Patch release for ${changed.join(', ')}`);
