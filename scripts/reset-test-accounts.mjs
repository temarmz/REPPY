import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REPPY_TEST_ACCOUNT_EMAILS'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Заполните ${missing.join(', ')} в .env.admin.local.`);

const emails = [...new Set(process.env.REPPY_TEST_ACCOUNT_EMAILS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))];
if (!emails.length) throw new Error('REPPY_TEST_ACCOUNT_EMAILS должен содержать хотя бы один email.');
const execute = process.argv.includes('--execute');
const includeTelegramAccounts = process.argv.includes('--include-telegram');
if (execute && process.env.REPPY_CONFIRM_TEST_RESET !== 'DELETE') {
  throw new Error('Для удаления явно установите REPPY_CONFIRM_TEST_RESET=DELETE в .env.admin.local.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const fail = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const ids = (rows) => rows.map((row) => row.id);
const del = async (table, column, values) => {
  if (!values.length) return;
  fail(await supabase.from(table).delete().in(column, values), `Удаление ${table}`);
};

const users = fail(await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'Чтение Auth-пользователей').users
  .filter((user) => {
    const email = user.email?.toLowerCase() ?? '';
    return emails.includes(email)
      || (includeTelegramAccounts && /^telegram-\d+@users\.reppy\.invalid$/.test(email));
  });
const profileIds = users.map((user) => user.id);
const students = profileIds.length
  ? fail(await supabase.from('students').select('id').or(`account_id.in.(${profileIds.join(',')}),created_by.in.(${profileIds.join(',')})`), 'Чтение учеников')
  : [];
const studentIds = ids(students);
const relationships = profileIds.length || studentIds.length
  ? fail(await supabase.from('trainer_student_relationships').select('id').or([
    profileIds.length ? `trainer_id.in.(${profileIds.join(',')})` : '',
    studentIds.length ? `student_id.in.(${studentIds.join(',')})` : '',
  ].filter(Boolean).join(',')), 'Чтение связей')
  : [];
const relationshipIds = ids(relationships);
const assignments = relationshipIds.length
  ? fail(await supabase.from('assignments').select('id').in('relationship_id', relationshipIds), 'Чтение назначений')
  : [];
const assignmentIds = ids(assignments);
const sessions = assignmentIds.length
  ? fail(await supabase.from('workout_sessions').select('id').in('assignment_id', assignmentIds), 'Чтение сессий')
  : [];
const sessionIds = ids(sessions);
const videos = relationshipIds.length
  ? fail(await supabase.from('instruction_videos').select('id, object_path').in('relationship_id', relationshipIds), 'Чтение видео')
  : [];

console.log(JSON.stringify({ emails, includeTelegramAccounts, authUsers: users.length, profiles: profileIds.length, students: studentIds.length, relationships: relationshipIds.length, assignments: assignmentIds.length, sessions: sessionIds.length, videos: videos.length }, null, 2));
if (!execute) {
  console.log('Это только предпросмотр. Для удаления запустите npm run test-accounts:delete.');
  process.exit(0);
}

for (const video of videos) fail(await supabase.storage.from('instruction-videos').remove([video.object_path]), `Удаление видео ${video.object_path}`);
await del('telegram_notification_outbox', 'recipient_profile_id', profileIds);
await del('telegram_notification_outbox', 'actor_profile_id', profileIds);
await del('subscription_entries', 'relationship_id', relationshipIds);
await del('workout_sessions', 'id', sessionIds);
await del('instruction_videos', 'id', ids(videos));
await del('assignments', 'id', assignmentIds);
await del('trainer_student_relationships', 'id', relationshipIds);
await del('students', 'id', studentIds);
await del('profiles', 'id', profileIds);
for (const user of users) fail(await supabase.auth.admin.deleteUser(user.id), `Удаление Auth-пользователя ${user.email}`);
console.log('Тестовые аккаунты и связанные данные удалены. Telegram-привязки освобождены.');
