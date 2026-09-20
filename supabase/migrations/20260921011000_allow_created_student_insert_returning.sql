drop policy if exists students_read_related on public.students;

create policy students_read_related on public.students
for select to authenticated
using (
  created_by = (select auth.uid())
  or private.can_read_student(id)
);
