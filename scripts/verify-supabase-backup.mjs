import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupRoot = path.resolve(projectRoot, process.env.REPPY_BACKUP_DIR?.trim() || '.backups');

async function latestBackup() {
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  if (!names.length) throw new Error(`В ${backupRoot} нет backup.`);
  return path.join(backupRoot, names.at(-1));
}

async function digest(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

const backupDirectory = process.argv[2] ? path.resolve(process.argv[2]) : await latestBackup();
const manifest = JSON.parse(await readFile(path.join(backupDirectory, 'manifest.json'), 'utf8'));
if (manifest.formatVersion !== 1) throw new Error('Неподдерживаемая версия backup.');

const files = [
  ...manifest.database.map((entry) => ({ path: entry.file, bytes: entry.bytes, sha256: entry.sha256 })),
  ...manifest.storage.objects.map((entry) => ({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 })),
];
for (const expected of files) {
  const filePath = path.resolve(backupDirectory, expected.path);
  if (!filePath.startsWith(`${backupDirectory}${path.sep}`)) throw new Error(`Небезопасный путь в manifest: ${expected.path}`);
  const fileStat = await stat(filePath);
  if (fileStat.size !== expected.bytes) throw new Error(`Размер ${expected.path} не совпадает с manifest.`);
  if (await digest(filePath) !== expected.sha256) throw new Error(`SHA-256 ${expected.path} не совпадает с manifest.`);
}

for (const file of ['roles.sql', 'schema.sql', 'data.sql', 'application-data.sql']) {
  const sql = await readFile(path.join(backupDirectory, file), 'utf8');
  if (!sql.trim()) throw new Error(`${file} пуст.`);
}

console.log(JSON.stringify({
  backupDirectory,
  createdAt: manifest.createdAt,
  projectRef: manifest.projectRef,
  verifiedFiles: files.length,
  storageObjects: manifest.storage.objects.length,
}, null, 2));
console.log('Контрольные суммы backup совпадают.');
