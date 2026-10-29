#!/usr/bin/env python3
"""Run portable tests on both the legacy Intel toolchain and a current Mac."""
import os
import platform
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if platform.system() != 'Darwin':
    raise SystemExit('Run this command on macOS; the portable target uses Apple Foundation.')
architecture = platform.machine()
if architecture not in ('x86_64', 'arm64'):
    raise SystemExit('Unsupported Mac architecture: ' + architecture)
sdk = subprocess.check_output(['xcrun', '--sdk', 'macosx', '--show-sdk-path'], text=True).strip()
build = root / '.build'
modules = build / 'module-cache'
modules.mkdir(parents=True, exist_ok=True)
environment = os.environ.copy()
environment['SWIFTPM_MODULECACHE_OVERRIDE'] = str(modules)
environment['CLANG_MODULE_CACHE_PATH'] = str(modules)
environment['SWIFT_MODULECACHE_PATH'] = str(modules)
command = ['swift', 'test', '--package-path', str(root), '--build-path', str(build),
           '--cache-path', str(build / 'swiftpm-cache'), '--manifest-cache', 'local',
           '--triple', architecture + '-apple-macosx11.0', '--sdk', sdk,
           '-Xswiftc', '-module-cache-path', '-Xswiftc', str(modules)]
print('Testing ReppyCore on ' + architecture + ' with ' + Path(sdk).name, flush=True)
raise SystemExit(subprocess.call(command + sys.argv[1:], env=environment))
