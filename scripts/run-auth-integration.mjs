import { spawnSync } from 'node:child_process';

const requiredEnvironment = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const hasExplicitEnvironment = requiredEnvironment.every((name) => process.env[name]?.trim());
const environment = { ...process.env };

function isLocalSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'host.docker.internal';
  } catch {
    return false;
  }
}

if (!hasExplicitEnvironment) {
  const status = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    env: process.env,
  });

  if (status.status !== 0) {
    const detail = status.stderr.trim() || 'Локальный Supabase недоступен.';
    throw new Error(`${detail}\nСначала запустите npm run supabase:start.`);
  }

  for (const line of status.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/);
    if (match) environment[match[1]] = match[2] ?? match[3] ?? '';
  }

  environment.SUPABASE_URL = environment.API_URL;
  environment.SUPABASE_ANON_KEY = environment.ANON_KEY ?? environment.PUBLISHABLE_KEY;
  environment.SUPABASE_SERVICE_ROLE_KEY = environment.SERVICE_ROLE_KEY ?? environment.SECRET_KEY;
}

const missing = requiredEnvironment.filter((name) => !environment[name]?.trim());
if (missing.length) {
  throw new Error(`Не удалось получить ${missing.join(', ')} из локального Supabase.`);
}

if (hasExplicitEnvironment && !isLocalSupabaseUrl(environment.SUPABASE_URL)) {
  const expectedUrl = environment.REPPY_PREVIEW_SUPABASE_URL?.replace(/\/$/, '');
  const actualUrl = environment.SUPABASE_URL.replace(/\/$/, '');
  if (environment.REPPY_INTEGRATION_TARGET !== 'preview' || !expectedUrl || actualUrl !== expectedUrl) {
    throw new Error([
      'Hosted integration tests are disabled for this project.',
      'To run them against the isolated preview project, set REPPY_INTEGRATION_TARGET=preview',
      'and REPPY_PREVIEW_SUPABASE_URL to the same exact URL as SUPABASE_URL.',
      'Never use the production Supabase URL for these tests.',
    ].join('\n'));
  }
}

const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'tests/integration/two-account-auth.test.mjs'], {
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
