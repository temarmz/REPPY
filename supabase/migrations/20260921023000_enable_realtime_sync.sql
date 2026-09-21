do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'students',
    'trainer_student_relationships',
    'exercise_definitions',
    'assignments',
    'workout_sessions',
    'set_results',
    'subscription_entries'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end
$$;
