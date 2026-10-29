import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedTelegramRedirect } from '../supabase/functions/telegram-auth/redirects.ts';

test('Telegram code exchange accepts the exact registered web and native callbacks', () => {
  assert.equal(isAllowedTelegramRedirect('https://temarmz.github.io/REPPY/'), true);
  assert.equal(isAllowedTelegramRedirect('reppy://auth/telegram'), true);
});

test('Telegram callbacks reject lookalikes, arbitrary schemes, query strings and fragments', () => {
  for (const uri of [
    '', 'https://evil.test', 'https://temarmz.github.io.evil.test/REPPY/',
    'https://temarmz.github.io@evil.test/REPPY/', 'https://temarmz.github.io/REPPY/?next=https://evil.test',
    'https://temarmz.github.io/REPPY/#evil', 'https://temarmz.github.io/REPPY/other',
    'reppy://evil/telegram', 'reppy://auth/telegram?next=evil', 'reppy://auth/telegram#evil',
    'other://auth/telegram', 'reppy://auth/telegram/', 'http://temarmz.github.io/REPPY/',
  ]) assert.equal(isAllowedTelegramRedirect(uri), false, uri);
});
