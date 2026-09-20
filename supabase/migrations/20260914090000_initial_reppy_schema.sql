create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

alter default privileges for role postgres
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres
  revoke usage, select on sequences from public, anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

create type public.app_role as enum ('trainer', 'student');
create type public.student_status as enum ('invited', 'active', 'archived');
create type public.student_color as enum ('lime', 'violet', 'pink', 'orange');
create type public.gender as enum ('male', 'female', 'not-specified');
create type public.training_format as enum ('in-person', 'online');
create type public.assignment_status as enum ('assigned', 'completed', 'cancelled');
create type public.session_status as enum ('active', 'completed');
create type public.mood_rating as enum ('great', 'good', 'tired', 'hard');
create type public.session_charge_status as enum ('charged', 'waived');
create type public.subscription_entry_kind as enum ('payment', 'session-charge', 'session-refund');
create type public.payment_method as enum ('cash', 'transfer');
create type public.measure_type as enum ('reps', 'duration');
create type public.load_mode as enum ('external', 'bodyweight');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  phone text,
  height_cm numeric(5, 2) check (height_cm is null or height_cm between 50 and 260),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 20 and 500),
  gender public.gender,
  contraindications text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainer_student_relationships (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  status public.student_status not null default 'invited',
  color public.student_color not null default 'lime',
  timezone text not null default 'UTC' check (length(btrim(timezone)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainer_id, student_id)
);

create table public.exercise_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 160),
  primary_muscle text not null check (length(btrim(primary_muscle)) between 2 and 80),
  equipment text not null check (length(btrim(equipment)) between 2 and 100),
  measure_type public.measure_type not null default 'reps',
  load_mode public.load_mode not null default 'external',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_definitions_system_slug check (owner_id is not null or slug is not null)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.trainer_student_relationships (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  scheduled_for date not null,
  scheduled_time time,
  timezone text,
  format public.training_format not null default 'in-person',
  status public.assignment_status not null default 'assigned',
  workout_snapshot jsonb not null,
  repeated_from_assignment_id uuid references public.assignments (id) on delete set null,
  reschedule_scheduled_for date,
  reschedule_scheduled_time time,
  reschedule_requested_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint assignments_schedule_matches_format check (
    (format = 'in-person' and scheduled_time is not null)
    or (format = 'online' and scheduled_time is null)
  ),
  constraint assignments_reschedule_complete check (
    (reschedule_scheduled_for is null and reschedule_scheduled_time is null and reschedule_requested_at is null)
    or (
      format = 'in-person'
      and reschedule_scheduled_for is not null
      and reschedule_scheduled_time is not null
      and reschedule_requested_at is not null
    )
  ),
  constraint assignments_workout_snapshot_valid check (
    jsonb_typeof(workout_snapshot) = 'object'
    and workout_snapshot ? 'name'
    and nullif(btrim(workout_snapshot ->> 'name'), '') is not null
    and workout_snapshot ? 'exercises'
    and jsonb_typeof(workout_snapshot -> 'exercises') = 'array'
  )
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments (id) on delete restrict,
  workout_snapshot jsonb not null,
  status public.session_status not null default 'active',
  recorded_by_user_id uuid not null references public.profiles (id) on delete restrict,
  recorded_by_role public.app_role not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid references public.profiles (id) on delete restrict,
  mood public.mood_rating,
  comment text,
  charge_status public.session_charge_status,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workout_sessions_completion_state check (
    (status = 'active' and completed_at is null and completed_by_user_id is null and charge_status is null)
    or (status = 'completed' and completed_at is not null and completed_by_user_id is not null and charge_status is not null)
  ),
  constraint workout_sessions_snapshot_valid check (
    jsonb_typeof(workout_snapshot) = 'object'
    and workout_snapshot ? 'name'
    and nullif(btrim(workout_snapshot ->> 'name'), '') is not null
    and workout_snapshot ? 'exercises'
    and jsonb_typeof(workout_snapshot -> 'exercises') = 'array'
  )
);

create table public.set_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_definition_id uuid not null references public.exercise_definitions (id) on delete restrict,
  exercise_instance_id uuid not null,
  set_number smallint not null check (set_number > 0),
  actual_reps integer not null default 0 check (actual_reps >= 0),
  actual_weight numeric(8, 2) not null default 0 check (actual_weight >= 0),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_instance_id, set_number)
);

