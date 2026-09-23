import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupRoot = path.resolve(projectRoot, process.env.REPPY_BACKUP_DIR?.trim() || '.backups');
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const partialDirectory = path.join(backupRoot, `.${timestamp}.partial`);
const backupDirectory = path.join(backupRoot, timestamp);
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Заполните SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.admin.local.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (!/^[a-z0-9-]+$/i.test(projectRef)) throw new Error('Некорректный SUPABASE_URL.');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} завершился с кодом ${code}.`)));
  });
}

function safeSegment(value, kind) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Небезопасное имя ${kind}: ${value}`);
  }
  return value;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function exportStorage(supabase) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Не удалось прочитать Storage buckets: ${error.message}`);

  const exported = [];
  for (const bucket of buckets ?? []) {
    const bucketId = safeSegment(bucket.id, 'bucket');
    const prefixes = [''];

    while (prefixes.length) {
      const prefix = prefixes.shift();
      let offset = 0;
      while (true) {
        const { data: objects, error: listError } = await supabase.storage.from(bucket.id).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (listError) throw new Error(`Не удалось прочитать ${bucket.id}/${prefix}: ${listError.message}`);
        if (!objects?.length) break;

        for (const object of objects) {
          const objectName = safeSegment(object.name, 'объекта Storage');
          const fullName = prefix ? `${prefix}/${objectName}` : objectName;
          if (!object.id) {
            prefixes.push(fullName);
            continue;
          }

          const { data, error: downloadError } = await supabase.storage.from(bucket.id).download(fullName);
          if (downloadError || !data) {
            throw new Error(`Не удалось скачать ${bucket.id}/${fullName}: ${downloadError?.message ?? 'пустой ответ'}`);
          }
          const outputPath = path.join(partialDirectory, 'storage', bucketId, ...fullName.split('/').map((part) => safeSegment(part, 'пути')));
          await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
          const buffer = Buffer.from(await data.arrayBuffer());
          await writeFile(outputPath, buffer, { mode: 0o600 });
          exported.push({
            bucket: bucket.id,
            name: fullName,
            path: path.relative(partialDirectory, outputPath),
            bytes: buffer.byteLength,
            sha256: createHash('sha256').update(buffer).digest('hex'),
          });
        }
        if (objects.length < 1000) break;
        offset += objects.length;
      }
    }
  }
  return { buckets: (buckets ?? []).map(({ id, name, public: isPublic }) => ({ id, name, public: isPublic })), objects: exported };
}

await mkdir(backupRoot, { recursive: true, mode: 0o700 });
await chmod(backupRoot, 0o700);
await rm(partialDirectory, { recursive: true, force: true });
await mkdir(partialDirectory, { recursive: true, mode: 0o700 });

try {
  const cli = path.join(projectRoot, 'node_modules', '.bin', 'supabase');
  const rolesPath = path.join(partialDirectory, 'roles.sql');
  const schemaPath = path.join(partialDirectory, 'schema.sql');
  const dataPath = path.join(partialDirectory, 'data.sql');
  const applicationDataPath = path.join(partialDirectory, 'application-data.sql');

  await run(cli, ['db', 'dump', '--linked', '--file', rolesPath, '--role-only']);
  await run(cli, ['db', 'dump', '--linked', '--file', schemaPath]);
  await run(cli, [
    'db', 'dump', '--linked', '--file', dataPath, '--data-only', '--use-copy',
    '--exclude', 'storage.buckets_vectors', '--exclude', 'storage.vector_indexes',
  ]);
  await run(cli, [
    'db', 'dump', '--linked', '--file', applicationDataPath, '--data-only', '--use-copy',
    '--schema', 'public,private',
  ]);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storage = await exportStorage(supabase);
  const databaseFiles = [];
  for (const file of ['roles.sql', 'schema.sql', 'data.sql', 'application-data.sql']) {
    const fileStat = await stat(path.join(partialDirectory, file));
    databaseFiles.push({ file, bytes: fileStat.size, sha256: await sha256(path.join(partialDirectory, file)) });
  }

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    projectRef,
    database: databaseFiles,
    storage,
    notes: [
      'Edge Function code and database migrations are versioned in Git and are not duplicated here.',
      'Edge Function secrets are not exported; keep their inventory in a separate password manager.',
      'data.sql is the full hosted-project data export; application-data.sql is limited to public/private for local restore drills.',
    ],
  };
  await writeFile(path.join(partialDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(partialDirectory, backupDirectory);
  console.log(JSON.stringify({
    backupDirectory,
    databaseBytes: databaseFiles.reduce((sum, file) => sum + file.bytes, 0),
    storageObjects: storage.objects.length,
    storageBytes: storage.objects.reduce((sum, object) => sum + object.bytes, 0),
  }, null, 2));
  console.log('Backup создан. Скопируйте каталог в зашифрованное хранилище вне этого компьютера.');
} catch (error) {
  await rm(partialDirectory, { recursive: true, force: true });
  throw error;
}
