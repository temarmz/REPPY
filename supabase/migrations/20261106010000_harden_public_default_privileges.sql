-- Hosted Supabase also has per-schema defaults. Revoking only the global
-- defaults leaves these additional public-schema grants in place.
-- Existing tables/functions and their explicit API grants are unchanged.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