create table public.subscription_entries (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.trainer_student_relationships (id) on delete restrict,
  kind public.subscription_entry_kind not null,
  lesson_delta integer not null,
  occurred_at timestamptz not null,
  amount_rub numeric(12, 2),
  payment_method public.payment_method,
  comment text,
  session_id uuid references public.workout_sessions (id) on delete restrict,
  workout_name text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_entries_kind_fields check (
    (
      kind = 'payment'
      and lesson_delta > 0
      and amount_rub is not null
      and amount_rub >= 0
      and payment_method is not null
      and session_id is null
    )
    or (
      kind = 'session-charge'
      and lesson_delta = -1
      and amount_rub is null
      and payment_method is null
      and session_id is not null
    )
    or (
      kind = 'session-refund'
      and lesson_delta = 1
      and amount_rub is null
      and payment_method is null
      and session_id is not null
    )
  ),
  unique (session_id, kind)
);

create table public.instruction_videos (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.trainer_student_relationships (id) on delete restrict,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  object_path text not null unique check (length(btrim(object_path)) between 3 and 1024),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (mime_type like 'video/%'),
  byte_size bigint not null check (byte_size between 1 and 104857600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.student_invitations (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.trainer_student_relationships (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  target_email text not null check (
    target_email = lower(btrim(target_email))
    and char_length(target_email) between 3 and 320
    and target_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_invitations_terminal_state check (accepted_at is null or revoked_at is null),
  constraint student_invitations_acceptance_complete check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  )
);

create index students_account_id_idx on public.students (account_id) where account_id is not null;
create index relationships_student_idx on public.trainer_student_relationships (student_id);
create index relationships_trainer_status_idx on public.trainer_student_relationships (trainer_id, status);
create index exercise_definitions_owner_idx on public.exercise_definitions (owner_id) where owner_id is not null;
create index assignments_relationship_schedule_idx on public.assignments (relationship_id, scheduled_for, scheduled_time) where deleted_at is null;
create index assignments_status_idx on public.assignments (status) where deleted_at is null;
create index workout_sessions_completed_idx on public.workout_sessions (assignment_id, completed_at desc) where deleted_at is null;
create index set_results_progress_idx on public.set_results (exercise_definition_id, session_id);
create index subscription_entries_ledger_idx on public.subscription_entries (relationship_id, occurred_at desc, created_at desc);
create index instruction_videos_relationship_idx on public.instruction_videos (relationship_id) where deleted_at is null;
create index student_invitations_relationship_idx on public.student_invitations (relationship_id, created_at desc);
create unique index student_invitations_one_open_idx
on public.student_invitations (relationship_id)
where accepted_at is null and revoked_at is null;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function private.bump_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create function private.validate_assignment_repeat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.repeated_from_assignment_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.assignments source
    where source.id = new.repeated_from_assignment_id
      and source.id <> new.id
      and source.relationship_id = new.relationship_id
      and source.deleted_at is null
  ) then
    raise exception 'Repeated assignment must belong to the same active relationship'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if new.raw_app_meta_data ->> 'reppy_role' is distinct from 'trainer' then
    return new;
  end if;

  v_display_name := btrim(new.raw_user_meta_data ->> 'display_name');

  if v_display_name is null or char_length(v_display_name) not between 2 and 120 then
    raise exception 'Trainer display name must contain between 2 and 120 characters'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, 'trainer', v_display_name);

  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger students_touch_updated_at before update on public.students
for each row execute function private.touch_updated_at();
create trigger relationships_touch_updated_at before update on public.trainer_student_relationships
for each row execute function private.touch_updated_at();
create trigger exercise_definitions_touch_updated_at before update on public.exercise_definitions
for each row execute function private.touch_updated_at();
create trigger assignments_bump_revision before update on public.assignments
for each row execute function private.bump_revision();
create trigger assignments_validate_repeat before insert or update of repeated_from_assignment_id, relationship_id on public.assignments
for each row execute function private.validate_assignment_repeat();
create trigger workout_sessions_bump_revision before update on public.workout_sessions
for each row execute function private.bump_revision();
create trigger set_results_touch_updated_at before update on public.set_results
for each row execute function private.touch_updated_at();
create trigger subscription_entries_bump_revision before update on public.subscription_entries
for each row execute function private.bump_revision();
create trigger instruction_videos_touch_updated_at before update on public.instruction_videos
for each row execute function private.touch_updated_at();
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_auth_user();

create function private.current_user_is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'trainer'
  );
$$;

create function private.can_read_student(p_student_id uuid)
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
        or relationship.trainer_id = (select auth.uid())
      )
  );
$$;

create function private.can_read_relationship(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.trainer_student_relationships relationship
    join public.students student on student.id = relationship.student_id
    where relationship.id = p_relationship_id
      and relationship.status <> 'archived'
      and (
        relationship.trainer_id = (select auth.uid())
        or student.account_id = (select auth.uid())
      )
  );
$$;

create function private.is_relationship_trainer(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.trainer_student_relationships relationship
    where relationship.id = p_relationship_id
      and relationship.status <> 'archived'
      and relationship.trainer_id = (select auth.uid())
  );
$$;

