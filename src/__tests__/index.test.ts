import { requireNativeModule } from 'expo';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { hideAsync, isVisible, useHideAnimation } from '../index';

// NOTE: jest.mock(...) is hoisted above all imports (including const declarations
// written above it in this file), so the factory must not close over an
// outer-scope const — that const would still be `undefined` at hoist time.
// Instead, everything the native module needs is created fresh inside the
// factory, and the real instance is recovered afterwards via
// `requireNativeModule`'s mock.results.
jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => ({
    hideAsync: jest.fn().mockResolvedValue(undefined),
    isVisible: jest.fn().mockReturnValue(true),
  })),
}));

const nativeModule = (requireNativeModule as jest.Mock).mock.results[0].value as {
  hideAsync: jest.Mock;
  isVisible: jest.Mock;
};

beforeEach(() => {
  nativeModule.hideAsync.mockClear();
  nativeModule.isVisible.mockClear();
  nativeModule.isVisible.mockReturnValue(true);
});

describe('hideAsync', () => {
  it('defaults fade to true', async () => {
    await hideAsync();
    expect(nativeModule.hideAsync).toHaveBeenCalledWith(true);
  });

  it('passes fade: false through', async () => {
    await hideAsync({ fade: false });
    expect(nativeModule.hideAsync).toHaveBeenCalledWith(false);
  });
});

describe('isVisible', () => {
  it('delegates to the native module', () => {
    nativeModule.isVisible.mockReturnValue(false);
    expect(isVisible()).toBe(false);
    expect(nativeModule.isVisible).toHaveBeenCalled();
  });
});

function TestComponent({ ready, animate }: { ready: boolean; animate: () => void }) {
  useHideAnimation({ ready, animate });
  return null;
}

describe('useHideAnimation', () => {
  it('hides the native splash and runs animate() when ready on mount and splash is visible', async () => {
    nativeModule.isVisible.mockReturnValue(true);
    const animate = jest.fn();

    await act(async () => {
      create(React.createElement(TestComponent, { ready: true, animate }));
    });

    expect(nativeModule.hideAsync).toHaveBeenCalledWith(false);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('skips hideAsync and just runs animate() when the native splash is already gone', async () => {
    nativeModule.isVisible.mockReturnValue(false);
    const animate = jest.fn();

    await act(async () => {
      create(React.createElement(TestComponent, { ready: true, animate }));
    });

    expect(nativeModule.hideAsync).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does not run until ready flips to true, and only runs once', async () => {
    const animate = jest.fn();
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(React.createElement(TestComponent, { ready: false, animate }));
    });
    expect(animate).not.toHaveBeenCalled();
    expect(nativeModule.hideAsync).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(React.createElement(TestComponent, { ready: true, animate }));
    });
    expect(animate).toHaveBeenCalledTimes(1);

    // Flipping ready again shouldn't re-trigger the hide sequence.
    await act(async () => {
      renderer.update(React.createElement(TestComponent, { ready: true, animate }));
    });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(nativeModule.hideAsync).toHaveBeenCalledTimes(1);
  });
});
