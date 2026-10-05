alter table public.exercise_definitions
  add column muscle_groups text[] not null default '{}';

update public.exercise_definitions
set muscle_groups = case
  when primary_muscle = 'Другое' then '{}'
  else array[primary_muscle]
end;

alter table public.exercise_definitions
  add constraint exercise_definitions_muscle_groups_valid check (
    cardinality(muscle_groups) <= 10
    and array_position(muscle_groups, null) is null
    and muscle_groups <@ array[
      'Грудь',
      'Спина',
      'Плечи',
      'Бицепс',
      'Трицепс',
      'Квадрицепс',
      'Ягодицы',
      'Задняя поверхность бедра',
      'Икры',
      'Кор'
    ]::text[]
  );

grant update (muscle_groups) on public.exercise_definitions to authenticated;
