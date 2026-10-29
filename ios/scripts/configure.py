#!/usr/bin/env python3
"""Copy only web's public Supabase config into the ignored iOS local config."""
import base64
import json
from pathlib import Path
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[2]
source = root / '.env.local'
target = root / 'ios/Config/Local.xcconfig'
if target.exists():
    raise SystemExit('Local.xcconfig already exists; edit it directly to preserve signing settings.')
if not source.exists():
    raise SystemExit('No .env.local. Copy Config/Local.example.xcconfig and fill the public values.')
values = {}
for line in source.read_text().splitlines():
    key, separator, value = line.partition('=')
    if separator and key.strip() in ('VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'):
        values[key.strip()] = value.strip().strip('"\'')
url = values.get('VITE_SUPABASE_URL', '')
key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY', '')
if urlparse(url).scheme != 'https' or not urlparse(url).hostname or not key:
    raise SystemExit('Missing HTTPS Supabase URL or public key in .env.local.')
if key.startswith('sb_secret_'):
    raise SystemExit('Refusing a secret Supabase key.')
if key.startswith('eyJ'):
    try:
        segment = key.split('.')[1]
        payload = json.loads(base64.urlsafe_b64decode(segment + '=' * (-len(segment) % 4)))
        if payload.get('role') != 'anon':
            raise ValueError('Not an anon key')
    except (ValueError, IndexError, json.JSONDecodeError):
        raise SystemExit('Refusing a JWT key without the anon role.')
elif not key.startswith('sb_publishable_'):
    raise SystemExit('Expected a public publishable key or legacy anon JWT.')
if any(character in key + url for character in ('\n', '\r', '"', ';')):
    raise SystemExit('Unexpected characters in public configuration.')
target.write_text('// Local public Supabase configuration. Ignored by Git.\nSUPABASE_URL = ' + url.replace('://', ':/$()/') + '\nSUPABASE_PUBLISHABLE_KEY = ' + key + '\n')
target.chmod(0o600)
print('Created ios/Config/Local.xcconfig using only the two public web values.')
