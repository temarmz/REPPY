import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
const [mode, input, output] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(mode) || !input || !output) throw new Error('Use encrypt|decrypt input output');
const key = Buffer.from(process.env.REPPY_BACKUP_ENCRYPTION_KEY ?? '', 'base64');
if (key.length !== 32) throw new Error('REPPY_BACKUP_ENCRYPTION_KEY must encode 32 random bytes');
const magic = Buffer.from('REPPY-BACKUP-GCM-1\n');
const temporary = `${output}.${randomBytes(8).toString('hex')}.partial`;
try {
  try { await stat(output); throw new Error('Output already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (mode === 'encrypt') {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    const stream = createWriteStream(temporary, { flags: 'wx', mode: 0o600 }); stream.write(Buffer.concat([magic, iv]));
    await pipeline(createReadStream(input), cipher, stream);
    await appendFile(temporary, cipher.getAuthTag());
  } else {
    const file = await open(input, 'r'); let header, tag, size;
    try {
      size = (await file.stat()).size;
      if (size < magic.length + 28) throw new Error('Invalid encrypted backup');
      header = Buffer.alloc(magic.length + 12); tag = Buffer.alloc(16);
      await file.read(header, 0, header.length, 0); await file.read(tag, 0, 16, size - 16);
    } finally { await file.close(); }
    if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported encrypted backup');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length)); decipher.setAuthTag(tag);
    await pipeline(createReadStream(input, { start: header.length, end: size - 17 }), decipher,
      createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
  }
  await rename(temporary, output);
  console.log(JSON.stringify({ mode, authenticatedEncryption: 'AES-256-GCM', bytes: (await stat(output)).size }));
} catch { await rm(temporary, { force: true }); throw new Error('Backup encryption/decryption failed; output was not published'); }
