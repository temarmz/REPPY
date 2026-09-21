begin;

select plan(30);

create table public.default_acl_table_probe (id integer);
create function public.default_acl_function_probe()
returns integer
language sql
as 'select 1';

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'students', 'students table exists');
select has_table('public', 'trainer_student_relationships', 'relationships table exists');
select has_table('public', 'exercise_definitions', 'exercise definitions table exists');
select has_table('public', 'assignments', 'assignments table exists');
select has_table('public', 'workout_sessions', 'workout sessions table exists');
select has_table('public', 'set_results', 'set results table exists');
select has_table('public', 'subscription_entries', 'subscription ledger exists');
select has_table('public', 'instruction_videos', 'instruction video metadata exists');
select has_table('public', 'student_invitations', 'student invitations table exists');

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'students',
        'trainer_student_relationships',
        'exercise_definitions',
        'assignments',
        'workout_sessions',
        'set_results',
        'subscription_entries',
        'instruction_videos',
        'student_invitations'
      )
      and relation.relrowsecurity
  ),
  10,
  'RLS is enabled on every public API table'
);

select has_function('public', 'start_workout_session', array['uuid'], 'start RPC exists');
select has_function('public', 'save_session_progress', array['uuid', 'bigint', 'jsonb', 'jsonb'], 'progress RPC exists');
select has_function('public', 'complete_workout_session', array['uuid', 'boolean'], 'completion RPC exists');
select has_function('public', 'archive_workout_session', array['uuid'], 'archive RPC exists');
select has_function('public', 'get_subscription_summary', array['uuid'], 'subscription summary RPC exists');
select has_function('public', 'create_student_invitation', array['uuid', 'text'], 'invitation creation RPC exists');
select has_function('public', 'get_student_invitation_preview', array['text'], 'invitation preview RPC exists');
select has_function('public', 'accept_student_invitation', array['text'], 'invitation acceptance RPC exists');
select has_function('public', 'revoke_student_invitation', array['uuid'], 'invitation revocation RPC exists');

select ok(
  not has_function_privilege('anon', 'public.complete_workout_session(uuid, boolean)', 'execute'),
  'anonymous users cannot complete sessions'
);

select ok(
  not has_table_privilege('authenticated', 'public.set_results', 'insert, update, delete'),
  'authenticated users cannot mutate set results outside the progress RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.student_invitations', 'insert, update, delete'),
  'authenticated users cannot mutate invitations outside the invitation RPCs'
);

select ok(
  has_function_privilege('anon', 'public.get_student_invitation_preview(text)', 'execute')
    and not has_function_privilege('anon', 'public.create_student_invitation(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.accept_student_invitation(text)', 'execute')
    and not has_function_privilege('anon', 'public.revoke_student_invitation(uuid)', 'execute'),
  'anonymous users can preview an invitation but cannot mutate it'
);

select ok(
  has_function_privilege('authenticated', 'public.create_student_invitation(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.get_student_invitation_preview(text)', 'execute')
    and has_function_privilege('authenticated', 'public.accept_student_invitation(text)', 'execute')
    and has_function_privilege('authenticated', 'public.revoke_student_invitation(uuid)', 'execute'),
  'authenticated users can invoke the invitation lifecycle RPCs'
);

select ok(
  not has_table_privilege('anon', 'public.default_acl_table_probe', 'select')
    and not has_table_privilege('authenticated', 'public.default_acl_table_probe', 'select'),
  'future public tables are private until explicitly granted'
);

select ok(
  not has_function_privilege('anon', 'public.default_acl_function_probe()', 'execute')
    and not has_function_privilege('authenticated', 'public.default_acl_function_probe()', 'execute'),
  'future public functions are private until explicitly granted'
);

select is(
  (select bucket.public from storage.buckets bucket where bucket.id = 'instruction-videos'),
  false,
  'instruction video bucket is private'
);

select is(
  (select count(*)::integer from public.exercise_definitions where owner_id is null),
  28,
  'the canonical exercise library is installed'
);

select is(
  (
    select count(*)::integer
    from pg_publication_tables published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename in (
        'students',
        'trainer_student_relationships',
        'exercise_definitions',
        'assignments',
        'workout_sessions',
        'set_results',
        'subscription_entries'
      )
  ),
  7,
  'client data tables are published through Supabase Realtime'
);

select * from finish();
rollback;
