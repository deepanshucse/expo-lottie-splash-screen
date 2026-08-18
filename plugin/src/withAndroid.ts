import {
  ConfigPlugin,
  withMainActivity,
  withAndroidStyles,
  withAndroidManifest,
  withDangerousMod,
} from '@expo/config-plugins';
import fs from 'fs';
import path from 'path';

interface PluginOptions {
  animationFile: string;
  backgroundColor?: string;
  darkBackgroundColor?: string;
  autoHide?: boolean;
}

/** Idempotent — inserts the LottieSplashScreenManager import after the `package` line, unless already present. */
export function injectMainActivityImport(src: string): string {
  const importLine = 'import expo.modules.lottiesplashscreen.LottieSplashScreenManager';
  if (src.includes(importLine)) {
    return src;
  }
  return src.replace(/^(package .+)/m, `$1\n\n${importLine}`);
}

/** Idempotent — inserts the `LottieSplashScreenManager.show(...)` call as the first statement of `onCreate`. */
export function injectMainActivityShowCall(
  src: string,
  options: { autoHide: boolean; backgroundColor: string }
): string {
  const marker = 'LottieSplashScreenManager.show(';
  if (src.includes(marker)) {
    return src;
  }

  const autoHideStr = options.autoHide ? 'true' : 'false';
  const showCall = `    LottieSplashScreenManager.show(this, "lottie_splash", ${autoHideStr}, false, "${options.backgroundColor}")\n`;

  return src.replace(
    /(override fun onCreate\(savedInstanceState: Bundle\?\) \{)/,
    `$1\n${showCall}`
  );
}

/**
 * 1. Copies the Lottie JSON file to android/app/src/main/res/raw/lottie_splash.json
 * 2. Patches styles.xml — overrides the splash theme Expo generates so our
 *    background colour replaces the splashscreen_logo on ALL Android versions.
 * 3. Patches MainActivity.kt to call LottieSplashScreenManager.show() in onCreate()
 */
export const withAndroidLottieSplash: ConfigPlugin<PluginOptions> = (config, options) => {
  const { animationFile, backgroundColor = '#ffffff', autoHide = false } = options;

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
      fs.copyFileSync(srcFile, path.join(rawDir, 'lottie_splash.json'));

      return config;
    },
  ]);

  // Step 2: Patch styles.xml
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
      const solidEntry = { $: { name: 'android:windowBackground' }, _: backgroundColor };
      if (wbIdx >= 0) {
        splashTheme.item[wbIdx] = solidEntry;
      } else {
        splashTheme.item.push(solidEntry);
      }
    }

    // b) Add / replace BootTheme
    // BootTheme extends Theme.SplashScreen (AndroidX SplashScreen API).
    // Setting windowSplashScreenAnimatedIcon to a solid colour removes the
    // animated icon (the logo) on Android 12+.
    styles.resources.style = styles.resources.style.filter((s: any) => s.$.name !== 'BootTheme');

    styles.resources.style.push({
      $: { name: 'BootTheme', parent: 'Theme.SplashScreen' },
      item: [
        {
          // Background fill seen before the icon appears (solid = logo-free)
          $: { name: 'windowSplashScreenBackground' },
          _: backgroundColor,
        },
        {
          // Use the background colour as the icon → invisible against background
          // This effectively removes the splashscreen_logo on Android 12+
          $: { name: 'windowSplashScreenAnimatedIcon' },
          _: '@android:color/transparent',
        },
        {
          // Switch to AppTheme once the splash is dismissed
          $: { name: 'postSplashScreenTheme' },
          _: '@style/AppTheme',
        },
        {
          // Legacy windowBackground for API < 31 fallback path
          $: { name: 'android:windowBackground' },
          _: backgroundColor,
        },
      ],
    });

    return config;
  });

  // Step 3: Point the activity theme to BootTheme
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

  //Step 4: Patch MainActivity.kt
  config = withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    src = injectMainActivityImport(src);
    src = injectMainActivityShowCall(src, { autoHide, backgroundColor });
    config.modResults.contents = src;
    return config;
  });

  return config;
};
