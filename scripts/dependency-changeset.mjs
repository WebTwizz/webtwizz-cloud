import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
let published = {};
try {
  published = JSON.parse(execSync(`npm view ${manifest.name}@latest dependencies --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || '{}');
} catch {
  process.exit(0);
}

const now = manifest.dependencies || {};
const changed = Object.keys({ ...now, ...published }).filter((name) => now[name] !== published[name]);
if (!changed.length) process.exit(0);

const lines = changed.map((name) => `- ${name}: ${published[name] || 'added'} to ${now[name] || 'removed'}`).join('\n');
writeFileSync('.changeset/dependencies.md', `---\n"${manifest.name}": patch\n---\n\nUpdated dependencies\n\n${lines}\n`);
console.log(`Patch release for ${changed.join(', ')}`);
