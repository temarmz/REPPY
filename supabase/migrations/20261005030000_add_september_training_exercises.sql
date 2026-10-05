insert into public.exercise_definitions (id, slug, name, primary_muscle, equipment, measure_type, load_mode)
values
  ('00000000-0000-4000-8000-000000000087', 'hip-adduction', 'Приведение ног в тренажёре', 'Ягодицы', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000088', 'one-arm-dumbbell-lateral-raise', 'Отведение руки с гантелью в сторону', 'Плечи', 'Гантель', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000089', 'wide-grip-lat-pulldown', 'Тяга верхнего блока широким хватом', 'Спина', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000090', 'reverse-grip-lat-pulldown', 'Тяга верхнего блока обратным хватом', 'Спина', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000091', 'incline-smith-press', 'Жим в машине Смита на наклонной скамье 35°', 'Грудь', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000092', 'single-arm-seated-cable-row', 'Тяга горизонтального блока одной рукой', 'Спина', 'Блок', 'reps', 'external')
on conflict (slug) do update
set name = excluded.name,
    primary_muscle = excluded.primary_muscle,
    equipment = excluded.equipment,
    measure_type = excluded.measure_type,
    load_mode = excluded.load_mode,
    archived_at = null;
