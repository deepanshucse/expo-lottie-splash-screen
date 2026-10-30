import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withMainActivity,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

import { ANIMATION_NAME, PluginOptions, resolveOptions } from './utils';

/** Colour resource used by the splash themes and the native overlay. Has a values-night variant when `darkBackgroundColor` is set. */
export const BACKGROUND_COLOR_RESOURCE = 'lottie_splash_background';

/** Idempotent — inserts the LottieSplashScreenManager import after the `package` line, unless already present. */
export function injectMainActivityImport(src: string): string {
  const importLine = 'import expo.modules.lottiesplashscreen.LottieSplashScreenManager';
  if (src.includes(importLine)) {
    return src;
  }
  if (!/^package .+/m.test(src)) {
    throw new Error(
      '[expo-lottie-splash-screen] Could not find the `package` declaration in MainActivity.kt.'
    );
  }
  return src.replace(/^(package .+)/m, `$1\n\n${importLine}`);
}

/**
 * Idempotent — inserts the `LottieSplashScreenManager.show(...)` call as the first statement of `onCreate`.
 * Throws if `onCreate` can't be found, rather than silently producing an app with no splash.
 */
export function injectMainActivityShowCall(
  src: string,
  options: { autoHide: boolean; backgroundColor: string }
): string {
  const marker = 'LottieSplashScreenManager.show(';
  if (src.includes(marker)) {
    return src;
  }

  const onCreateRegex = /(override fun onCreate\(savedInstanceState: Bundle\?\) \{)/;
  if (!onCreateRegex.test(src)) {
    throw new Error(
      '[expo-lottie-splash-screen] Could not find `override fun onCreate(savedInstanceState: Bundle?) {` ' +
        'in MainActivity.kt, so the splash screen could not be installed. ' +
        'If you have customised MainActivity, add this as the first line of onCreate:\n' +
        `  LottieSplashScreenManager.show(this, "${ANIMATION_NAME}", ${options.autoHide}, false, "${options.backgroundColor}", savedInstanceState != null)`
    );
  }

  const autoHideStr = options.autoHide ? 'true' : 'false';
  // `savedInstanceState != null` → the activity is being recreated (process restore, config
  // change), so the splash must not be shown again.
  const showCall = `    LottieSplashScreenManager.show(this, "${ANIMATION_NAME}", ${autoHideStr}, false, "${options.backgroundColor}", savedInstanceState != null)\n`;

  return src.replace(onCreateRegex, `$1\n${showCall}`);
}

/**
 * 1. Copies the Lottie JSON file to android/app/src/main/res/raw/lottie_splash.json
 * 2. Writes the background colour (and its dark variant) to colors.xml
 * 3. Patches styles.xml — overrides the splash theme Expo generates so our
 *    background colour replaces the splashscreen_logo on ALL Android versions.
 * 4. Points the main activity at BootTheme
 * 5. Patches MainActivity.kt to call LottieSplashScreenManager.show() in onCreate()
 */
export const withAndroidLottieSplash: ConfigPlugin<PluginOptions> = (config, options) => {
  const { animationFile, backgroundColor, darkBackgroundColor, autoHide } = resolveOptions(options);
  const colorRef = `@color/${BACKGROUND_COLOR_RESOURCE}`;

  // Step 1: Copy Lottie file to res/raw
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const srcFile = path.resolve(projectRoot, animationFile);
      if (!fs.existsSync(srcFile)) {
        throw new Error(`[expo-lottie-splash-screen] Animation file not found: ${srcFile}`);
      }

      const rawDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });
      fs.copyFileSync(srcFile, path.join(rawDir, `${ANIMATION_NAME}.json`));

      return config;
    },
  ]);

  // Step 2: Background colour resources. values-night is resolved automatically by Android,
  // so both the system splash themes and the native overlay follow dark mode.
  config = withAndroidColors(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: BACKGROUND_COLOR_RESOURCE,
      value: backgroundColor,
    });
    return config;
  });
  config = withAndroidColorsNight(config, (config) => {
    // A null value removes a dark colour left over from a previous prebuild.
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: BACKGROUND_COLOR_RESOURCE,
      value: darkBackgroundColor ?? null,
    });
    return config;
  });

  // Step 3: Patch styles.xml
  // Expo prebuild generates an activity with android:theme="@style/Theme.App.SplashScreen".
  // That theme sets android:windowBackground = @drawable/splashscreen_logo which causes
  // the logo to appear before our Lottie overlay is ready.
  //
  // Strategy:
  //   a) Find the existing "Theme.App.SplashScreen" style and overwrite its
  //      android:windowBackground with our solid colour (removes the logo on API 21-30).
  //   b) Add / update a "BootTheme" that extends Theme.SplashScreen and sets
  //      windowSplashScreenBackground + windowSplashScreenAnimatedIcon to the solid
  //      colour (suppresses the logo on Android 12+ SplashScreen API).
  //   c) Patch the manifest activity theme to "BootTheme" so installSplashScreen()
  //      uses our settings.
  config = withAndroidStyles(config, (config) => {
    const styles = config.modResults;

    if (!styles.resources.style) {
      styles.resources.style = [];
    }

    // a) Patch Theme.App.SplashScreen (Expo-generated)
    const splashTheme = styles.resources.style.find(
      (s: any) => s.$.name === 'Theme.App.SplashScreen'
    );

    if (splashTheme) {
      // Replace windowBackground — remove the splashscreen_logo reference
      if (!splashTheme.item) splashTheme.item = [];
      const wbIdx = splashTheme.item.findIndex(
        (it: any) => it.$.name === 'android:windowBackground'
      );
      const solidEntry = { $: { name: 'android:windowBackground' }, _: colorRef };
      if (wbIdx >= 0) {
        splashTheme.item[wbIdx] = solidEntry;
      } else {
        splashTheme.item.push(solidEntry);
      }
    }

    // b) Add / replace BootTheme
    // BootTheme extends Theme.SplashScreen (AndroidX SplashScreen API).
    // Setting windowSplashScreenAnimatedIcon to transparent removes the
    // animated icon (the logo) on Android 12+.
    styles.resources.style = styles.resources.style.filter((s: any) => s.$.name !== 'BootTheme');

    styles.resources.style.push({
      $: { name: 'BootTheme', parent: 'Theme.SplashScreen' },
      item: [
        {
          // Background fill seen before the icon appears (solid = logo-free)
          $: { name: 'windowSplashScreenBackground' },
          _: colorRef,
        },
        {
          // Transparent icon → nothing drawn on top of the background.
          // This effectively removes the splashscreen_logo on Android 12+
          $: { name: 'windowSplashScreenAnimatedIcon' },
          _: '@android:color/transparent',
        },
        {
          // Switch to AppTheme once installSplashScreen() runs
          $: { name: 'postSplashScreenTheme' },
          _: '@style/AppTheme',
        },
        {
          // Legacy windowBackground for API < 31 fallback path
          $: { name: 'android:windowBackground' },
          _: colorRef,
        },
      ],
    });

    return config;
  });

  // Step 4: Point the activity theme to BootTheme
  // Without this, installSplashScreen() reads Theme.App.SplashScreen (which still
  // has the logo as windowSplashScreenAnimatedIcon inherited from AppTheme).
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    const activities: any[] = app.activity ?? [];
    const mainActivity = activities.find((a: any) => a.$?.['android:name'] === '.MainActivity');

    if (mainActivity) {
      mainActivity.$['android:theme'] = '@style/BootTheme';
    }

    return config;
  });

  // Step 5: Patch MainActivity.kt
  config = withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error(
        '[expo-lottie-splash-screen] Only a Kotlin MainActivity is supported (found Java).'
      );
    }
    let src = config.modResults.contents;
    src = injectMainActivityImport(src);
    src = injectMainActivityShowCall(src, { autoHide, backgroundColor });
    config.modResults.contents = src;
    return config;
  });

  return config;
};
