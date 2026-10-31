#!/usr/bin/env python3
"""Run the web demo in real Simulator Safari through an isolated XCUITest host."""
import argparse
import pathlib
import shutil
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True, help='Booted iPhone Simulator UUID')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
workspace = root / 'work' / 'safari-e2e'
for folder in ['scripts', 'REPPY/Resources', 'REPPYUITests', 'REPPYTests', 'Config']:
    (workspace / folder).mkdir(parents=True, exist_ok=True)
shutil.copy(root / 'ios/scripts/generate-project.py', workspace / 'scripts/generate-project.py')
shutil.copy(root / 'tests/simulator/SafariTests.swift', workspace / 'REPPYUITests/SafariTests.swift')
for name in ['PrivacyInfo.xcprivacy', 'DemoData.json', 'Info.plist']:
    shutil.copy(root / 'ios/REPPY/Resources' / name, workspace / 'REPPY/Resources' / name)
shutil.copytree(root / 'ios/REPPY/Resources/Assets.xcassets', workspace / 'REPPY/Resources/Assets.xcassets', dirs_exist_ok=True)
(workspace / 'REPPY/App.swift').write_text('import SwiftUI\n@main struct TestHost: App { var body: some Scene { WindowGroup { Text("Safari E2E runner") } } }\n')
(workspace / 'Config/App.xcconfig').write_text('PRODUCT_BUNDLE_IDENTIFIER = app.reppy.safaricheck\nCODE_SIGNING_ALLOWED = NO\n')
subprocess.run(['python3', str(workspace / 'scripts/generate-project.py')], check=True)
project = workspace / 'REPPY.xcodeproj/project.pbxproj'
project.write_text(project.read_text().replace('"GENERATE_INFOPLIST_FILE" = "NO";', '"GENERATE_INFOPLIST_FILE" = "YES";'))
result = root / 'work' / f'safari-{int(time.time())}.xcresult'
subprocess.run(['xcodebuild', 'test', '-project', str(workspace / 'REPPY.xcodeproj'), '-scheme', 'REPPY', '-destination', f'platform=iOS Simulator,id={args.device}', '-derivedDataPath', str(workspace / 'build'), '-resultBundlePath', str(result), '-only-testing:REPPYUITests', 'CODE_SIGNING_ALLOWED=NO', 'ONLY_ACTIVE_ARCH=YES'], check=True)
print(result)
