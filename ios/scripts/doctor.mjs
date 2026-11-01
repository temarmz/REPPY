import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'ios/DerivedData/Build/Products/Debug-iphonesimulator/REPPY.app');
function setting(file, name) {
  if (!existsSync(file)) return null;
  const match = readFileSync(file, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'));
  return match?.[1].replace(/^(["'])(.*)\1$/, '$2').replaceAll('$()', '') ?? null;
}
function backendURL(raw, source) {
  if (!raw || /\s/.test(raw) || raw.includes('$(')) throw new Error(`${source}: адрес Supabase отсутствует или содержит пробелы/неподставленные переменные.`);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !/^[a-z0-9.-]+$/i.test(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error(`${source}: нужен HTTPS-адрес проекта без пути, параметров и учётных данных.`);
  }
  return url.origin;
}

try {
  const plist = spawnSync('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')], { encoding: 'utf8' });
  if (plist.status !== 0) throw new Error('Не найдена собранная iOS-конфигурация. Сначала собери REPPY для Simulator в ios/DerivedData.');
  const info = JSON.parse(plist.stdout);
  const url = backendURL(info.SUPABASE_URL, 'Сборка iOS');
  const key = info.SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || /\s/.test(key) || key.includes('$(') || !key) throw new Error('В сборке не настроен публичный ключ Supabase.');
  if (!key.startsWith('sb_publishable_')) {
    const payload = key.split('.')[1];
    let role;
    try { role = payload && JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role; } catch { /* Never echo a malformed key. */ }
    if (role !== 'anon') throw new Error('В клиенте допускается только publishable или anon ключ.');
  } else if (key === 'sb_publishable_') throw new Error('Публичный ключ пуст.');
  for (const [file, prefix] of [['.env.local', 'VITE_'], ['ios/Config/Local.xcconfig', '']]) {
    const source = path.join(root, file);
    const configuredURL = setting(source, `${prefix}SUPABASE_URL`);
    if (configuredURL !== null && backendURL(configuredURL, file) !== url) throw new Error(`${file}: проект отличается от собранного iOS-приложения.`);
    const configuredKey = setting(source, `${prefix}SUPABASE_PUBLISHABLE_KEY`);
    if (configuredKey !== null && configuredKey !== key) throw new Error(`${file}: публичный ключ отличается от сборки iOS.`);
  }
  console.log(`Конфигурация: ${new URL(url).hostname}; локальные настройки согласованы. Ключи не выводятся.`);
  const signature = spawnSync('codesign', ['-dv', app], { encoding: 'utf8' });
  if (signature.status !== 0 || signature.stderr.includes('Info.plist=not bound') || signature.stderr.includes('Sealed Resources=none')) {
    throw new Error('Сборка не подписана как приложение. Для реального Keychain собери Simulator с CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-.');
  }
  const verification = spawnSync('codesign', ['--verify', '--strict', '--deep', app], { encoding: 'utf8' });
  if (verification.status !== 0) throw new Error('Проверка подписи приложения не прошла. Пересобери перед проверкой входа.');
  console.log('Подпись Simulator: корректная; проверка самого Keychain входит в NativeAccountTests.');
  if (!process.argv.includes('--offline')) {
    const response = await fetch(`${url}/functions/v1/telegram-auth`, {
      method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'config' }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`telegram-auth/config: HTTP ${response.status}.`);
    const config = await response.json();
    if (!config.clientId || !config.redirectFlowConfigured || config.nativeRedirectConfigured !== true) throw new Error('Серверная конфигурация Telegram-входа для iOS не завершена.');
    console.log('telegram-auth/config: HTTP 200; вебовый и нативный redirect настроены.');
  }
  console.log('Эта проверка не выполняет вход, не проверяет BotFather и не изменяет данные аккаунтов.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
