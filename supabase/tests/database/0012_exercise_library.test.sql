begin;

select plan(3);

select is(
  (select count(*)::integer from public.exercise_definitions where owner_id is null and archived_at is null),
  66,
  'system exercise library contains the complete active set'
);

select is(
  (select count(distinct slug)::integer from public.exercise_definitions where owner_id is null and archived_at is null),
  66,
  'system exercise slugs are unique'
);

select is(
  (
    select count(*)::integer
    from (
      select primary_muscle
      from public.exercise_definitions
      where owner_id is null and archived_at is null
      group by primary_muscle
      having count(*) >= 3
    ) covered_groups
  ),
  10,
  'every muscle group has at least three exercises'
);

select * from finish();
rollback;
