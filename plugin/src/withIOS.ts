import {
  ConfigPlugin,
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withXcodeProject,
} from '@expo/config-plugins';
import fs from 'fs';
import path from 'path';

interface PluginOptions {
  animationFile: string;
  backgroundColor?: string;
  autoHide?: boolean;
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
export const withIosLottieSplash: ConfigPlugin<PluginOptions> = (
  config,
  options
) => {
  const { animationFile, backgroundColor = '#000000', autoHide = false } = options;

  // Step 1: Copy Lottie JSON into the iOS project folder
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const appName = config.modRequest.projectName ?? config.name ?? 'app';

      const srcFile = path.resolve(projectRoot, animationFile);
      if (!fs.existsSync(srcFile)) {
        throw new Error(
          `[expo-lottie-splash-screen] Animation file not found: ${srcFile}`
        );
      }

      // Copy into ios/<AppName>/lottie_splash.json.
      // Just placing the file on disk isn't enough — Xcode only bundles files
      // that are registered in the .pbxproj, which the next step handles.
      const destDir = path.join(platformRoot, appName);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcFile, path.join(destDir, 'lottie_splash.json'));

      return config;
    },
  ]);

  // Step 2: Register lottie_splash.json as a bundled resource in the Xcode project.
  // withDangerousMod only copies the file to disk — Xcode won't include it in the
  // app bundle unless it's added to the PBXResourcesBuildPhase of the main target.
  config = withXcodeProject(config, (config) => {
    const appName = config.modRequest.projectName ?? config.name ?? 'app';
    const filepath = path.join(appName, 'lottie_splash.json');

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

    // Inject import — idempotent guard
    const importLine = 'internal import ExpoLottieSplashScreen';
    if (!src.includes(importLine)) {
      src = src.replace(/^(import .+)$/m, `$1\n${importLine}`);
    }

    // Inject show() call — idempotent guard
    const marker = 'LottieSplashScreenManager.show(';
    if (!src.includes(marker)) {
      const autoHideStr = autoHide ? 'true' : 'false';
      const showSnippet =
        `    if let window = self.window {\n` +
        `      LottieSplashScreenManager.show(in: window, animationName: "lottie_splash", autoHide: ${autoHideStr}, loop: false, backgroundColor: "${backgroundColor}")\n` +
        `    }\n`;

      // Insert just before the *final* return statement in didFinishLaunchingWithOptions
      // (its closing brace is at 2-space indent, matching a class member).
      // Newer Expo templates return `super.application(...)` instead of `true`,
      // so match any `return ...` rather than hardcoding `return true`. We find the
      // LAST return in the function body — not the first — so that another SDK's
      // early guard-return (e.g. `guard ... else { return false }`) patched into the
      // same function doesn't cause the splash call to be inserted in the wrong place.
      const funcRegex =
        /func application\([^)]+didFinishLaunchingWithOptions[^)]+\)[^{]*\{[\s\S]*?\n  \}/;
      const funcMatch = funcRegex.exec(src);
      if (funcMatch) {
        const returnRegex = /\n(\s*)return .+/g;
        let lastReturn: RegExpExecArray | null = null;
        let match: RegExpExecArray | null;
        while ((match = returnRegex.exec(funcMatch[0]))) {
          lastReturn = match;
        }
        if (lastReturn) {
          const insertPos = funcMatch.index + lastReturn.index;
          src = src.slice(0, insertPos) + '\n' + showSnippet + src.slice(insertPos + 1);
        }
      }
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
