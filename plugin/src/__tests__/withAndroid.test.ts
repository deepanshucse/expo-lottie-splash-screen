import { injectMainActivityImport, injectMainActivityShowCall } from '../withAndroid';

const MAIN_ACTIVITY = `package com.example.app

import android.os.Bundle
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

const options = { autoHide: false, backgroundColor: '#1A1A2E' };

describe('injectMainActivityImport', () => {
  it('inserts the import after the package declaration', () => {
    const result = injectMainActivityImport(MAIN_ACTIVITY);
    expect(result).toContain(
      'package com.example.app\n\nimport expo.modules.lottiesplashscreen.LottieSplashScreenManager'
    );
  });

  it('is idempotent', () => {
    const once = injectMainActivityImport(MAIN_ACTIVITY);
    const twice = injectMainActivityImport(once);
    expect(twice).toBe(once);
    expect(
      twice.match(/import expo\.modules\.lottiesplashscreen\.LottieSplashScreenManager/g)
    ).toHaveLength(1);
  });
});

describe('injectMainActivityShowCall', () => {
  it('inserts the show() call as the first statement of onCreate', () => {
    const result = injectMainActivityShowCall(MAIN_ACTIVITY, options);
    const showIndex = result.indexOf('LottieSplashScreenManager.show(');
    const superOnCreateIndex = result.indexOf('super.onCreate(null)');

    expect(showIndex).toBeGreaterThan(-1);
    expect(showIndex).toBeLessThan(superOnCreateIndex);
  });

  it('reflects autoHide and backgroundColor', () => {
    const result = injectMainActivityShowCall(MAIN_ACTIVITY, {
      autoHide: true,
      backgroundColor: '#FF0000',
    });
    expect(result).toContain(
      'LottieSplashScreenManager.show(this, "lottie_splash", true, false, "#FF0000")'
    );
  });

  it('is idempotent', () => {
    const once = injectMainActivityShowCall(MAIN_ACTIVITY, options);
    const twice = injectMainActivityShowCall(once, options);
    expect(twice).toBe(once);
    expect(twice.match(/LottieSplashScreenManager\.show\(/g)).toHaveLength(1);
  });

  it('leaves source untouched if onCreate is not found', () => {
    const src = 'class Foo\n';
    expect(injectMainActivityShowCall(src, options)).toBe(src);
  });
});
