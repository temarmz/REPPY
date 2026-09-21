begin;

select plan(13);

insert into auth.users (id)
values
  ('16000000-0000-4000-8000-000000000001'),
  ('16000000-0000-4000-8000-000000000002');

insert into public.profiles (id, role, display_name)
values
  ('16000000-0000-4000-8000-000000000001', 'trainer', 'Video Trainer'),
  ('16000000-0000-4000-8000-000000000002', 'student', 'Video Student');

insert into public.students (id, account_id, created_by, name)
values (
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  '16000000-0000-4000-8000-000000000001',
  'Video Student'
);

insert into public.trainer_student_relationships (id, trainer_id, student_id, status)
values (
  '36000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.instruction_videos (
  id,
  relationship_id,
  uploaded_by,
  object_path,
  file_name,
  mime_type,
  byte_size,
  created_at
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    '16000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/referenced.mp4',
    'referenced.mp4',
    'video/mp4',
    1024,
    now() - interval '2 days'
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '36000000-0000-4000-8000-000000000001',
    '16000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000002/orphan.mp4',
    'orphan.mp4',
    'video/mp4',
    1024,
    now() - interval '2 days'
  ),
  (
    '96000000-0000-4000-8000-000000000003',
    '36000000-0000-4000-8000-000000000001',
    '16000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000003/history.mp4',
    'history.mp4',
    'video/mp4',
    1024,
    now() - interval '2 days'
  ),
  (
    '96000000-0000-4000-8000-000000000004',
    '36000000-0000-4000-8000-000000000001',
    '16000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000004/fresh.mp4',
    'fresh.mp4',
    'video/mp4',
    1024,
    now()
  );

insert into public.assignments (
  id,
  relationship_id,
  scheduled_for,
  scheduled_time,
  workout_snapshot
)
values
  (
    '46000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    current_date,
    '18:00',
    '{"name":"Referenced","exercises":[{"instructionVideo":{"id":"96000000-0000-4000-8000-000000000001"}}]}'
  ),
  (
    '46000000-0000-4000-8000-000000000002',
    '36000000-0000-4000-8000-000000000001',
    current_date,
    '19:00',
    '{"name":"History","exercises":[]}'
  );

insert into public.workout_sessions (
  id,
  assignment_id,
  workout_snapshot,
  recorded_by_user_id,
  recorded_by_role
)
values (
  '56000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000002',
  '{"name":"History","exercises":[{"instructionVideo":{"id":"96000000-0000-4000-8000-000000000003"}}]}',
  '16000000-0000-4000-8000-000000000001',
  'trainer'
);

select has_function('public', 'claim_orphan_instruction_videos', array[]::text[], 'video cleanup RPC exists');
select has_function('public', 'delete_claimed_instruction_videos', array['uuid[]'], 'video cleanup finalizer exists');

select ok(
  has_function_privilege('authenticated', 'public.claim_orphan_instruction_videos()', 'execute')
    and has_function_privilege('authenticated', 'public.delete_claimed_instruction_videos(uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.claim_orphan_instruction_videos()', 'execute')
    and not has_function_privilege('anon', 'public.delete_claimed_instruction_videos(uuid[])', 'execute'),
  'only authenticated users can call the cleanup RPCs'
);

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.claim_orphan_instruction_videos()),
  1,
  'trainer claims only the old unreferenced video'
);

reset role;

select isnt((select deleted_at from public.instruction_videos where id = '96000000-0000-4000-8000-000000000002'), null, 'orphan is tombstoned');
select is((select deleted_at from public.instruction_videos where id = '96000000-0000-4000-8000-000000000001'), null, 'assigned video remains active');
select is((select deleted_at from public.instruction_videos where id = '96000000-0000-4000-8000-000000000003'), null, 'session history video remains active');
select is((select deleted_at from public.instruction_videos where id = '96000000-0000-4000-8000-000000000004'), null, 'fresh orphan remains inside the grace period');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select is(
  public.delete_claimed_instruction_videos(array['96000000-0000-4000-8000-000000000002'::uuid]),
  1,
  'trainer finalizes metadata only after the storage object is removed'
);

reset role;
select is(
  (select count(*)::integer from public.instruction_videos where id = '96000000-0000-4000-8000-000000000002'),
  0,
  'finalized orphan metadata is deleted'
);

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select throws_ok(
  $$insert into public.assignments (
      relationship_id,
      scheduled_for,
      scheduled_time,
      workout_snapshot
    ) values (
      '36000000-0000-4000-8000-000000000001',
      current_date,
      '20:00',
      '{"name":"Invalid","exercises":[{"instructionVideo":{"id":"96000000-0000-4000-8000-000000000002"}}]}'
    )$$,
  '23503',
  'Instruction video is unavailable for this relationship',
  'a claimed video cannot be attached to a new snapshot'
);

reset role;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$select public.claim_orphan_instruction_videos()$$,
  '42501',
  'Only a trainer can clean up instruction videos',
  'student cannot claim videos for cleanup'
);

select throws_ok(
  $$select public.delete_claimed_instruction_videos(array['96000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501',
  'Only a trainer can finalize instruction video cleanup',
  'student cannot finalize video cleanup'
);

select * from finish();
rollback;