create function private.is_relationship_student(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.trainer_student_relationships relationship
    join public.students student on student.id = relationship.student_id
    where relationship.id = p_relationship_id
      and relationship.status <> 'archived'
      and student.account_id = (select auth.uid())
  );
$$;

create function private.can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments assignment
    where assignment.id = p_assignment_id
      and assignment.deleted_at is null
      and private.can_read_relationship(assignment.relationship_id)
  );
$$;

create function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = p_profile_id or exists (
    select 1
    from public.trainer_student_relationships relationship
    join public.students student on student.id = relationship.student_id
    where relationship.status <> 'archived'
      and (
        (relationship.trainer_id = (select auth.uid()) and student.account_id = p_profile_id)
        or (student.account_id = (select auth.uid()) and relationship.trainer_id = p_profile_id)
      )
  );
$$;

create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
returns null on null input
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when invalid_text_representation then return null;
end;
$$;

create function private.storage_relationship_id(p_object_path text)
returns uuid
language sql
immutable
returns null on null input
set search_path = ''
as $$
  select private.try_uuid(split_part(p_object_path, '/', 1));
$$;

alter table public.instruction_videos
  add constraint instruction_videos_path_matches_relationship
  check (private.storage_relationship_id(object_path) is not distinct from relationship_id);

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
grant select on public.profiles, public.students, public.trainer_student_relationships,
  public.exercise_definitions, public.assignments, public.workout_sessions,
  public.set_results, public.instruction_videos to authenticated;
grant select on public.subscription_entries to authenticated;
grant select (
  id,
  relationship_id,
  target_email,
  expires_at,
  accepted_at,
  accepted_by,
  revoked_at,
  created_at
) on public.student_invitations to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant insert on public.students to authenticated;
grant update (name, phone, height_cm, weight_kg, gender, contraindications) on public.students to authenticated;
grant insert on public.trainer_student_relationships to authenticated;
grant update (color, timezone) on public.trainer_student_relationships to authenticated;
grant insert, delete on public.exercise_definitions to authenticated;
grant update (name, primary_muscle, equipment, measure_type, load_mode, archived_at) on public.exercise_definitions to authenticated;
grant insert, delete on public.assignments to authenticated;
grant update (
  scheduled_for,
  scheduled_time,
  timezone,
  format,
  workout_snapshot,
  repeated_from_assignment_id,
  reschedule_scheduled_for,
  reschedule_scheduled_time,
  reschedule_requested_at
) on public.assignments to authenticated;
grant insert, delete on public.instruction_videos to authenticated;
grant insert on public.subscription_entries to authenticated;
grant update (lesson_delta, occurred_at, amount_rub, payment_method, comment) on public.subscription_entries to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.trainer_student_relationships enable row level security;
alter table public.exercise_definitions enable row level security;
alter table public.assignments enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_results enable row level security;
alter table public.subscription_entries enable row level security;
alter table public.instruction_videos enable row level security;
alter table public.student_invitations enable row level security;

create policy profiles_read_related on public.profiles
for select to authenticated
using (private.can_read_profile(id));

create policy profiles_update_self on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy students_read_related on public.students
for select to authenticated
using (private.can_read_student(id));

create policy students_create_by_trainer on public.students
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and account_id is null
  and private.current_user_is_trainer()
);

create policy students_update_related on public.students
for update to authenticated
using (private.can_read_student(id))
with check (private.can_read_student(id));

create policy relationships_read_members on public.trainer_student_relationships
for select to authenticated
using (private.can_read_relationship(id));

create policy relationships_create_by_trainer on public.trainer_student_relationships
for insert to authenticated
with check (
  trainer_id = (select auth.uid())
  and status = 'invited'
  and private.current_user_is_trainer()
  and exists (
    select 1 from public.students student
    where student.id = trainer_student_relationships.student_id
      and student.created_by = (select auth.uid())
  )
);

create policy relationships_update_by_trainer on public.trainer_student_relationships
for update to authenticated
using (private.is_relationship_trainer(id))
with check (trainer_id = (select auth.uid()));

create policy exercise_definitions_read_available on public.exercise_definitions
for select to authenticated
using (owner_id is null or owner_id = (select auth.uid()));

create policy exercise_definitions_create_own on public.exercise_definitions
for insert to authenticated
with check (owner_id = (select auth.uid()) and private.current_user_is_trainer());

create policy exercise_definitions_update_own on public.exercise_definitions
for update to authenticated
using (owner_id = (select auth.uid()) and private.current_user_is_trainer())
with check (owner_id = (select auth.uid()));

create policy exercise_definitions_delete_own on public.exercise_definitions
for delete to authenticated
using (owner_id = (select auth.uid()) and private.current_user_is_trainer());

create policy assignments_read_members on public.assignments
for select to authenticated
using (deleted_at is null and private.can_read_relationship(relationship_id));

