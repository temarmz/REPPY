import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [mode, directory = 'pages-dist', manifestPath = 'work/release-manifest.json'] = process.argv.slice(2);
if (!['create', 'verify'].includes(mode)) throw new Error('Use create|verify [directory] [manifest]');
const root = path.resolve(directory);
async function inventory(dir = root) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks forbidden in release');
    if (entry.isDirectory()) files.push(...await inventory(file));
    else if (entry.isFile()) files.push({ file: path.relative(root, file).split(path.sep).join('/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
const files = await inventory();
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
if (mode === 'create') {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({ version: 1, release, files }, null, 2) + '\n');
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || JSON.stringify(manifest.files) !== JSON.stringify(files) || JSON.stringify(manifest.release) !== JSON.stringify(release)) throw new Error('Release integrity check failed');
}
console.log(JSON.stringify({ mode, release: release.release, verifiedFiles: files.length }));
