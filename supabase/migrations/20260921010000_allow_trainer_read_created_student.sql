create or replace function private.can_read_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.students student
    left join public.trainer_student_relationships relationship
      on relationship.student_id = student.id
     and relationship.status <> 'archived'
    where student.id = p_student_id
      and (
        student.account_id = (select auth.uid())
        or student.created_by = (select auth.uid())
        or relationship.trainer_id = (select auth.uid())
      )
  );
$$;
