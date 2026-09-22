import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REPPY_TRAINER_INVITE_EMAIL',
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  throw new Error(`Заполните ${missing.join(', ')} в .env.admin.local.`);
}

const targetEmail = process.env.REPPY_TRAINER_INVITE_EMAIL.trim().toLowerCase();
const appUrl = (process.env.REPPY_APP_URL ?? 'https://temarmz.github.io/REPPY/').trim().replace(/#.*$/, '').replace(/\/?$/, '/');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await supabase.rpc('issue_trainer_registration_invitation', {
  p_target_email: targetEmail,
});
if (error) throw error;

const code = data?.code;
if (typeof code !== 'string') throw new Error('Сервер не вернул код регистрации тренера.');

console.log(`Приглашение для ${targetEmail} действует до ${data.expiresAt}.`);
console.log(`${appUrl}#/trainer/register/${code}`);
