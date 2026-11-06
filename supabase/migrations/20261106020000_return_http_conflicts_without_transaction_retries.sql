-- 40001 is reserved for real transaction serialization failures. PostgREST 14
-- retries it indefinitely, so business-level CAS conflicts must use HTTP 409.
-- Keep each function's definition, owner and grants; only the explicit raise
-- statements change. See Supabase's SQLSTATE 40001 RPC retry troubleshooting.
do $migration$
declare
  target regprocedure;
  definition text;
begin
  foreach target in array array[
    'public.save_session_progress(uuid,bigint,jsonb,jsonb)'::regprocedure,
    'public.save_trainer_note(date,text,integer,uuid)'::regprocedure,
    'public.delete_subscription_payment(uuid,bigint)'::regprocedure,
    'public.delete_pending_student(uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if position('errcode = ''40001''' in definition) = 0 then
      raise exception 'Expected explicit revision conflict in %', target;
    end if;
    execute replace(definition, 'errcode = ''40001''', 'errcode = ''PT409''');
  end loop;
end;
$migration$;
