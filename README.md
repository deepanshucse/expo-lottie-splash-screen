# expo-lottie-splash-screen

A native Expo module that plays a **Lottie animation as your app's splash screen** — running entirely on the native side before the JavaScript bundle loads.

[![npm](https://img.shields.io/npm/v/expo-lottie-splash-screen)](https://www.npmjs.com/package/expo-lottie-splash-screen)
[![license](https://img.shields.io/npm/l/expo-lottie-splash-screen)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-android%20%7C%20ios-lightgrey)](https://reactnative.dev)

---

![Lottie animation playing as the native splash screen](.github/sample_video.gif)

[▶ Watch the full-quality video](https://github.com/deepanshucse/expo-lottie-splash-screen/raw/main/.github/sample_video.webm)

> Lottie animation playing as the native splash screen before the JS bundle loads.

---

## Why this library?

| Feature | expo-splash-screen | react-native-bootsplash | **expo-lottie-splash-screen** |
|---|---|---|---|
| Expo Managed / Bare | ✅ | ⚠️ bare only | ✅ |
| Config Plugin (zero native edits) | ✅ | ❌ | ✅ |
| Lottie animation | ❌ | ❌ | ✅ |
| Plays before JS loads | ✅ | ✅ | ✅ |
| Auto-hide when animation ends | ❌ | ❌ | ✅ |
| Full animation guaranteed | ❌ | ❌ | ✅ |
| Manual hide from JS | ✅ | ✅ | ✅ |
| Custom JS exit animation hook | ❌ | ✅ | ✅ |
| New Architecture (Fabric) | ✅ | ✅ | ✅ |

---

## How it works

```
App launch
    │
    ▼
System SplashScreen (BootTheme — solid background, no logo)
    │
    ▼  onExitAnimation (Android 12+)  /  didFinishLaunching (iOS)
    │
    ▼
LottieSplashScreenManager.show()   ← opaque overlay on DecorView / UIWindow
    │
    ├─── autoHide: true  → hides automatically when animation ends
    │
    └─── autoHide: false → JS calls hideAsync() / useHideAnimation hook
    │         │
    │         └── if app is ready before animation ends → dismiss is QUEUED
    │               and fires automatically when animation completes
    ▼
React Native UI renders
```

The native Lottie overlay is shown **before the React Native bridge initialises**, meaning the animation plays seamlessly from the very first frame of app launch.

> **Animation is always played in full.** If your app finishes loading before the Lottie animation ends, the dismiss is queued and executes automatically once the animation completes — the splash is never cut short.

---

## Installation

```bash
npx expo install expo-lottie-splash-screen
```

### Peer dependencies

| Package | Version |
|---|---|
| `expo` | `*` |
| `react` | `*` |
| `react-native` | `*` |
| `@expo/config-plugins` | `*` |

---

## Setup

### 1. Add your Lottie file

Place your `.json` Lottie animation file anywhere in your project, e.g.:

```
my-app/
  assets/
    splash.json   ← your animation
```

> **Tip**: Download free animations from [lottiefiles.com](https://lottiefiles.com). Keep the file small (< 100 KB) for instant startup.

### 2. Register the plugin in `app.json`

```json
{
  "expo": {
    "plugins": [
      [
        "expo-lottie-splash-screen",
        {
          "animationFile": "./assets/splash.json",
          "backgroundColor": "#1A1A2E",
          "autoHide": false
        }
      ]
    ]
  }
}
```

#### Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `animationFile` | `string` | **required** | Relative path from project root to the Lottie `.json` file |
| `backgroundColor` | `string` | `"#ffffff"` | Solid background colour painted behind the animation on all Android versions and iOS |
| `autoHide` | `boolean` | `false` | If `true`, the splash hides automatically when the animation ends — no JS code needed |

### 3. Run prebuild

```bash
npx expo prebuild --clean
```

The plugin automatically patches:

**Android**
- Copies `lottie_splash.json` → `android/app/src/main/res/raw/`
- Overrides `Theme.App.SplashScreen` with your `backgroundColor` (removes `splashscreen_logo` on all API levels)
- Creates `BootTheme` extending `Theme.SplashScreen` with `windowSplashScreenAnimatedIcon = transparent` (removes logo on Android 12+)
- Sets the activity `android:theme` to `@style/BootTheme` in `AndroidManifest.xml`
- Injects `LottieSplashScreenManager.show()` into `MainActivity.kt`

**iOS**
- Copies `lottie_splash.json` into the Xcode app bundle
- Injects `LottieSplashScreenManager.show()` into `AppDelegate.swift`

> ⚠️ **Never manually edit `MainActivity.kt` or `AppDelegate.swift`** in a managed workflow — `expo prebuild --clean` will overwrite them. Use `app.json` plugin options instead.

---

## JavaScript API

### `hideAsync(options?)`

Hides the Lottie splash screen overlay. Returns a `Promise` that resolves once the view has been fully removed.

> **Note:** If the Lottie animation hasn't finished playing yet, the dismiss is **queued** and the Promise resolves only after the animation completes. You never need to add your own delay.

```typescript
import { hideAsync } from 'expo-lottie-splash-screen';

// Hide with a native fade-out (default)
await hideAsync();

// Hide with fade
await hideAsync({ fade: true });

// Hide instantly (no fade)
await hideAsync({ fade: false });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `fade` | `boolean` | `true` | Animate the splash out with a 300 ms opacity transition |

---

### `isVisible()`

Returns `true` if the native Lottie overlay is currently on screen. **Synchronous.**

```typescript
import { isVisible } from 'expo-lottie-splash-screen';

if (isVisible()) {
  console.log('Splash is still showing');
}
```

---

### `useHideAnimation(config)`

A React hook for building a **custom JS-side exit animation** that runs after the native splash is hidden. Inspired by [`react-native-bootsplash`](https://github.com/zoontek/react-native-bootsplash).

- On a normal cold start, it hides the native splash and then calls `animate()`.
- On a **Metro JS reload** (where the native splash is already gone), it calls `animate()` immediately — so no dark stuck screen.

```typescript
import { useHideAnimation } from 'expo-lottie-splash-screen';

const { opacity } = useHideAnimation({
  ready: isAppReady,      // set to true when your app has loaded
  animate: () => {
    // Called after the native overlay is removed (or immediately on reload).
    // Use any animation — Animated, Reanimated, etc.
    Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setShowOverlay(false));
  },
});
```

| Config | Type | Default | Description |
|---|---|---|---|
| `ready` | `boolean` | `true` | When `true`, the hide sequence starts. Set to `false` to hold the splash while your app initialises |
| `animate` | `() => void` | **required** | Called after the native splash is removed. Run your exit animation here |

**Returns** `{ opacity: Animated.Value }` — an `Animated.Value` starting at `1` you can bind to a JS overlay component.

---

## Usage patterns

### Pattern A — Simple (`autoHide: false`, call `hideAsync` manually)

Best for: apps that need to load data or fonts before showing the UI.

```typescript
// app.json → "autoHide": false

import { useEffect, useState } from 'react';
import { hideAsync } from 'expo-lottie-splash-screen';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      await Font.loadAsync({ ... });  // load fonts, prefetch data, etc.
      setReady(true);
      await hideAsync({ fade: true }); // waits for animation to finish if needed
    }
    prepare();
  }, []);

  if (!ready) return null;
  return <YourApp />;
}
```

---

### Pattern B — Auto-hide (`autoHide: true`)

Best for: branding splash screens where you just want the animation to play once and disappear automatically.

```json
{
  "plugins": [
    ["expo-lottie-splash-screen", {
      "animationFile": "./assets/splash.json",
      "autoHide": true
    }]
  ]
}
```

No JS code needed at all. The splash hides itself when the animation finishes.

---

### Pattern C — Custom JS exit animation (`useHideAnimation`)

Best for: seamless transitions where the splash colour fades into your app UI.

```typescript
// app.json → "autoHide": false

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { isVisible, useHideAnimation } from 'expo-lottie-splash-screen';

export default function App() {
  const [isAppReady, setAppReady] = useState(false);
  const [showOverlay, setShowOverlay] = useState(isVisible()); // false on JS reload

  // Opacity starts at 1 during cold start, 0 on JS reload (nothing to fade)
  const overlayOpacity = useRef(new Animated.Value(isVisible() ? 1 : 0)).current;

  useEffect(() => {
    loadResources().then(() => setAppReady(true));
  }, []);

  useHideAnimation({
    ready: isAppReady,
    animate: () => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setShowOverlay(false));
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <YourApp />

      {/* JS overlay matching your splash background — fades out after native splash */}
      {showOverlay && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: '#1A1A2E' }, // match your backgroundColor in app.json
});
```

---

## Important behaviours

### Animation is always played in full

If `hideAsync()` is called (or `ready` becomes `true`) **before** the Lottie animation finishes its first play-through, the dismiss is **queued** and fires automatically when the animation ends. The `hideAsync()` Promise resolves at that point.

```
App loads in 1.5s, animation is 4.7s long:

  0s ──── 1.5s (hideAsync called, queued) ──── 4.7s (animation ends, splash hides)
```

You never need to add artificial delays to match your animation duration.

### JS reload safety

When Metro reloads the JS bundle (pressing `r`), the native Lottie overlay is already gone. The `useHideAnimation` hook detects this via `isVisible()` and calls `animate()` immediately — so no stuck dark screen on reload.

### Android 12+ system splash

On Android 12+ the system SplashScreen API shows briefly before our Lottie overlay. The plugin ensures:
- `windowSplashScreenBackground` is set to your `backgroundColor`
- `windowSplashScreenAnimatedIcon` is set to `@android:color/transparent` (removes the Expo logo icon)
- The activity theme is set to `BootTheme` so `installSplashScreen()` reads these values

---

## Platform requirements

| Platform | Minimum version |
|---|---|
| Android | API 21 (Android 5.0 Lollipop) |
| iOS | 14.0 |

### Native dependencies (auto-resolved)

| Platform | Library | Version |
|---|---|---|
| Android | `com.airbnb.android:lottie` | `6.4.0` |
| Android | `androidx.core:core-splashscreen` | `1.0.1` |
| Android | `androidx.appcompat:appcompat` | `1.7.0` |
| iOS | `lottie-ios` | `~> 4.4` |

These are declared in the module's `build.gradle` / `.podspec` — you do not need to add them to your project.

---

## Project structure

```
expo-lottie-splash-screen/
├── src/
│   └── index.ts                         # JS/TS public API
├── android/
│   ├── build.gradle                     # Lottie + SplashScreen + AppCompat deps
│   └── src/main/java/expo/modules/lottiesplashscreen/
│       ├── LottieSplashScreenManager.kt # Native overlay + animation-complete guard
│       └── ExpoLottieSplashScreenModule.kt
├── ios/
│   ├── LottieSplashScreenManager.swift  # Native overlay + animation-complete guard
│   ├── ExpoLottieSplashScreenModule.swift
│   ├── UIColor+Hex.swift                # Hex colour parser for backgroundColor
│   └── ExpoLottieSplashScreen.podspec
├── plugin/
│   └── src/
│       ├── withAndroid.ts               # Android Config Plugin
│       └── withIOS.ts                   # iOS Config Plugin
├── app.plugin.js                        # Plugin entry point
├── expo-module.config.json
├── example/                             # Example Expo app
│   ├── App.tsx
│   ├── assets/splash.json               # Lottie animation
│   ├── app.json
│   └── .gitignore                       # Excludes android/ and ios/ (prebuild output)
└── package.json
```

---

## Development

### Build the library

```bash
npm run build:all
```

### Run TypeScript checks

```bash
npx tsc --noEmit
```

### Run the example app (Android)

```bash
# 1. Install example dependencies
cd example && npm install

# 2. Generate native projects (re-run after any plugin or native change)
npx expo prebuild --platform android --clean

# 3. Build and install on a connected device / emulator
cd android && ./gradlew installDebug

# 4. Start Metro bundler (in a separate terminal)
cd .. && npx expo start
```

> **Windows users**: After each `expo prebuild`, re-apply the hardcoded paths in `android/app/build.gradle` (the `react { }` block) — Gradle's `.execute()` shell calls don't work on Windows.

### Run the example app (iOS — macOS only)

```bash
cd example
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
npx expo run:ios
```

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

---

## License

MIT © [Deepanshu Yadav](https://github.com/deepanshucse)
