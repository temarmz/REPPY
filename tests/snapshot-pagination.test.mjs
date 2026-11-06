import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRepository } from '../app/supabase-repository.ts';

function fixture(failPage = false) {
  const calls = [];
  const tables = {
    profiles: [{ id: 'trainer', display_name: 'Trainer' }],
    students: [{ id: 'student', name: 'Student' }],
    trainer_student_relationships: [{ id: 'relationship', trainer_id: 'trainer', student_id: 'student', status: 'active', color: 'lime' }],
    assignments: Array.from({ length: 2105 }, (_, i) => ({ id: `assignment-${i}`, relationship_id: 'relationship', assigned_at: '2026-01-01T00:00:00Z', scheduled_for: '2026-01-01', format: 'online', status: 'assigned', revision: 1,
      workout_snapshot: { id: 'workout', name: 'History', exercises: [] } })),
    subscriptions: Array.from({ length: 2105 }, (_, i) => ({ id: `payment-${i}`, relationship_id: 'relationship', kind: 'payment', lesson_delta: 1, occurred_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', revision: 1 })),
  };
  function query(table) {
    let start = 0, end = 999; const order = [];
    const q = { select: () => q, order: column => { order.push(column); return q; }, range: (a,b) => { start=a; end=b; return q; },
      then(resolve,reject) { calls.push({ table,start,end,order:[...order] }); return Promise.resolve(failPage && table===(typeof failPage === 'string' ? failPage : 'assignments') && start===1000
        ? { data:null,error:{message:'Second page unavailable'} } : { data:(tables[table]??[]).slice(start,end+1),error:null }).then(resolve,reject); } };
    return q;
  }
  return { calls, repository: createSupabaseRepository({ from: query, rpc: () => query('subscriptions'), functions: { invoke: async () => ({ data: null, error: null }) } }, { id:'trainer',role:'trainer' }) };
}
test('account snapshot reads all table and RPC pages with stable ordering', async () => {
  const { repository,calls }=fixture();const state=await repository.load();
  assert.equal(state.assignments.length,2105);assert.equal(new Set(state.assignments.map(a=>a.id)).size,2105);
  assert.equal(state.subscriptionEntries.length,2105);
  for(const table of ['assignments','subscriptions']) assert.deepEqual(calls.filter(c=>c.table===table).map(c=>[c.start,c.end,c.order]),[[0,999,['id']],[1000,1999,['id']],[2000,2999,['id']]]);
});
test('a failed later page never becomes an accepted partial snapshot',async()=>{
  const {repository}=fixture(true);await assert.rejects(repository.load(),/Second page unavailable/);
});

test('a failed later ledger RPC page cannot silently erase the subscription balance',async()=>{
  const {repository}=fixture('subscriptions');await assert.rejects(repository.load(),/Second page unavailable/);
});
