export interface PluginOptions {
  animationFile: string;
  backgroundColor?: string;
  darkBackgroundColor?: string;
  autoHide?: boolean;
}

export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';

/** Name of the bundled animation on both platforms (res/raw/lottie_splash.json, lottie_splash.json in the iOS bundle). */
export const ANIMATION_NAME = 'lottie_splash';

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Validates a hex colour and normalises it to `#RRGGBB` / `#AARRGGBB`, the only
 * forms that Android's `Color.parseColor`, Android XML resources and the iOS
 * `UIColor(hex:)` initialiser all agree on. `#RGB` is expanded to `#RRGGBB`.
 */
export function normalizeHexColor(value: string, optionName: string): string {
  const match = HEX_COLOR.exec(value.trim());
  if (!match) {
    throw new Error(
      `[expo-lottie-splash-screen] \`${optionName}\` must be a hex colour like "#1A1A2E" ` +
        `(#RGB, #RRGGBB or #AARRGGBB), got: ${JSON.stringify(value)}`
    );
  }
  let hex = match[1].toUpperCase();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${hex}`;
}

export interface ResolvedOptions {
  animationFile: string;
  backgroundColor: string;
  darkBackgroundColor?: string;
  autoHide: boolean;
}

export function resolveOptions(options: PluginOptions): ResolvedOptions {
  return {
    animationFile: options.animationFile,
    backgroundColor: normalizeHexColor(
      options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      'backgroundColor'
    ),
    darkBackgroundColor:
      options.darkBackgroundColor !== undefined
        ? normalizeHexColor(options.darkBackgroundColor, 'darkBackgroundColor')
        : undefined,
    autoHide: options.autoHide ?? false,
  };
}
