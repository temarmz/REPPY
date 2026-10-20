import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Replace only the browser-config dependency; exercise the actual repository code.
const dependencyUrl = `data:text/javascript,${encodeURIComponent('let client = null; export const setClient = value => { client = value; }; export const getSupabaseClient = () => client;')}`;
const dependency = await import(dependencyUrl);
const source = readFileSync(new URL('../app/instruction-video-repository.ts', import.meta.url), 'utf8')
  .replace("'./supabase-client'", JSON.stringify(dependencyUrl));
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { saveInstructionVideo } = await import(`data:text/javascript;base64,${Buffer.from(`${outputText}\n//# sourceURL=instruction-video-repository-under-test.js`).toString('base64')}`);

for (const scenario of ['no session', 'no student', 'session error']) {
  test(`remote video never falls back to demo storage: ${scenario}`, async (t) => {
    const previous = globalThis.window;
    t.after(() => { globalThis.window = previous; dependency.setClient(null); });
    let storageOpened = false;
    globalThis.window = { indexedDB: { open() { storageOpened = true; throw new Error('unexpected demo storage'); } } };
    dependency.setClient({ auth: { getSession: async () => ({
      data: { session: scenario === 'no student' ? { user: { id: 'trainer' } } : null },
      error: scenario === 'session error' ? { message: 'Session unavailable' } : null,
    }) } });
    const file = new File(['video'], 'technique.mp4', { type: 'video/mp4' });
    await assert.rejects(saveInstructionVideo(file, scenario === 'no student' ? undefined : 'student'),
      scenario === 'no student' ? /ученик/i : scenario === 'session error' ? /Session unavailable/ : /войти/i);
    assert.equal(storageOpened, false);
  });
}

test('authenticated video saves both private storage and metadata before reporting success', async (t) => {
  t.after(() => dependency.setClient(null));
  const calls = [];
  dependency.setClient({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'trainer' } } }, error: null }) },
    from(table) {
      if (table === 'trainer_student_relationships') return { select: () => ({ eq: (_field, id) => {
        assert.equal(id, 'student');
        return { maybeSingle: async () => ({ data: { id: 'relationship' }, error: null }) };
      } }) };
      assert.equal(table, 'instruction_videos');
      return { insert: async (metadata) => { calls.push(metadata); return { error: null }; } };
    },
    storage: { from: (bucket) => ({ upload: async (path, file) => {
      assert.equal(bucket, 'instruction-videos');
      assert.ok(path.startsWith('relationship/'));
      calls.push({ path, size: file.size });
      return { error: null };
    } }) },
  });
  const video = await saveInstructionVideo(new File(['video'], 'technique.mp4', { type: 'video/mp4' }), 'student');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].id, video.id);
  assert.equal(calls[1].object_path, calls[0].path);
  assert.equal(calls[1].uploaded_by, 'trainer');
  assert.equal(video.name, 'technique.mp4');
});