create policy assignments_create_by_trainer on public.assignments
for insert to authenticated
with check (
  status = 'assigned'
  and deleted_at is null
  and private.is_relationship_trainer(relationship_id)
);

create policy assignments_update_by_trainer on public.assignments
for update to authenticated
using (
  status = 'assigned'
  and deleted_at is null
  and private.is_relationship_trainer(relationship_id)
)
with check (
  status = 'assigned'
  and deleted_at is null
  and private.is_relationship_trainer(relationship_id)
);

create policy assignments_delete_by_trainer on public.assignments
for delete to authenticated
using (
  status <> 'completed'
  and private.is_relationship_trainer(relationship_id)
  and not exists (
    select 1 from public.workout_sessions session
    where session.assignment_id = assignments.id
  )
);

create policy workout_sessions_read_members on public.workout_sessions
for select to authenticated
using (deleted_at is null and private.can_read_assignment(assignment_id));

create policy set_results_read_members on public.set_results
for select to authenticated
using (
  exists (
    select 1
    from public.workout_sessions session
    where session.id = set_results.session_id
      and session.deleted_at is null
      and private.can_read_assignment(session.assignment_id)
  )
);

create policy subscription_entries_read_by_trainer on public.subscription_entries
for select to authenticated
using (private.is_relationship_trainer(relationship_id));

create policy subscription_payments_create_by_trainer on public.subscription_entries
for insert to authenticated
with check (kind = 'payment' and private.is_relationship_trainer(relationship_id));

create policy subscription_payments_update_by_trainer on public.subscription_entries
for update to authenticated
using (kind = 'payment' and private.is_relationship_trainer(relationship_id))
with check (kind = 'payment' and private.is_relationship_trainer(relationship_id));

create policy instruction_videos_read_members on public.instruction_videos
for select to authenticated
using (deleted_at is null and private.can_read_relationship(relationship_id));

create policy instruction_videos_create_by_trainer on public.instruction_videos
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.is_relationship_trainer(relationship_id)
);

create policy instruction_videos_delete_by_trainer on public.instruction_videos
for delete to authenticated
using (private.is_relationship_trainer(relationship_id));

create policy student_invitations_read_by_trainer on public.student_invitations
for select to authenticated
using (private.is_relationship_trainer(relationship_id));

create function public.create_student_invitation(
  p_relationship_id uuid,
  p_target_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship public.trainer_student_relationships%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_token text;
  v_target_email text := lower(btrim(p_target_email));
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_student_relationships relationship
  join public.students student on student.id = relationship.student_id
  where relationship.id = p_relationship_id
    and relationship.trainer_id = (select auth.uid())
    and relationship.status = 'invited'
    and student.account_id is null
  for update of relationship, student;

  if not found then
    raise exception 'Invitation can only be created for an unregistered student'
      using errcode = '42501';
  end if;

  if v_target_email is null
    or char_length(v_target_email) not between 3 and 320
    or v_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'A valid student email is required' using errcode = '22023';
  end if;

  update public.student_invitations invitation
  set revoked_at = v_now
  where invitation.relationship_id = v_relationship.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  v_token := replace(
    replace(
      rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
      '+',
      '-'
    ),
    '/',
    '_'
  );

  insert into public.student_invitations (
    relationship_id,
    token_hash,
    target_email,
    expires_at
  )
  values (
    v_relationship.id,
    extensions.digest(v_token, 'sha256'),
    v_target_email,
    v_now + interval '48 hours'
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'invitationId', v_invitation.id,
    'relationshipId', v_invitation.relationship_id,
    'targetEmail', v_invitation.target_email,
    'token', v_token,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

create function public.get_student_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_preview jsonb;
begin
  if p_token is null or char_length(p_token) not between 40 and 128 then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'studentName', student.name,
    'trainerName', trainer.display_name,
    'expiresAt', invitation.expires_at
  )
  into v_preview
  from public.student_invitations invitation
  join public.trainer_student_relationships relationship
    on relationship.id = invitation.relationship_id
  join public.students student on student.id = relationship.student_id
  join public.profiles trainer on trainer.id = relationship.trainer_id
  where invitation.token_hash = extensions.digest(p_token, 'sha256')
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and relationship.status = 'invited'
    and student.account_id is null;

  if not found then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  return v_preview;
end;
$$;

create function public.accept_student_invitation(p_token text)
returns public.trainer_student_relationships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_relationship_id uuid;
  v_relationship public.trainer_student_relationships%rowtype;
  v_student public.students%rowtype;
  v_invitation public.student_invitations%rowtype;
  v_token_hash bytea;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token is null or char_length(p_token) not between 40 and 128 then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  v_token_hash := extensions.digest(p_token, 'sha256');

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = v_user_id;

  select invitation.relationship_id
  into v_relationship_id
  from public.student_invitations invitation
  where invitation.token_hash = v_token_hash;

  if not found then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_student_relationships relationship
  where relationship.id = v_relationship_id
  for update;

  select student.*
  into v_student
  from public.students student
  where student.id = v_relationship.student_id
  for update;

  select invitation.*
  into v_invitation
  from public.student_invitations invitation
  where invitation.token_hash = v_token_hash
    and invitation.relationship_id = v_relationship.id
  for update;

  if not found then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_user_id and v_student.account_id = v_user_id then
      return v_relationship;
    end if;

    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  if v_invitation.revoked_at is not null
    or v_invitation.expires_at <= v_now
    or v_relationship.status <> 'invited'
    or v_student.account_id is not null
    or v_email_confirmed_at is null
    or v_user_email is distinct from v_invitation.target_email
  then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
  ) then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, role, display_name)
  values (v_user_id, 'student', v_student.name);

  update public.students student
  set account_id = v_user_id
  where student.id = v_student.id;

  update public.trainer_student_relationships relationship
  set status = 'active'
  where relationship.id = v_relationship.id
  returning relationship.* into v_relationship;

  update public.student_invitations invitation
  set accepted_at = v_now,
      accepted_by = v_user_id
  where invitation.id = v_invitation.id;

  update public.student_invitations invitation
  set revoked_at = v_now
  where invitation.relationship_id = v_relationship.id
    and invitation.id <> v_invitation.id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  return v_relationship;
