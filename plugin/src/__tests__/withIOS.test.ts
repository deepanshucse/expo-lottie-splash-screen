import {
  BACKGROUND_COLOR_ASSET,
  buildColorSetContents,
  buildLaunchStoryboard,
  injectAppDelegateImport,
  injectAppDelegateShowCall,
} from '../withIOS';

// Trimmed but structurally faithful to Expo SDK 57's generated AppDelegate.swift.
// This is the exact shape that broke the plugin: it returns `super.application(...)`,
// not `true`, so a regex hardcoded to `return true` never matches.
const SDK57_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

// Older/alternate template style that returns a literal \`true\`.
const LEGACY_APP_DELEGATE = `import Expo
import React

@UIApplicationMain
class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    self.moduleName = "main"
    return true
  }
}
`;

// Simulates another SDK (Firebase, Sentry, CodePush, ...) also patching
// didFinishLaunchingWithOptions with an early guard-return.
const APP_DELEGATE_WITH_EARLY_RETURN = `internal import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()

    guard FirebaseApp.app() != nil else {
      return false
    }

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

const options = { autoHide: false, backgroundColor: '#1A1A2E' };

describe('injectAppDelegateImport', () => {
  it('inserts the import after the first plain `import` line (skipping `internal import Expo`)', () => {
    const result = injectAppDelegateImport(SDK57_APP_DELEGATE);
    expect(result).toContain('import React\ninternal import ExpoLottieSplashScreen\n');
  });

  it('falls back to an access-level import when there are no plain imports', () => {
    const result = injectAppDelegateImport('internal import Expo\n\nclass AppDelegate {}\n');
    expect(result).toContain('internal import Expo\ninternal import ExpoLottieSplashScreen\n');
  });

  it('throws if the file has no imports', () => {
    expect(() => injectAppDelegateImport('class AppDelegate {}\n')).toThrow(/import/);
  });

  it('is idempotent', () => {
    const once = injectAppDelegateImport(SDK57_APP_DELEGATE);
    const twice = injectAppDelegateImport(once);
    expect(twice).toBe(once);
    expect(twice.match(/import ExpoLottieSplashScreen/g)).toHaveLength(1);
  });
});

describe('injectAppDelegateShowCall', () => {
  it('inserts before the final return in SDK 57 templates that return super.application(...)', () => {
    const result = injectAppDelegateShowCall(SDK57_APP_DELEGATE, options);
    expect(result).toContain('LottieSplashScreenManager.show(');

    const showIndex = result.indexOf('LottieSplashScreenManager.show(');
    const returnIndex = result.indexOf('return super.application(');
    expect(showIndex).toBeGreaterThan(-1);
    expect(showIndex).toBeLessThan(returnIndex);
  });

  it('still works against a legacy template that returns `true`', () => {
    const result = injectAppDelegateShowCall(LEGACY_APP_DELEGATE, options);
    const showIndex = result.indexOf('LottieSplashScreenManager.show(');
    const returnIndex = result.indexOf('return true');
    expect(showIndex).toBeGreaterThan(-1);
    expect(showIndex).toBeLessThan(returnIndex);
  });

  it('inserts before the LAST return, not an early guard-return from another SDK', () => {
    const result = injectAppDelegateShowCall(APP_DELEGATE_WITH_EARLY_RETURN, options);

    const guardReturnIndex = result.indexOf('return false');
    const showIndex = result.indexOf('LottieSplashScreenManager.show(');
    const finalReturnIndex = result.indexOf('return super.application(');

    expect(showIndex).toBeGreaterThan(guardReturnIndex);
    expect(showIndex).toBeLessThan(finalReturnIndex);
  });

  it('reflects autoHide and backgroundColor in the generated call', () => {
    const result = injectAppDelegateShowCall(SDK57_APP_DELEGATE, {
      autoHide: true,
      backgroundColor: '#FF0000',
    });
    expect(result).toContain('autoHide: true');
    expect(result).toContain('backgroundColor: "#FF0000"');
  });

  it('is idempotent', () => {
    const once = injectAppDelegateShowCall(SDK57_APP_DELEGATE, options);
    const twice = injectAppDelegateShowCall(once, options);
    expect(twice).toBe(once);
    expect(twice.match(/LottieSplashScreenManager\.show\(/g)).toHaveLength(1);
  });

  it('passes darkBackgroundColor only when set', () => {
    expect(injectAppDelegateShowCall(SDK57_APP_DELEGATE, options)).not.toContain(
      'darkBackgroundColor'
    );
    expect(
      injectAppDelegateShowCall(SDK57_APP_DELEGATE, { ...options, darkBackgroundColor: '#000000' })
    ).toContain('backgroundColor: "#1A1A2E", darkBackgroundColor: "#000000")');
  });

  it('throws if no matching function is found instead of silently skipping', () => {
    expect(() => injectAppDelegateShowCall('class Foo {}\n', options)).toThrow(
      /didFinishLaunchingWithOptions/
    );
  });
});

describe('buildColorSetContents', () => {
  it('writes the light colour as sRGB components', () => {
    const { colors } = JSON.parse(buildColorSetContents('#101312'));
    expect(colors).toHaveLength(1);
    expect(colors[0].color.components).toEqual({
      red: '0.063',
      green: '0.075',
      blue: '0.071',
      alpha: '1.000',
    });
  });

  it('adds a dark appearance only when darkBackgroundColor is set', () => {
    const { colors } = JSON.parse(buildColorSetContents('#FFFFFF', '#80000000'));
    expect(colors).toHaveLength(2);
    expect(colors[1].appearances).toEqual([{ appearance: 'luminosity', value: 'dark' }]);
    expect(colors[1].color.components).toEqual({
      red: '0.000',
      green: '0.000',
      blue: '0.000',
      alpha: '0.502',
    });
  });
});

describe('buildLaunchStoryboard', () => {
  it('is a logo-free launch screen painted with the background colour asset', () => {
    const storyboard = buildLaunchStoryboard('#1A1A2E');
    expect(storyboard).toContain('launchScreen="YES"');
    expect(storyboard).toContain(`<color key="backgroundColor" name="${BACKGROUND_COLOR_ASSET}"/>`);
    expect(storyboard).toContain(`<namedColor name="${BACKGROUND_COLOR_ASSET}">`);
    expect(storyboard).not.toContain('imageView');
  });
});
