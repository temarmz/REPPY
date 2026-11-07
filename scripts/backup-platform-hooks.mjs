// Supabase's default dump excludes custom DDL attached to managed schemas.
// Export only the app-owned trigger and policies, never platform tables/functions.
export function extractPlatformHooks(sql) {
  const trigger = sql.match(/CREATE (?:OR REPLACE )?TRIGGER "on_auth_user_created"[^;]+;/g) ?? [];
  const policies = sql.match(/CREATE POLICY "instruction_videos_storage_(?:read|create|update|delete)"[^;]+;/g) ?? [];
  if (trigger.length !== 1 || policies.length !== 4) throw new Error('Expected REPPY Auth trigger and four Storage policies');
  return '-- App-owned hooks on managed Supabase schemas; apply after schema.sql.\n' + [...trigger, ...policies].join('\n\n') + '\n';
}