end;
$$;

create function public.revoke_student_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relationship_id uuid;
  v_invitation public.student_invitations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select invitation.relationship_id
  into v_relationship_id
  from public.student_invitations invitation
  where invitation.id = p_invitation_id;

  if not found then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  perform 1
  from public.trainer_student_relationships relationship
  where relationship.id = v_relationship_id
  for update;

  if not private.is_relationship_trainer(v_relationship_id) then
    raise exception 'Invitation is not available' using errcode = 'P0002';
  end if;

  select invitation.*
  into v_invitation
  from public.student_invitations invitation
  where invitation.id = p_invitation_id
  for update;

  if v_invitation.accepted_at is not null then
    return false;
  end if;

  update public.student_invitations invitation
  set revoked_at = coalesce(invitation.revoked_at, clock_timestamp())
  where invitation.id = p_invitation_id;

  return true;
end;
$$;

create function public.start_workout_session(p_assignment_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_assignment public.assignments%rowtype;
  v_session public.workout_sessions%rowtype;
  v_recorded_by_role public.app_role;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select assignment.*
  into v_assignment
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and assignment.status = 'assigned'
    and assignment.deleted_at is null
  for update;

  if not found then
    raise exception 'Assignment is not available' using errcode = 'P0002';
  end if;

  if private.is_relationship_trainer(v_assignment.relationship_id) then
    v_recorded_by_role := 'trainer';
  elsif private.is_relationship_student(v_assignment.relationship_id) then
    v_recorded_by_role := 'student';
  else
    raise exception 'Assignment access denied' using errcode = '42501';
  end if;

  insert into public.workout_sessions (
    assignment_id,
    workout_snapshot,
    recorded_by_user_id,
    recorded_by_role
  )
  values (
    v_assignment.id,
    v_assignment.workout_snapshot,
    v_user_id,
    v_recorded_by_role
  )
  on conflict (assignment_id) do nothing;

  select session.*
  into v_session
  from public.workout_sessions session
  where session.assignment_id = v_assignment.id
    and session.deleted_at is null;

  if not found then
    raise exception 'Assignment already has an archived session' using errcode = '23505';
  end if;

  return v_session;
end;
$$;

create function public.save_session_progress(
  p_session_id uuid,
  p_expected_revision bigint,
  p_workout_snapshot jsonb,
  p_results jsonb
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_trainer_id uuid;
  v_exercise_count integer;
  v_expected_result_count integer;
  v_result_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision must be a positive integer' using errcode = '22023';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
    and session.status = 'active'
    and session.deleted_at is null
    and assignment.deleted_at is null
  for update of session, assignment;

  if not found then
    raise exception 'Active workout session not found' using errcode = 'P0002';
  end if;

  select relationship.id, relationship.trainer_id
  into v_relationship_id, v_trainer_id
  from public.assignments assignment
  join public.trainer_student_relationships relationship
    on relationship.id = assignment.relationship_id
  where assignment.id = v_session.assignment_id;

  if not private.can_read_relationship(v_relationship_id) then
    raise exception 'Workout session access denied' using errcode = '42501';
  end if;

  if v_session.revision is distinct from p_expected_revision then
    raise exception 'Session revision conflict' using errcode = '40001';
  end if;

  if jsonb_typeof(p_workout_snapshot) is distinct from 'object' then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  if nullif(btrim(p_workout_snapshot ->> 'name'), '') is null
    or jsonb_typeof(p_workout_snapshot -> 'exercises') is distinct from 'array'
  then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(p_workout_snapshot -> 'exercises') = 0 then
    raise exception 'Workout snapshot is invalid' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_exercise_count
  from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where jsonb_typeof(exercise) is distinct from 'object'
      or private.try_uuid(exercise ->> 'id') is null
      or private.try_uuid(exercise ->> 'exerciseId') is null
      or jsonb_typeof(exercise -> 'plannedSets') is distinct from 'array'
  ) then
    raise exception 'Workout snapshot exercises are invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where jsonb_array_length(exercise -> 'plannedSets') = 0
      or exists (
        select 1
        from jsonb_array_elements(exercise -> 'plannedSets') planned_set
        where jsonb_typeof(planned_set) is distinct from 'object'
      )
  ) then
    raise exception 'Workout snapshot exercises are invalid' using errcode = '22023';
  end if;

  if (
    select count(distinct private.try_uuid(exercise ->> 'id'))::integer
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
  ) <> v_exercise_count then
    raise exception 'Workout exercise instance ids must be unique' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    left join public.exercise_definitions definition
      on definition.id = private.try_uuid(exercise ->> 'exerciseId')
     and (definition.owner_id is null or definition.owner_id = v_trainer_id)
    where definition.id is null
  ) then
    raise exception 'Workout contains an unavailable exercise' using errcode = '22023';
  end if;

  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'Set results must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_results) result
    where jsonb_typeof(result) is distinct from 'object'
  ) then
    raise exception 'Set results are invalid' using errcode = '22023';
  end if;

  select coalesce(sum(jsonb_array_length(exercise -> 'plannedSets')), 0)::integer
  into v_expected_result_count
  from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise;

  select count(*)::integer
  into v_result_count
  from jsonb_to_recordset(p_results) as result(
    "exerciseInstanceId" text,
    "setNumber" integer,
    "actualReps" integer,
    "actualWeight" numeric,
    "completed" boolean
  );

  if v_result_count <> v_expected_result_count then
    raise exception 'Set results must cover every planned set exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_results) as result(
      "exerciseInstanceId" text,
      "setNumber" integer,
      "actualReps" integer,
      "actualWeight" numeric,
      "completed" boolean
    )
    left join lateral (
      select exercise
      from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
      where private.try_uuid(exercise ->> 'id') = private.try_uuid(result."exerciseInstanceId")
    ) snapshot_exercise on true
    where private.try_uuid(result."exerciseInstanceId") is null
      or result."setNumber" is null
      or result."setNumber" < 1
      or result."actualReps" is null
      or result."actualReps" < 0
      or result."actualWeight" is null
      or result."actualWeight" < 0
      or result."completed" is null
      or snapshot_exercise.exercise is null
      or result."setNumber" > jsonb_array_length(snapshot_exercise.exercise -> 'plannedSets')
  ) then
    raise exception 'Set results are invalid' using errcode = '22023';
  end if;

  if (
    select count(distinct (private.try_uuid(result."exerciseInstanceId"), result."setNumber"))::integer
    from jsonb_to_recordset(p_results) as result(
      "exerciseInstanceId" text,
      "setNumber" integer,
      "actualReps" integer,
      "actualWeight" numeric,
      "completed" boolean
    )
  ) <> v_result_count then
    raise exception 'Set results must cover every planned set exactly once' using errcode = '22023';
  end if;

  update public.workout_sessions session
  set workout_snapshot = p_workout_snapshot
  where session.id = p_session_id
  returning session.* into v_session;

  delete from public.set_results result
  where result.session_id = p_session_id;

  insert into public.set_results (
    session_id,
    exercise_definition_id,
    exercise_instance_id,
    set_number,
    actual_reps,
    actual_weight,
    completed
  )
  select
    p_session_id,
    private.try_uuid(snapshot_exercise.exercise ->> 'exerciseId'),
    private.try_uuid(result."exerciseInstanceId"),
    result."setNumber",
    result."actualReps",
    result."actualWeight",
    result."completed"
  from jsonb_to_recordset(p_results) as result(
    "exerciseInstanceId" text,
    "setNumber" integer,
    "actualReps" integer,
    "actualWeight" numeric,
    "completed" boolean
  )
  join lateral (
    select exercise
    from jsonb_array_elements(p_workout_snapshot -> 'exercises') exercise
    where private.try_uuid(exercise ->> 'id') = private.try_uuid(result."exerciseInstanceId")
  ) snapshot_exercise on true;

  return v_session;
