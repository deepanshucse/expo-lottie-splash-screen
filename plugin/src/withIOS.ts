import {
  ConfigPlugin,
  withAppDelegate,
  withDangerousMod,
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
 * NOTE: No import statement is needed in AppDelegate.swift for
 * LottieSplashScreenManager — it lives in the same Xcode target and Swift
 * module, so it is automatically accessible.
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

      // Copy into ios/<AppName>/lottie_splash.json
      // This folder is the main app target directory — Xcode will bundle it automatically.
      const destDir = path.join(platformRoot, appName);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcFile, path.join(destDir, 'lottie_splash.json'));

      return config;
    },
  ]);

  // Step 2: Patch AppDelegate.swift
  config = withAppDelegate(config, (config) => {
    let src = config.modResults.contents;

    // Inject show() call — idempotent guard
    const marker = 'LottieSplashScreenManager.show(';
    if (!src.includes(marker)) {
      const autoHideStr = autoHide ? 'true' : 'false';
      const showSnippet =
        `    if let window = self.window {\n` +
        `      LottieSplashScreenManager.show(in: window, animationName: "lottie_splash", autoHide: ${autoHideStr}, loop: false, backgroundColor: "${backgroundColor}")\n` +
        `    }\n`;

      // Insert just before the final `return true` in didFinishLaunchingWithOptions
      src = src.replace(
        /(func application\([^)]+didFinishLaunchingWithOptions[^)]+\)[^{]*\{[\s\S]*?)(return true)/,
        `$1${showSnippet}    $2`
      );
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};
