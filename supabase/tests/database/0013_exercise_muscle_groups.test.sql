begin;

select plan(3);

select has_column(
  'public',
  'exercise_definitions',
  'muscle_groups',
  'exercise definitions store all selected muscle groups'
);

select is(
  (
    select count(*)::integer
    from public.exercise_definitions
    where owner_id is null
      and archived_at is null
      and muscle_groups @> array[primary_muscle]
  ),
  92,
  'existing system exercises are backfilled with their primary muscle'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.exercise_definitions'::regclass
      and conname = 'exercise_definitions_muscle_groups_valid'
  ),
  'muscle groups are protected by a database constraint'
);

select * from finish();
rollback;
