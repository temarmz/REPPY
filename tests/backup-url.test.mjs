import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDatabaseUrl } from '../scripts/normalize-database-url.mjs';

test('database URL accepts a normal Supabase pooler URI', () => {
  const parsed = normalizeDatabaseUrl('postgresql://postgres.project-ref:encoded%23password@pooler.example.com:5432/postgres');
  assert.equal(parsed.username, 'postgres.project-ref');
  assert.equal(decodeURIComponent(parsed.password), 'encoded#password');
  assert.equal(parsed.hostname, 'pooler.example.com');
  assert.equal(parsed.port, '5432');
});

test('database URL removes copy-pasted quotes', () => {
  const parsed = normalizeDatabaseUrl('"postgresql://postgres.project-ref:password@pooler.example.com:5432/postgres"');
  assert.equal(parsed.hostname, 'pooler.example.com');
  assert.equal(decodeURIComponent(parsed.password), 'password');
});

test('database URL percent-encodes raw special characters in a password', () => {
  const parsed = normalizeDatabaseUrl('postgresql://postgres.project-ref:p@ss[% word@pooler.example.com:5432/postgres');
  assert.equal(parsed.username, 'postgres.project-ref');
  assert.equal(decodeURIComponent(parsed.password), 'p@ss[% word');
  assert.equal(parsed.hostname, 'pooler.example.com');
});
