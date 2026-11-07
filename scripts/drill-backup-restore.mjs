// LOCAL ONLY. Creates a disposable target with no network and never accepts a remote DB URL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const docker = process.env.REPPY_DOCKER || 'docker';
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, ...options });
const env = { ...process.env };
for (const line of run('npx', ['supabase', 'status', '-o', 'env']).split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)="(.*)"$/); if (match) env[match[1]] = match[2];
}
assert.equal(env.API_URL, 'http://127.0.0.1:54321');
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = result => { assert.ifError(result.error); return result.data; };
const started = Date.now(), suffix = Date.now().toString(), target = `reppy-restore-${suffix}`;
const directory = `work/ops-restore-${suffix}`; await mkdir(directory, { recursive: true, mode: 0o700 });
const source = 'supabase_db_reppy';
const sql = (container, query, user = 'supabase_admin') => run(docker, ['exec', '-i', container, 'psql', '-X', '-U', user, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: query });
const users = []; let object; let studentId; let targetStarted = false;
try {
  for (const role of ['trainer', 'student']) {
    const user = ok(await admin.auth.admin.createUser({ email: `ops-${role}-${suffix}@example.com`, password: crypto.randomUUID(), email_confirm: true, app_metadata: role === 'trainer' ? { reppy_role: role } : {}, user_metadata: { display_name: 'Restore drill' } })).user;
    users.push(user.id);
  }
  // Synthetic linked records exercise foreign keys and balance after restore.
  const student = { id: crypto.randomUUID() }, relation = { id: crypto.randomUUID() };
  studentId = student.id;
  sql(source, `insert into public.profiles(id,role,display_name) values ('${users[1]}','student','Restore drill') on conflict (id) do nothing;
    insert into public.students(id,name,created_by,account_id) values ('${student.id}','Restore drill','${users[0]}','${users[1]}');
    insert into public.trainer_student_relationships(id,trainer_id,student_id,status,timezone) values ('${relation.id}','${users[0]}','${student.id}','active','Europe/Moscow');
    insert into public.subscription_entries(id,relationship_id,kind,lesson_delta,amount_rub,payment_method,occurred_at) values ('${crypto.randomUUID()}','${relation.id}','payment',7,700,'cash',now());`);
  object = `${relation.id}/ops-restore-${suffix}.mp4`;
  ok(await admin.storage.from('instruction-videos').upload(object, new Blob(['synthetic restore media'], { type: 'video/mp4' }), { contentType: 'video/mp4' }));
  const backupRoot = `${directory}/backup`;
  run('node', ['scripts/create-supabase-backup.mjs', '--local'], { env: { ...env, SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, REPPY_BACKUP_DIR: backupRoot } });
  const { readdir } = await import('node:fs/promises'); const backup = `${backupRoot}/${(await readdir(backupRoot)).find(n => !n.startsWith('.'))}`;
  run('node', ['scripts/verify-supabase-backup.mjs', backup]);
  const image = run(docker, ['inspect', source, '--format', '{{.Config.Image}}']).trim();
  run(docker, ['run', '--detach', '--name', target, '--network', 'none', '-e', 'POSTGRES_PASSWORD=local-drill-only', image, 'postgres', '-c', 'shared_preload_libraries=pg_cron,pg_net,pg_stat_statements']);
  targetStarted = true;
  for (let i = 0; i < 100; i++) {
    try {
      const logs = run(docker, ['logs', target], { stdio: ['pipe', 'pipe', 'pipe'] });
      if (!logs.includes('PostgreSQL init process complete')) throw new Error('initializing');
      sql(target, 'select 1;'); break;
    } catch { if (i === 99) throw new Error('Restore target did not start'); await new Promise(r => setTimeout(r, 200)); }
  }
  // Bootstrap ONLY the matching local platform schema. This is not a hosted Auth migration test.
  const platform = run(docker, ['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--quote-all-identifiers', '--schema-only', '--section=pre-data', '--schema=auth', '--schema=storage', '--schema=supabase_functions']);
  sql(target, `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_functions_admin') THEN CREATE ROLE supabase_functions_admin NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_realtime_admin') THEN CREATE ROLE supabase_realtime_admin NOLOGIN; END IF; END $$;
    DROP SCHEMA auth CASCADE; DROP SCHEMA storage CASCADE; DROP SCHEMA IF EXISTS supabase_functions CASCADE;`);
  sql(target, await readFile(`${backup}/roles.sql`, 'utf8'));
  sql(target, platform);
  // Platform keys precede app foreign keys; app-owned hooks follow app functions.
  const post = run(docker, ['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--quote-all-identifiers', '--schema-only', '--section=post-data', '--schema=auth', '--schema=storage', '--schema=supabase_functions']);
  const { extractPlatformHooks } = await import('./backup-platform-hooks.mjs');
  extractPlatformHooks(post); // Fail closed if the expected app-owned hooks changed.
  let platformPost = post;
  platformPost = platformPost.replace(/CREATE (?:OR REPLACE )?TRIGGER "on_auth_user_created"[^;]+;/g, '');
  platformPost = platformPost.replace(/CREATE POLICY "instruction_videos_storage_(?:read|create|update|delete)"[^;]+;/g, '');
  sql(target, platformPost);
  sql(target, await readFile(`${backup}/schema.sql`, 'utf8'));
  sql(target, await readFile(`${backup}/platform-hooks.sql`, 'utf8'));
  sql(target, 'BEGIN; SET session_replication_role = replica;\n' + await readFile(`${backup}/data.sql`, 'utf8') + '\nCOMMIT;');
  const dataDump = await readFile(`${backup}/data.sql`, 'utf8');
  // Supabase intentionally omits managed migration bookkeeping and vector tables.
  const tables = [...dataDump.matchAll(/^COPY "(public|private|auth|storage)"\."([a-z_]+)"/gm)].map(match => `${match[1]}.${match[2]}`);
  const counts = [];
  for (const table of tables) {
    assert.match(table, /^[a-z_]+\.[a-z_]+$/);
    const query = `select count(*) from ${table};`;
    const expected = Number(sql(source, query)), actual = Number(sql(target, query)); assert.equal(actual, expected, table); counts.push({ table, rows: actual });
  }
  assert.equal(Number(sql(target, `select sum(lesson_delta) from public.subscription_entries where relationship_id='${relation.id}';`)), 7);
  // Onboarding must work after restore, not merely row counts.
  const fresh = crypto.randomUUID();
  sql(target, `insert into auth.users(id, raw_app_meta_data, raw_user_meta_data) values ('${fresh}', '{"reppy_role":"trainer"}', '{"display_name":"Restore new user"}');`);
  assert.equal(Number(sql(target, `select count(*) from public.profiles where id='${fresh}' and role='trainer';`)), 1);
  const visibleStudents = id => Number(sql(target, `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',true); SELECT count(*) FROM public.students WHERE id='${student.id}'; ROLLBACK;`).trim().split('\n').find(line => /^\d+$/.test(line)));
  assert.equal(visibleStudents(users[0]), 1); assert.equal(visibleStudents(fresh), 0);
  assert.equal(Number(sql(target, "select count(*) from pg_policies where schemaname='storage' and policyname like 'instruction_videos_storage_%';")), 4);
  const manifest = JSON.parse(await readFile(`${backup}/manifest.json`, 'utf8'));
  const media = manifest.storage.objects.find(e => e.name === object); assert.ok(media);
  const restored = `${directory}/restored-storage/${media.path}`; await mkdir(restored.slice(0, restored.lastIndexOf('/')), { recursive: true }); await cp(`${backup}/${media.path}`, restored);
  assert.equal(createHash('sha256').update(await readFile(restored)).digest('hex'), media.sha256);
  // Fail closed on corruption.
  await writeFile(`${backup}/platform-hooks.sql`, 'corrupt');
  assert.throws(() => run('node', ['scripts/verify-supabase-backup.mjs', backup]));
  const report = { at: new Date().toISOString(), durationMs: Date.now() - started, scope: 'isolated-local-matching-platform', tables: counts, onboarding: true, rls: true, storagePolicies: 4, mediaRestored: true, corruptionRejected: true, hostedAuthRestore: 'not-tested', cleanup: false };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ directory, durationMs: report.durationMs, tables: counts.length, onboarding: true, mediaRestored: true }));
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  throw error;
} finally {
  if (targetStarted) run(docker, ['rm', '-f', '-v', target]);
  if (object) ok(await admin.storage.from('instruction-videos').remove([object]));
  if (studentId) sql(source, `delete from public.subscription_entries where relationship_id in (select id from public.trainer_student_relationships where student_id='${studentId}'); delete from public.trainer_student_relationships where student_id='${studentId}'; delete from public.students where id='${studentId}';`);
  for (const id of users.reverse()) ok(await admin.auth.admin.deleteUser(id));
  try { const report = JSON.parse(await readFile(`${directory}/report.json`, 'utf8')); report.cleanup = true; await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2)); } catch { /* No successful report on a failed restore. */ }
  await rm(`${directory}/backup`, { recursive: true, force: true });
}
