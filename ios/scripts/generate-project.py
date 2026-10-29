#!/usr/bin/env python3
"""Generate a deterministic Xcode project with Python's standard library."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
objects = {}
def identity(key):
    return hashlib.sha1(key.encode()).hexdigest()[:24].upper()
def quote(value):
    return json.dumps(str(value), ensure_ascii=False)
def add(key, isa, **fields):
    identifier = identity(key)
    objects[identifier] = {'isa': isa, **fields}
    return identifier
def reference(path, kind):
    return add('file:' + path, 'PBXFileReference', lastKnownFileType=kind, path=path, sourceTree='<group>')
def build_files(paths):
    return [add('build:' + path, 'PBXBuildFile', fileRef=reference(path, 'sourcecode.swift')) for path in paths]

app_sources = sorted(str(path.relative_to(root)) for path in (root / 'REPPY').rglob('*.swift'))
unit_sources = sorted(str(path.relative_to(root)) for path in (root / 'REPPYTests').rglob('*.swift'))
ui_sources = sorted(str(path.relative_to(root)) for path in (root / 'REPPYUITests').rglob('*.swift'))
resources = [reference('REPPY/Resources/Assets.xcassets', 'folder.assetcatalog'), reference('REPPY/Resources/DemoData.json', 'text.json'), reference('REPPY/Resources/PrivacyInfo.xcprivacy', 'text.xml')]
unit_resources = [reference(str(path.relative_to(root)), 'text.json') for path in sorted((root / 'REPPYTests/Fixtures').glob('*.json'))]
config = reference('Config/App.xcconfig', 'text.xcconfig')
reference('REPPY/Resources/Info.plist', 'text.plist.xml')
products = []
targets = []
for name, sources, kind in [('REPPY', app_sources, 'application'), ('REPPYTests', unit_sources, 'bundle.unit-test'), ('REPPYUITests', ui_sources, 'bundle.ui-testing')]:
    product = add('product:' + name, 'PBXFileReference', explicitFileType='wrapper.application' if kind == 'application' else 'wrapper.cfbundle', includeInIndex=0,
                  path=name + ('.app' if kind == 'application' else '.xctest'), sourceTree='BUILT_PRODUCTS_DIR')
    products.append(product)
    sources_phase = add('sources:' + name, 'PBXSourcesBuildPhase', buildActionMask=2147483647, files=build_files(sources), runOnlyForDeploymentPostprocessing=0)
    framework_phase = add('frameworks:' + name, 'PBXFrameworksBuildPhase', buildActionMask=2147483647, files=[], runOnlyForDeploymentPostprocessing=0)
    target_resources = resources if name == 'REPPY' else unit_resources if name == 'REPPYTests' else []
    resource_phase = add('resources:' + name, 'PBXResourcesBuildPhase', buildActionMask=2147483647,
                         files=[add('resource:' + name + ':' + item, 'PBXBuildFile', fileRef=item) for item in target_resources], runOnlyForDeploymentPostprocessing=0)
    configurations = []
    for configuration in ['Debug', 'Release']:
        settings = {'PRODUCT_NAME': '$(TARGET_NAME)', 'SDKROOT': 'iphoneos', 'IPHONEOS_DEPLOYMENT_TARGET': '18.0',
                    'TARGETED_DEVICE_FAMILY': '1', 'SWIFT_VERSION': '5.0', 'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if configuration == 'Debug' else '-O',
                    'ENABLE_TESTABILITY': 'YES' if configuration == 'Debug' else 'NO', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS': 'DEBUG' if configuration == 'Debug' else '',
                    'ASSETCATALOG_COMPILER_APPICON_NAME': 'AppIcon' if name == 'REPPY' else '', 'GENERATE_INFOPLIST_FILE': 'NO' if name == 'REPPY' else 'YES'}
        if name == 'REPPY':
            settings['INFOPLIST_FILE'] = 'REPPY/Resources/Info.plist'
            settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks']
        else:
            settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'app.reppy.' + name.lower()
            if name == 'REPPYTests':
                settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/REPPY.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/REPPY'
                settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
            else:
                settings['TEST_TARGET_NAME'] = 'REPPY'
        configurations.append(add('config:' + name + configuration, 'XCBuildConfiguration', baseConfigurationReference=config, buildSettings=settings, name=configuration))
    config_list = add('configs:' + name, 'XCConfigurationList', buildConfigurations=configurations, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')
    dependencies = []
    if name != 'REPPY':
        proxy = add('proxy:' + name, 'PBXContainerItemProxy', containerPortal=identity('project'), proxyType=1, remoteGlobalIDString=identity('target:REPPY'), remoteInfo='REPPY')
        dependencies = [add('dependency:' + name, 'PBXTargetDependency', target=identity('target:REPPY'), targetProxy=proxy)]
    targets.append(add('target:' + name, 'PBXNativeTarget', buildConfigurationList=config_list, buildPhases=[sources_phase, framework_phase, resource_phase], buildRules=[], dependencies=dependencies,
                       name=name, productName=name, productReference=product, productType='com.apple.product-type.' + kind))

product_group = add('products', 'PBXGroup', children=products, name='Products', sourceTree='<group>')
files = [identifier for identifier, value in objects.items() if value['isa'] == 'PBXFileReference' and identifier not in products]
group = add('main', 'PBXGroup', children=files + [product_group], sourceTree='<group>')
project_configs = [add('projectconfig:' + name, 'XCBuildConfiguration', buildSettings={'CLANG_ENABLE_MODULES': 'YES', 'CLANG_ENABLE_OBJC_ARC': 'YES', 'SDKROOT': 'iphoneos'}, name=name) for name in ['Debug', 'Release']]
project_config_list = add('projectconfigs', 'XCConfigurationList', buildConfigurations=project_configs, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')
project = add('project', 'PBXProject', attributes={'LastUpgradeCheck': '1600', 'BuildIndependentTargetsInParallel': 'YES'}, buildConfigurationList=project_config_list,
              compatibilityVersion='Xcode 14.0', developmentRegion='ru', hasScannedForEncodings=0, knownRegions=['ru', 'en', 'Base'], mainGroup=group, productRefGroup=product_group, projectDirPath='', projectRoot='', targets=targets)

def serialize(value, indent=0):
    if isinstance(value, dict):
        return '{\n' + ''.join('\t' * (indent + 1) + quote(key) + ' = ' + serialize(item, indent + 1) + ';\n' for key, item in value.items()) + '\t' * indent + '}'
    if isinstance(value, list):
        return '(' + ', '.join(serialize(item, indent) for item in value) + (',' if value else '') + ')'
    if isinstance(value, int):
        return str(value)
    return quote(value)

content = '// !$*UTF8*$!\n' + serialize({'archiveVersion': 1, 'classes': {}, 'objectVersion': 56, 'objects': objects, 'rootObject': project}) + '\n'
scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identity('target:REPPY')}" BuildableName="REPPY.app" BlueprintName="REPPY" ReferencedContainer="container:REPPY.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables>'''
for name in ['REPPYTests', 'REPPYUITests']:
    scheme += f'<TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identity("target:" + name)}" BuildableName="{name}.xctest" BlueprintName="{name}" ReferencedContainer="container:REPPY.xcodeproj"/></TestableReference>'
scheme += f'''</Testables></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identity('target:REPPY')}" BuildableName="REPPY.app" BlueprintName="REPPY" ReferencedContainer="container:REPPY.xcodeproj"/></BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
'''
for relative, value in [('REPPY.xcodeproj/project.pbxproj', content), ('REPPY.xcodeproj/xcshareddata/xcschemes/REPPY.xcscheme', scheme)]:
    target = root / relative
    if '--check' in sys.argv:
        if not target.exists() or target.read_text() != value:
            raise SystemExit(f'{relative} is stale; run npm run ios:project')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)
print('Xcode project is current.' if '--check' in sys.argv else 'Generated ios/REPPY.xcodeproj (iPhone, iOS 18).')
