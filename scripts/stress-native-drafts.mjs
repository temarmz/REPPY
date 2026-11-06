import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (process.platform !== 'darwin') throw new Error('This native probe requires macOS and Xcode.');
const binary = join(tmpdir(), 'reppy-native-draft-chaos');
execFileSync('swiftc', ['-parse-as-library', '-module-cache-path', join(tmpdir(), 'reppy-swift-module-cache'),
  ...readdirSync('ios/REPPY/Core').filter(name => name.endsWith('.swift')).map(name => `ios/REPPY/Core/${name}`),
  'ios/REPPY/Data/SessionKeychain.swift', 'ios/REPPY/Data/SupabaseAPI.swift', 'ios/REPPY/Data/AppSnapshotLoader.swift',
  'tests/stress/native-preview.swift', '-o', binary], { stdio: 'inherit' });
execFileSync(binary, ['--draft-chaos'], { stdio: 'inherit' });