end;
$$;

create function public.complete_workout_session(
  p_session_id uuid,
  p_charge_subscription boolean default true
)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_is_trainer boolean;
  v_is_student boolean;
  v_charge_subscription boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
    and session.deleted_at is null
    and assignment.deleted_at is null
  for update of session, assignment;

  if not found then
    raise exception 'Workout session not found' using errcode = 'P0002';
  end if;

  select assignment.relationship_id
  into v_relationship_id
  from public.assignments assignment
  where assignment.id = v_session.assignment_id;

  v_is_trainer := private.is_relationship_trainer(v_relationship_id);
  v_is_student := private.is_relationship_student(v_relationship_id);
  if not v_is_trainer and not v_is_student then
    raise exception 'Workout session access denied' using errcode = '42501';
  end if;

  if v_session.status = 'completed' then
    return v_session;
  end if;

  v_charge_subscription := case
    when v_is_student then true
    else p_charge_subscription
  end;

  update public.workout_sessions session
  set status = 'completed',
      completed_at = clock_timestamp(),
      completed_by_user_id = v_user_id,
      charge_status = case
        when v_charge_subscription then 'charged'::public.session_charge_status
        else 'waived'::public.session_charge_status
      end
  where session.id = p_session_id
  returning session.* into v_session;

  update public.assignments assignment
  set status = 'completed'
  where assignment.id = v_session.assignment_id;

  if v_charge_subscription then
    insert into public.subscription_entries (
      relationship_id,
      kind,
      lesson_delta,
      occurred_at,
      session_id,
      workout_name
    )
    values (
      v_relationship_id,
      'session-charge',
      -1,
      v_session.completed_at,
      v_session.id,
      coalesce(v_session.workout_snapshot ->> 'name', 'Тренировка')
    )
    on conflict (session_id, kind) do nothing;
  end if;

  return v_session;
