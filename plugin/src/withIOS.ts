import {
  ConfigPlugin,
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

import { ANIMATION_NAME, PluginOptions, Rgba, hexToRgba, resolveOptions } from './utils';

/** Launch storyboard name; Expo's template already registers SplashScreen.storyboard in the Xcode project. */
export const LAUNCH_STORYBOARD_NAME = 'SplashScreen';

/** Named colour (asset catalog colour set) painted by the launch screen. Has a dark variant when `darkBackgroundColor` is set. */
export const BACKGROUND_COLOR_ASSET = 'LottieSplashBackground';

function colorComponents({ red, green, blue, alpha }: Rgba) {
  return {
    red: red.toFixed(3),
    green: green.toFixed(3),
    blue: blue.toFixed(3),
    alpha: alpha.toFixed(3),
  };
}

/** Contents.json of the background colour set, with a dark appearance when `darkHex` is given. */
export function buildColorSetContents(lightHex: string, darkHex?: string): string {
  const colors: object[] = [
    {
      idiom: 'universal',
      color: { 'color-space': 'srgb', components: colorComponents(hexToRgba(lightHex)) },
    },
  ];
  if (darkHex) {
    colors.push({
      idiom: 'universal',
      appearances: [{ appearance: 'luminosity', value: 'dark' }],
      color: { 'color-space': 'srgb', components: colorComponents(hexToRgba(darkHex)) },
    });
  }
  return JSON.stringify({ colors, info: { author: 'expo', version: 1 } }, null, 2) + '\n';
}

/**
 * A launch screen that is only the background colour — no logo — so iOS shows the same
 * solid colour the Lottie overlay paints, instead of the template's white screen.
 */
export function buildLaunchStoryboard(lightHex: string): string {
  // Interface Builder needs an inline fallback for the named colour; the asset catalog wins at runtime.
  const { red, green, blue, alpha } = colorComponents(hexToRgba(lightHex));
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="24093.7" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="EXPO-VIEWCONTROLLER-1">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/>
        <capability name="Named colors" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EXPO-SCENE-1">
            <objects>
                <viewController storyboardIdentifier="SplashScreenViewController" id="EXPO-VIEWCONTROLLER-1" sceneMemberID="viewController">
                    <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" insetsLayoutMarginsFromSafeArea="NO" id="EXPO-ContainerView" userLabel="ContainerView">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
                        <color key="backgroundColor" name="${BACKGROUND_COLOR_ASSET}"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
    <resources>
        <namedColor name="${BACKGROUND_COLOR_ASSET}">
            <color red="${red}" green="${green}" blue="${blue}" alpha="${alpha}" colorSpace="custom" customColorSpace="sRGB"/>
        </namedColor>
    </resources>
</document>
`;
}

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
 * 1. Copies the Lottie JSON file into the iOS app bundle, and replaces the launch
 *    screen with a logo-free one in the background colour (no white flash before the overlay)
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

      // Launch screen: solid background colour, no logo. The template's storyboard and
      // Images.xcassets are already part of the Xcode project, so writing them is enough.
      const colorSetDir = path.join(
        destDir,
        'Images.xcassets',
        `${BACKGROUND_COLOR_ASSET}.colorset`
      );
      fs.mkdirSync(colorSetDir, { recursive: true });
      fs.writeFileSync(
        path.join(colorSetDir, 'Contents.json'),
        buildColorSetContents(backgroundColor, darkBackgroundColor)
      );
      fs.writeFileSync(
        path.join(destDir, `${LAUNCH_STORYBOARD_NAME}.storyboard`),
        buildLaunchStoryboard(backgroundColor)
      );

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

  config = withInfoPlist(config, (config) => {
    config.modResults.UILaunchStoryboardName = LAUNCH_STORYBOARD_NAME;
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
