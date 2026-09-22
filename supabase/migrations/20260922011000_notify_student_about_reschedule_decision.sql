create function private.enqueue_assignment_reschedule_decision_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_student_account_id uuid;
  v_workout_name text;
  v_accepted boolean;
begin
  if old.reschedule_requested_at is null
    or new.reschedule_requested_at is not null then
    return new;
  end if;

  select relationship.trainer_id, student.account_id
  into v_trainer_id, v_student_account_id
  from public.trainer_student_relationships relationship
  join public.students student on student.id = relationship.student_id
  where relationship.id = new.relationship_id;

  if v_student_account_id is null
    or (select auth.uid()) is distinct from v_trainer_id then
    return new;
  end if;

  v_workout_name := coalesce(new.workout_snapshot ->> 'name', 'Тренировка');
  v_accepted := new.scheduled_for is not distinct from old.reschedule_scheduled_for
    and new.scheduled_time is not distinct from old.reschedule_scheduled_time;

  insert into public.telegram_notification_outbox (
    recipient_profile_id,
    actor_profile_id,
    kind,
    event_key,
    payload
  ) values (
    v_student_account_id,
    v_trainer_id,
    case
      when v_accepted then 'assignment-reschedule-accepted'::public.telegram_notification_kind
      else 'assignment-reschedule-declined'::public.telegram_notification_kind
    end,
    format(
      'assignment-reschedule-decision:%s:%s:%s',
      new.id,
      old.reschedule_requested_at,
      case when v_accepted then 'accepted' else 'declined' end
    ),
    jsonb_build_object(
      'workoutName', v_workout_name,
      'scheduledFor', new.scheduled_for,
      'scheduledTime', new.scheduled_time
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;

create trigger assignments_enqueue_reschedule_decision_notification
after update of reschedule_requested_at on public.assignments
for each row execute function private.enqueue_assignment_reschedule_decision_notification();
