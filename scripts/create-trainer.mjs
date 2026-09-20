import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REPPY_TRAINER_EMAIL',
  'REPPY_TRAINER_NAME',
  'REPPY_TRAINER_PASSWORD',
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  throw new Error(`Заполните ${missing.join(', ')} в .env.admin.local.`);
}

const displayName = process.env.REPPY_TRAINER_NAME.trim();
const password = process.env.REPPY_TRAINER_PASSWORD;
if (displayName.length < 2 || displayName.length > 120) {
  throw new Error('REPPY_TRAINER_NAME должен содержать от 2 до 120 символов.');
}
if (password.length < 8) {
  throw new Error('REPPY_TRAINER_PASSWORD должен содержать не меньше 8 символов.');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase.auth.admin.createUser({
  email: process.env.REPPY_TRAINER_EMAIL.trim().toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { display_name: displayName },
  app_metadata: { reppy_role: 'trainer' },
});

if (error) throw error;

console.log(`Тренер создан: ${data.user.email} (${data.user.id})`);
