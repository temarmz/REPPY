// Explicitly isolated preview only. No credentials are printed or sent to browsers.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../app/supabase-repository.ts';
execFileSync('swiftc', ['-parse-as-library', '-module-cache-path', '/tmp/reppy-swift-module-cache', ...readdirSync('ios/REPPY/Core').filter(n=>n.endsWith('.swift')).map(n=>'ios/REPPY/Core/'+n), 'ios/REPPY/Data/SessionKeychain.swift', 'ios/REPPY/Data/SupabaseAPI.swift', 'ios/REPPY/Data/AppSnapshotLoader.swift', 'tests/stress/native-preview.swift', '-o', '/tmp/reppy-native-stress']);
const ref = 'nueevatykajichtakdnc', url = `https://${ref}.supabase.co`;
assert.equal(process.argv[2], '--isolated-preview', 'Explicit --isolated-preview required');
const projects = JSON.parse(execFileSync('npx',['supabase','projects','list','-o','json'],{encoding:'utf8'}));
assert.equal(projects.find(p=>p.id===ref)?.name,'reppy-preview-ci');
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',ref,'-o','json'],{encoding:'utf8'}));
const anon=keys.find(k=>k.name==='anon').api_key;
const client=key=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(resource,init={})=>fetch(resource,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})}});
const admin=client(keys.find(k=>k.name==='service_role').api_key);
const ok=(r,label)=>{assert.ifError(r.error && new Error(`${label}: ${r.error.message}`));return r.data;};
const output='work/stress-2026-11-07';await mkdir(output,{recursive:true});
const run=crypto.randomUUID(), users=[], students=[], relationships=[], assignments=[];
const report={run,started:new Date().toISOString(),checks:[],metrics:{},cleanup:false};
const check=(name,detail)=>{report.checks.push({name,detail});console.log(name,JSON.stringify(detail));};
const timings=[];
async function measured(label,fn){const start=performance.now();const r=await fn();timings.push({label,ms:performance.now()-start});return r;}
async function account(role){const email=`stress-${role}-${crypto.randomUUID()}@example.com`,password=crypto.randomUUID()+'aA1!';const u=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:role==='trainer'?{reppy_role:role}:{},user_metadata:{display_name:'Stress '+role}}),'create user').user;users.push(u.id);const c=client(anon);const session=ok(await c.auth.signInWithPassword({email,password}),'sign in').session;return {id:u.id,c,session};}
async function nativeProbe() { return await new Promise((resolve,reject)=>{const p=spawn('/tmp/reppy-native-stress',[secret]);let out='',failure='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>failure+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(new Error('Native probe failed '+code+': '+failure.slice(0,1500))));}); }
const secret=join(tmpdir(),`reppy-stress-${run}.json`);
try {
 const trainer=await account('trainer'),student=await account('student'),outsider=await account('trainer');
 const invite=ok(await trainer.c.rpc('create_student_with_invitation',{p_name:'Stress student',p_color:'lime',p_timezone:'Europe/Moscow'}),'invite');relationships.push(invite.relationshipId);
 const relation=ok(await student.c.rpc('accept_student_invitation',{p_token:invite.token}),'accept');students.push(relation.student_id);
 const extras=Array.from({length:99},(_,i)=>({id:crypto.randomUUID(),created_by:trainer.id,name:`Stress student ${i}`}));students.push(...extras.map(x=>x.id));ok(await admin.from('students').insert(extras),'seed students');
 const rels=extras.map(s=>({id:crypto.randomUUID(),student_id:s.id,trainer_id:trainer.id,status:'active',timezone:'Europe/Moscow'}));relationships.push(...rels.map(x=>x.id));ok(await admin.from('trainer_student_relationships').insert(rels),'seed relations');
 const exerciseId='00000000-0000-4000-8000-000000000003';
 const makeWorkout=(count,sets)=>({id:crypto.randomUUID(),name:'Stress workout',createdAt:new Date().toISOString(),exercises:Array.from({length:count},(_,i)=>({id:crypto.randomUUID(),exerciseId,name:`Отжимания ${i}`,primaryMuscle:'Грудь',equipment:'Свой вес',measureType:'reps',loadMode:'bodyweight',plannedSets:Array.from({length:sets},()=>({targetReps:12,targetWeight:0}))}))});
 const historyWorkout=makeWorkout(1,1);const history=relationships.flatMap(relationship_id=>Array.from({length:36},(_,i)=>({id:crypto.randomUUID(),relationship_id,scheduled_for:new Date(Date.UTC(2023+Math.floor(i/12),i%12,10)).toISOString().slice(0,10),scheduled_time:'18:00:00',format:'in-person',status:'assigned',workout_snapshot:historyWorkout})));
 assignments.push(...history.map(x=>x.id));for(let i=0;i<history.length;i+=100)ok(await admin.from('assignments').insert(history.slice(i,i+100)),'seed history');
 const payments=Array.from({length:1205},()=>({id:crypto.randomUUID(),relationship_id:relation.id,kind:'payment',lesson_delta:1,amount_rub:1,payment_method:'cash',occurred_at:new Date().toISOString()})); for(let i=0;i<payments.length;i+=100)ok(await admin.from('subscription_entries').insert(payments.slice(i,i+100)),'seed ledger');
 check('seed',{students:students.length,assignments:history.length});
 const repository=createSupabaseRepository(trainer.c,{id:trainer.id,role:'trainer'});const state=await measured('web snapshot',()=>repository.load());check('web snapshot count',{expected:history.length,actual:state.assignments.length});
 await writeFile(secret,JSON.stringify({url,anon,session:trainer.session}),{mode:0o600});
 const native=await nativeProbe();check('native snapshot count',native);
 check('ledger pagination',{web:state.subscriptionEntries.length,native:native.subscriptions,expected:1205});assert.equal(state.subscriptionEntries.length,1205);assert.equal(native.subscriptions,1205);
 report.metrics.snapshotComplete=state.assignments.length===history.length && native.assignments===history.length;
 const workout=makeWorkout(25,8),assignmentId=crypto.randomUUID();assignments.push(assignmentId);
 ok(await trainer.c.from('assignments').insert({id:assignmentId,relationship_id:relation.id,scheduled_for:'2026-11-07',scheduled_time:'18:00:00',format:'in-person',status:'assigned',workout_snapshot:workout}),'active assignment');
 const starts=await measured('12 concurrent starts',()=>Promise.all(Array.from({length:12},(_,i)=>(i%2?trainer:student).c.rpc('start_workout_session_with_id',{p_assignment_id:assignmentId,p_session_id:crypto.randomUUID()}))));
 starts.forEach(r=>ok(r,'start race'));const ids=new Set(starts.map(r=>r.data.id));assert.equal(ids.size,1);const sessionId=starts[0].data.id;check('single session under concurrent start',{requests:12,sessions:ids.size});
 const results=workout.exercises.flatMap(e=>e.plannedSets.map((_,i)=>({exerciseInstanceId:e.id,setNumber:i+1,actualReps:12,actualWeight:0,completed:true})));
 let winners=0,conflicts=0,nativeWins=0;
 for(let round=0;round<20;round++){
  const current=ok(await trainer.c.from('workout_sessions').select('revision').eq('id',sessionId).single(),'revision');
  await writeFile(secret,JSON.stringify({url,anon,session:trainer.session,save:{p_session_id:sessionId,p_expected_revision:current.revision,p_workout_snapshot:workout,p_results:results.map(r=>({...r,actualReps:1000+round}))}}),{mode:0o600});
  const nativeSave=nativeProbe();
  if(round%2===0)await new Promise(resolve=>setTimeout(resolve,1000));
  const race=await measured('8 concurrent CAS saves',()=>Promise.all(Array.from({length:8},(_,i)=>(i%2?trainer:student).c.rpc('save_session_progress',{p_session_id:sessionId,p_expected_revision:current.revision,p_workout_snapshot:workout,p_results:results.map(r=>({...r,actualReps:12+round+i}))}))));
  const swiftSave=await nativeSave;const success=race.filter(r=>!r.error);assert.equal(success.length+(swiftSave.success?1:0),1);winners++;if(swiftSave.success)nativeWins++;else { assert.equal(swiftSave.code,"PT409"); conflicts++; }for(const r of race.filter(r=>r.error)){assert.equal(r.error.code,'PT409');conflicts++;}
  const stored=ok(await student.c.from('set_results').select('actual_reps').eq('session_id',sessionId),'results');assert.equal(stored.length,200);assert.equal(new Set(stored.map(r=>r.actual_reps)).size,1);const expectedReps=swiftSave.success?1000+round:12+round+race.findIndex(r=>!r.error);assert.ok(stored.every(r=>r.actual_reps===expectedReps),'all 200 sets must equal the winning payload');
 }
 check('CAS races preserve atomic payload',{rounds:20,winners,conflicts,nativeWins,sets:200});
 let dropped=false;const lossy={functions:student.c.functions,from:student.c.from.bind(student.c),rpc:async(n,args)=>{const r=await student.c.rpc(n,args);if(n==='save_session_progress'&&!r.error&&!dropped){dropped=true;return{data:null,error:{message:'TypeError: Failed to fetch'}};}return r;}};
 const recovery=createSupabaseRepository(lossy,{id:student.id,role:'student'});const recoveryState=await recovery.load();recoveryState.sessions.find(s=>s.id===sessionId).results[0].actualReps=91;
 await assert.rejects(recovery.execute({type:'session.progress',sessionId},recoveryState));const before=ok(await student.c.from('workout_sessions').select('revision').eq('id',sessionId).single(),'lost ack revision');await recovery.execute({type:'session.progress',sessionId},recoveryState);const after=ok(await student.c.from('workout_sessions').select('revision').eq('id',sessionId).single(),'retry revision');assert.equal(before.revision,after.revision);check('lost committed acknowledgement reconciles',{revision:after.revision});
 const denial=await outsider.c.rpc('complete_workout_session',{p_session_id:sessionId,p_charge_subscription:true});assert.ok(denial.error,'outsider must not complete another session');assert.equal(ok(await student.c.from('workout_sessions').select('completed_at').eq('id',sessionId).single(),'after denied completion').completed_at,null);check('outsider cannot complete workout',true);
 const finished=await measured('12 concurrent completions',()=>Promise.all(Array.from({length:12},(_,i)=>(i%2?trainer:student).c.rpc('complete_workout_session',{p_session_id:sessionId,p_charge_subscription:true}))));finished.forEach(r=>ok(r,'finish'));
 const entries=ok(await admin.from('subscription_entries').select('id,lesson_delta').eq('session_id',sessionId).eq('kind','session-charge'),'ledger');assert.equal(entries.length,1);assert.equal(entries[0].lesson_delta,-1);check('completion exactly once',{requests:12,charges:entries.length});
 const finalWeb=await repository.load();assert.equal(finalWeb.subscriptionEntries.reduce((n,e)=>n+e.lessonDelta,0),1204);assert.equal(finalWeb.sessions.find(s=>s.id===sessionId).results.length,200);assert.equal(finalWeb.sessions.find(s=>s.id===sessionId).results.filter(r=>r.actualReps===91).length,1);
 await writeFile(secret,JSON.stringify({url,anon,session:trainer.session}),{mode:0o600});const finalNative=await nativeProbe();assert.equal(finalNative.balance,1204);assert.equal(finalNative.results,200);assert.equal(finalNative.resultsAt91,1);assert.equal(finalNative.completedSessions,1);check('both clients agree after completion',{balance:1204,sets:200,completedSessions:1});
 assert.deepEqual(ok(await outsider.c.from('assignments').select('id').in('id',[assignmentId,history[0].id]),'outsider RLS'),[]);check('outsider remains isolated',true);
 if(!report.metrics.snapshotComplete)throw new Error('Incomplete account snapshot: silent truncation at server row limit');
} catch(e){report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally {
 // Remove only explicitly tracked rows; preserve evidence of any cleanup failure.
 const errors=[];const clean=async(table,key,ids)=>{for(let i=0;i<ids.length;i+=100){const r=await admin.from(table).delete().in(key,ids.slice(i,i+100));if(r.error)errors.push(`${table}: ${r.error.message}`);}};
 if(relationships.length){await clean('subscription_entries','relationship_id',relationships);await clean('workout_sessions','assignment_id',assignments);await clean('assignments','id',assignments);await clean('trainer_student_relationships','id',relationships);}
 await clean('students','id',students);for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)errors.push('auth: '+r.error.message);}
 await rm(secret,{force:true});report.cleanup=errors.length===0;report.cleanupErrors=errors;report.finished=new Date().toISOString();report.timings=timings;await writeFile(`${output}/preview-stress.json`,JSON.stringify(report,null,2));console.log('cleanup',report.cleanup);if(errors.length)process.exitCode=1;
}
