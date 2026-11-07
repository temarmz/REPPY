import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
test('encrypted backup rejects wrong key and tampering without publishing plaintext', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reppy-encryption-'));
  const key = randomBytes(32).toString('base64');
  const run = (mode, input, output, secret = key) => execFileSync(process.execPath, ['scripts/encrypt-backup.mjs', mode, join(dir,input), join(dir,output)], { env: { ...process.env, REPPY_BACKUP_ENCRYPTION_KEY: secret }, stdio: 'pipe' });
  try {
    await writeFile(join(dir,'source'), 'synthetic-private-content');
    run('encrypt','source','backup.enc');
    assert.ok(!(await readFile(join(dir,'backup.enc'))).includes(Buffer.from('synthetic-private-content')));
    run('decrypt','backup.enc','restored');
    assert.equal(await readFile(join(dir,'restored'),'utf8'), 'synthetic-private-content');
    assert.throws(() => run('decrypt','backup.enc','wrong',randomBytes(32).toString('base64')));
    await assert.rejects(access(join(dir,'wrong')));
    const bytes = await readFile(join(dir,'backup.enc')); bytes[bytes.length - 5] ^= 1;
    await writeFile(join(dir,'corrupt.enc'), bytes);
    assert.throws(() => run('decrypt','corrupt.enc','corrupt-output'));
    await assert.rejects(access(join(dir,'corrupt-output')));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
