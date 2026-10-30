import {
  ConfigPlugin,
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withXcodeProject,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

import { ANIMATION_NAME, PluginOptions, resolveOptions } from './utils';

/**
 * Idempotent — inserts `internal import ExpoLottieSplashScreen` after the first plain
 * `import` line, falling back to the first access-level import (`internal import Expo`)
 * when the file has no plain imports. Throws if the file has no imports at all.
 */
export function injectAppDelegateImport(src: string): string {
  const importLine = 'internal import ExpoLottieSplashScreen';
  if (src.includes(importLine)) {
    return src;
  }
  const plainImport = /^(import .+)$/m;
  if (plainImport.test(src)) {
    return src.replace(plainImport, `$1\n${importLine}`);
  }
  const accessLevelImport = /^((?:public|package|internal|fileprivate|private) import .+)$/m;
  if (accessLevelImport.test(src)) {
    return src.replace(accessLevelImport, `$1\n${importLine}`);
  }
  throw new Error(
    '[expo-lottie-splash-screen] Could not find any `import` statement in AppDelegate.swift.'
  );
}

/**
 * Idempotent — inserts the `LottieSplashScreenManager.show(...)` call just before the
 * *final* return statement in `didFinishLaunchingWithOptions` (its closing brace is at
 * 2-space indent, matching a class member).
 *
 * Newer Expo templates return `super.application(...)` instead of `true`, so this
 * matches any `return ...` rather than hardcoding `return true`. It finds the LAST
 * return in the function body — not the first — so that another SDK's early
 * guard-return (e.g. `guard ... else { return false }`) patched into the same function
 * doesn't cause the splash call to be inserted in the wrong place.
 *
 * Throws if the function or its return can't be found, rather than silently producing
 * an app with no splash.
 */
export function injectAppDelegateShowCall(
  src: string,
  options: { autoHide: boolean; backgroundColor: string; darkBackgroundColor?: string }
): string {
  const marker = 'LottieSplashScreenManager.show(';
  if (src.includes(marker)) {
    return src;
  }

  const autoHideStr = options.autoHide ? 'true' : 'false';
  const darkArg = options.darkBackgroundColor
    ? `, darkBackgroundColor: "${options.darkBackgroundColor}"`
    : '';
  const showCall = `LottieSplashScreenManager.show(in: window, animationName: "${ANIMATION_NAME}", autoHide: ${autoHideStr}, loop: false, backgroundColor: "${options.backgroundColor}"${darkArg})`;
  const showSnippet = `    if let window = self.window {\n      ${showCall}\n    }\n`;

  const notFound = (what: string) =>
    new Error(
      `[expo-lottie-splash-screen] Could not find ${what} in AppDelegate.swift, so the splash ` +
        'screen could not be installed. If you have customised AppDelegate, add this just before ' +
        'the final return of application(_:didFinishLaunchingWithOptions:):\n' +
        `  if let window = self.window { ${showCall} }`
    );

  const funcRegex =
    /func application\([^)]+didFinishLaunchingWithOptions[^)]+\)[^{]*\{[\s\S]*?\n  \}/;
  const funcMatch = funcRegex.exec(src);
  if (!funcMatch) {
    throw notFound('`application(_:didFinishLaunchingWithOptions:)`');
  }

  const returnRegex = /\n(\s*)return .+/g;
  let lastReturn: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = returnRegex.exec(funcMatch[0]))) {
    lastReturn = match;
  }
  if (!lastReturn) {
    throw notFound('a `return` statement in `application(_:didFinishLaunchingWithOptions:)`');
  }

  const insertPos = funcMatch.index + lastReturn.index;
  return src.slice(0, insertPos) + '\n' + showSnippet + src.slice(insertPos + 1);
}

/**
 * 1. Copies the Lottie JSON file into the iOS app bundle
 * 2. Patches AppDelegate.swift to call LottieSplashScreenManager.show() in
 *    application(_:didFinishLaunchingWithOptions:)
 *
 * LottieSplashScreenManager lives in the ExpoLottieSplashScreen CocoaPod, a
 * separate Xcode target/Swift module from the app's AppDelegate, so an
 * `import ExpoLottieSplashScreen` is required.
 */
export const withIosLottieSplash: ConfigPlugin<PluginOptions> = (config, options) => {
  const { animationFile, backgroundColor, darkBackgroundColor, autoHide } = resolveOptions(options);

  // Step 1: Copy Lottie JSON into the iOS project folder
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const appName = config.modRequest.projectName ?? config.name ?? 'app';

      const srcFile = path.resolve(projectRoot, animationFile);
      if (!fs.existsSync(srcFile)) {
        throw new Error(`[expo-lottie-splash-screen] Animation file not found: ${srcFile}`);
      }

      // Copy into ios/<AppName>/lottie_splash.json.
      // Just placing the file on disk isn't enough — Xcode only bundles files
      // that are registered in the .pbxproj, which the next step handles.
      const destDir = path.join(platformRoot, appName);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcFile, path.join(destDir, `${ANIMATION_NAME}.json`));

      return config;
    },
  ]);

  // Step 2: Register lottie_splash.json as a bundled resource in the Xcode project.
  // withDangerousMod only copies the file to disk — Xcode won't include it in the
  // app bundle unless it's added to the PBXResourcesBuildPhase of the main target.
  config = withXcodeProject(config, (config) => {
    const appName = config.modRequest.projectName ?? config.name ?? 'app';
    const filepath = path.join(appName, `${ANIMATION_NAME}.json`);

    if (!config.modResults.hasFile(filepath)) {
      config.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: appName,
        project: config.modResults,
        isBuildFile: true,
        verbose: true,
      });
    }

    return config;
  });

  // Step 3: Patch AppDelegate.swift
  config = withAppDelegate(config, (config) => {
    let src = config.modResults.contents;
    src = injectAppDelegateImport(src);
    src = injectAppDelegateShowCall(src, { autoHide, backgroundColor, darkBackgroundColor });
    config.modResults.contents = src;
    return config;
  });

  return config;
};