end;
$$;

create function public.archive_workout_session(p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_relationship_id uuid;
  v_archived_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.workout_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where session.id = p_session_id
  for update of session, assignment;

  if not found then
    raise exception 'Workout session not found' using errcode = 'P0002';
  end if;

  select assignment.relationship_id
  into v_relationship_id
  from public.assignments assignment
  where assignment.id = v_session.assignment_id;

  if not private.is_relationship_trainer(v_relationship_id) then
    raise exception 'Only the trainer can archive a workout session' using errcode = '42501';
  end if;

  if v_session.deleted_at is not null then
    return v_session;
  end if;

  if exists (
    select 1
    from public.subscription_entries entry
    where entry.session_id = v_session.id
      and entry.kind = 'session-charge'
  ) then
    insert into public.subscription_entries (
      relationship_id,
      kind,
      lesson_delta,
      occurred_at,
      session_id,
      workout_name
    )
    values (
      v_relationship_id,
      'session-refund',
      1,
      v_archived_at,
      v_session.id,
      coalesce(v_session.workout_snapshot ->> 'name', 'Тренировка')
    )
    on conflict (session_id, kind) do nothing;
  end if;

  update public.workout_sessions session
  set deleted_at = v_archived_at
  where session.id = p_session_id
  returning session.* into v_session;

  update public.assignments assignment
  set deleted_at = v_archived_at
  where assignment.id = v_session.assignment_id;

  return v_session;
end;
$$;

create function public.get_subscription_summary(p_relationship_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_recent_payments jsonb;
begin
  if not private.can_read_relationship(p_relationship_id) then
    raise exception 'Subscription access denied' using errcode = '42501';
  end if;

  select coalesce(sum(entry.lesson_delta), 0)::integer
  into v_balance
  from public.subscription_entries entry
  where entry.relationship_id = p_relationship_id;

  select coalesce(jsonb_agg(to_jsonb(payment) order by payment.occurred_at desc, payment.created_at desc), '[]'::jsonb)
  into v_recent_payments
  from (
    select
      entry.id,
      entry.lesson_delta,
      entry.occurred_at,
      entry.amount_rub,
      entry.payment_method,
      entry.comment,
      entry.created_at,
      entry.updated_at
    from public.subscription_entries entry
    where entry.relationship_id = p_relationship_id
      and entry.kind = 'payment'
    order by entry.occurred_at desc, entry.created_at desc
    limit 3
  ) payment;

  return jsonb_build_object(
    'relationshipId', p_relationship_id,
    'balance', v_balance,
    'recentPayments', v_recent_payments
  );
end;
$$;

revoke all on function public.create_student_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.get_student_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.accept_student_invitation(text) from public, anon, authenticated;
revoke all on function public.revoke_student_invitation(uuid) from public, anon, authenticated;
revoke all on function public.start_workout_session(uuid) from public, anon;
revoke all on function public.save_session_progress(uuid, bigint, jsonb, jsonb) from public, anon;
revoke all on function public.complete_workout_session(uuid, boolean) from public, anon;
revoke all on function public.archive_workout_session(uuid) from public, anon;
revoke all on function public.get_subscription_summary(uuid) from public, anon;
grant execute on function public.create_student_invitation(uuid, text) to authenticated;
grant execute on function public.get_student_invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_student_invitation(text) to authenticated;
grant execute on function public.revoke_student_invitation(uuid) to authenticated;
grant execute on function public.start_workout_session(uuid) to authenticated;
grant execute on function public.save_session_progress(uuid, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.complete_workout_session(uuid, boolean) to authenticated;
grant execute on function public.archive_workout_session(uuid) to authenticated;
grant execute on function public.get_subscription_summary(uuid) to authenticated;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
revoke all on function private.handle_new_auth_user() from authenticated;
grant execute on function private.current_user_is_trainer() to authenticated;
grant execute on function private.can_read_student(uuid) to authenticated;
grant execute on function private.can_read_relationship(uuid) to authenticated;
grant execute on function private.is_relationship_trainer(uuid) to authenticated;
grant execute on function private.is_relationship_student(uuid) to authenticated;
grant execute on function private.can_read_assignment(uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;
grant execute on function private.storage_relationship_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instruction-videos', 'instruction-videos', false, 104857600, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy instruction_videos_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'instruction-videos'
  and private.can_read_relationship(private.storage_relationship_id(name))
);

create policy instruction_videos_storage_create on storage.objects
for insert to authenticated
with check (
  bucket_id = 'instruction-videos'
  and private.is_relationship_trainer(private.storage_relationship_id(name))
);

create policy instruction_videos_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'instruction-videos'
  and private.is_relationship_trainer(private.storage_relationship_id(name))
)
with check (
  bucket_id = 'instruction-videos'
  and private.is_relationship_trainer(private.storage_relationship_id(name))
);

create policy instruction_videos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'instruction-videos'
  and private.is_relationship_trainer(private.storage_relationship_id(name))
);

insert into public.exercise_definitions (id, slug, name, primary_muscle, equipment, measure_type, load_mode)
values
  ('00000000-0000-4000-8000-000000000001', 'bench-press', 'Жим лёжа', 'Грудь', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000002', 'incline-dumbbell', 'Жим гантелей на наклонной скамье', 'Грудь', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000003', 'push-ups', 'Отжимания', 'Грудь', 'Свой вес', 'reps', 'bodyweight'),
  ('00000000-0000-4000-8000-000000000004', 'cable-fly', 'Сведение рук в кроссовере', 'Грудь', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000005', 'pull-ups', 'Подтягивания', 'Спина', 'Свой вес', 'reps', 'bodyweight'),
  ('00000000-0000-4000-8000-000000000006', 'lat-pulldown', 'Тяга верхнего блока', 'Спина', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000007', 'barbell-row', 'Тяга штанги в наклоне', 'Спина', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000008', 'seated-row', 'Тяга горизонтального блока', 'Спина', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000009', 'deadlift', 'Становая тяга', 'Спина', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000010', 'overhead-press', 'Жим над головой', 'Плечи', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000011', 'lateral-raise', 'Разведение гантелей в стороны', 'Плечи', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000012', 'rear-delt-fly', 'Разведение на заднюю дельту', 'Плечи', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000013', 'dumbbell-curl', 'Сгибание рук с гантелями', 'Бицепс', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000014', 'hammer-curl', 'Молотковые сгибания', 'Бицепс', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000015', 'triceps-pushdown', 'Разгибание рук на блоке', 'Трицепс', 'Блок', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000016', 'overhead-triceps', 'Разгибание рук из-за головы', 'Трицепс', 'Гантель', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000017', 'dips', 'Отжимания на брусьях', 'Трицепс', 'Свой вес', 'reps', 'bodyweight'),
  ('00000000-0000-4000-8000-000000000018', 'squat', 'Приседания', 'Квадрицепс', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000019', 'leg-press', 'Жим ногами', 'Квадрицепс', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000020', 'leg-extension', 'Разгибание ног', 'Квадрицепс', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000021', 'hip-thrust', 'Ягодичный мост', 'Ягодицы', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000022', 'bulgarian-squat', 'Болгарские выпады', 'Ягодицы', 'Гантели', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000023', 'romanian-deadlift', 'Румынская тяга', 'Задняя поверхность бедра', 'Штанга', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000024', 'leg-curl', 'Сгибание ног', 'Задняя поверхность бедра', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000025', 'calf-raise', 'Подъёмы на носки', 'Икры', 'Тренажёр', 'reps', 'external'),
  ('00000000-0000-4000-8000-000000000026', 'plank', 'Планка', 'Кор', 'Свой вес', 'duration', 'bodyweight'),
  ('00000000-0000-4000-8000-000000000027', 'crunch', 'Скручивания', 'Кор', 'Свой вес', 'reps', 'bodyweight'),
  ('00000000-0000-4000-8000-000000000028', 'dead-bug', 'Мёртвый жук', 'Кор', 'Свой вес', 'reps', 'bodyweight');
