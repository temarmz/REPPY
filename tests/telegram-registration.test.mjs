import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { SignJWT } from 'jose';

// Deno's pinned npm specifier points to the same library in the Node test runtime.
const source = (await readFile(new URL('../supabase/functions/telegram-auth/registration.ts', import.meta.url), 'utf8'))
  .replace('npm:jose@6.1.0', import.meta.resolve('jose'));
const { issueRegistrationToken, verifyRegistrationToken } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const identity = { id: 123, firstName: 'Richard', displayName: 'Richard C.', username: null };
const secret = 'test-registration-secret-at-least-32-bytes';

test('registration proof preserves verified identity independently of Telegram token expiration', async () => {
  const token = await issueRegistrationToken(identity, secret, 'client');
  assert.deepEqual(await verifyRegistrationToken(token, secret, 'client'), identity);
  await assert.rejects(verifyRegistrationToken(token, 'different-secret', 'client'));
  await assert.rejects(verifyRegistrationToken(token, secret, 'different-client'));
  const [header, payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), telegram: { ...identity, id: 456 } })).toString('base64url');
  await assert.rejects(verifyRegistrationToken(`${header}.${forged}.${signature}`, secret, 'client'));
});

test('expired registration proof cannot create a trainer', async () => {
  const token = await new SignJWT({ telegram: identity }).setProtectedHeader({ alg: 'HS256' })
    .setIssuer('reppy:telegram-registration').setAudience('client').setSubject('123')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 1000).setExpirationTime(Math.floor(Date.now() / 1000) - 100)
    .sign(new TextEncoder().encode(secret));
  await assert.rejects(verifyRegistrationToken(token, secret, 'client'));
});
