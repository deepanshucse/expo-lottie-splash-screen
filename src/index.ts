import { requireNativeModule } from 'expo';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

const NativeModule = requireNativeModule('ExpoLottieSplashScreen');

export interface HideOptions {
  /**
   * Whether to fade out the splash screen. Default: `true`.
   */
  fade?: boolean;
}

export interface UseHideAnimationConfig {
  /**
   * Set to `false` to delay the animation until your app is ready.
   * Once flipped to `true`, hideAsync is called and `animate()` runs.
   * Default: `true`.
   */
  ready?: boolean;
  /**
   * A callback where you run your custom JS-side exit animation.
   * The native splash has already been removed when this is called.
   */
  animate: () => void;
}

/**
 * Hides the Lottie splash screen.
 *
 * Call this when your app is ready.
 * If you set `autoHide: true` in app.json, you don't need to call this at all —
 * the splash screen will hide itself when the animation finishes.
 *
 * @example
 * // Simple usage
 * await hideAsync();
 *
 * @example
 * // With fade
 * await hideAsync({ fade: true });
 */
export async function hideAsync(options: HideOptions = {}): Promise<void> {
  const fade = options.fade ?? true;
  return NativeModule.hideAsync(fade);
}

/**
 * Returns `true` if the Lottie splash screen overlay is currently visible.
 *
 * @example
 * if (isVisible()) {
 *   await hideAsync();
 * }
 */
export function isVisible(): boolean {
  return NativeModule.isVisible();
}

/**
 * A React hook for building a **custom JS-side exit animation** that plays
 * after the native splash is hidden.
 *
 * Inspired by react-native-bootsplash's `useHideAnimation`.
 *
 * @example
 * const { opacity } = useHideAnimation({
 *   ready: isAppReady,
 *   animate: () => {
 *     Animated.timing(opacity, {
 *       toValue: 0,
 *       duration: 400,
 *       useNativeDriver: true,
 *     }).start(() => setShowOverlay(false));
 *   },
 * });
 */
export function useHideAnimation(config: UseHideAnimationConfig) {
  const opacity = useRef(new Animated.Value(1)).current;
  const { ready = true, animate } = config;

  // Store animate in a ref so changing the callback reference between renders
  // doesn't re-trigger the effect. Only `ready` should drive the hide sequence.
  const animateRef = useRef(animate);
  animateRef.current = animate;

  // Guard: ensure the hide sequence only fires once per mount.
  const hasRun = useRef(false);

  useEffect(() => {
    if (ready && !hasRun.current) {
      hasRun.current = true;
      if (isVisible()) {
        // Native splash is showing — hide it first, then run JS transition.
        hideAsync({ fade: false }).then(() => {
          animateRef.current();
        });
      } else {
        // Native splash already gone (e.g. Metro JS reload).
        // Still run animate() so the JS overlay fades out correctly.
        animateRef.current();
      }
    }
  }, [ready]); // ← intentionally omit animateRef: it's a stable ref object

  return { opacity };
}
