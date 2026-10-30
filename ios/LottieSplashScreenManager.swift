import UIKit
import Lottie

@objc public class LottieSplashScreenManager: NSObject {

    // Mutable state below is only read and written on the main thread.
    private static var animationView: LottieAnimationView?
    private static var autoHide = false

    /// Whether the Lottie animation has completed at least one full play-through
    /// (or failed to load). Until this is true, any early hide() call is queued and
    /// executed only after the animation finishes — so the splash is never cut short.
    private static var animationCompleted = false

    /// Queued completion block received before animation finished.
    private static var pendingHide: (() -> Void)?

    // `isVisible` is also read from the JS thread, so it's guarded by a lock.
    private static let visibleLock = NSLock()
    private static var _isVisible = false

    @objc public static var isVisible: Bool {
        visibleLock.lock()
        defer { visibleLock.unlock() }
        return _isVisible
    }

    private static func setVisible(_ value: Bool) {
        visibleLock.lock()
        _isVisible = value
        visibleLock.unlock()
    }

    private static func onMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }

    /// Call this from AppDelegate to show the splash screen.
    /// `animationName` is the filename (without extension) of the bundled Lottie JSON.
    /// `backgroundColor` is painted behind the animation to cover any underlying
    /// system splash screen. Accepts a hex string e.g. "#1A1A2E"; defaults to black.
    /// `darkBackgroundColor`, if set, is used instead while the system is in dark mode.
    @objc public static func show(
        in window: UIWindow,
        animationName: String,
        autoHide: Bool,
        loop: Bool,
        backgroundColor: String = "#000000",
        darkBackgroundColor: String? = nil
    ) {
        // Runs synchronously when called from didFinishLaunching (main thread), so the
        // splash is visible before JS can call hideAsync().
        onMain {
            // Resolve and drop anything left over from a previous show().
            flushPendingHide()
            removeOverlay()
            animationCompleted = false
            self.autoHide = autoHide

            let view = LottieAnimationView(name: animationName)
            view.frame = window.bounds
            view.contentMode = .scaleAspectFit
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.backgroundColor = makeBackgroundColor(light: backgroundColor, dark: darkBackgroundColor)

            window.addSubview(view)
            animationView = view
            setVisible(true)

            guard view.animation != nil else {
                // Missing or invalid animation: don't hold the splash waiting for it.
                NSLog("[LottieSplashScreen] Splash animation '%@' not found in the app bundle", animationName)
                onAnimationFinished()
                return
            }

            play(view, loop: loop)
        }
    }

    private static func play(_ view: LottieAnimationView, loop: Bool) {
        // Always play once first: a looping animation never reports completion, which
        // would leave a queued hide waiting forever.
        view.loopMode = .playOnce
        view.play { _ in
            // `finished` is false when playback was interrupted; either way the splash
            // must not keep waiting on this animation.
            onMain {
                guard view === animationView else { return }
                onAnimationFinished()
                if loop, view === animationView {
                    view.loopMode = .loop
                    view.play()
                }
            }
        }
    }

    private static func makeBackgroundColor(light: String, dark: String?) -> UIColor {
        let lightColor = UIColor(hex: light) ?? .black
        guard let dark = dark, let darkColor = UIColor(hex: dark) else {
            return lightColor
        }
        return UIColor { traits in
            traits.userInterfaceStyle == .dark ? darkColor : lightColor
        }
    }

    private static func onAnimationFinished() {
        guard !animationCompleted else { return }
        animationCompleted = true
        guard isVisible else { return }

        if let pending = pendingHide {
            pendingHide = nil
            pending()
        } else if autoHide {
            performHide(fadeOut: false, completion: nil)
        }
    }

    /// Hides the splash screen, optionally with a fade-out. Safe to call from any thread.
    ///
    /// If the Lottie animation hasn't completed yet, the hide is **queued** and
    /// executes automatically once the animation finishes — ensuring the full
    /// animation always plays even if the app is ready early.
    @objc public static func hide(fadeOut: Bool, completion: (() -> Void)?) {
        onMain {
            guard isVisible else {
                completion?()
                return
            }

            if !animationCompleted {
                // Animation still running — queue the dismiss for after it ends.
                let previous = pendingHide
                pendingHide = {
                    previous?()
                    performHide(fadeOut: fadeOut, completion: completion)
                }
            } else {
                performHide(fadeOut: fadeOut, completion: completion)
            }
        }
    }

    private static func flushPendingHide() {
        guard let pending = pendingHide else { return }
        pendingHide = nil
        pending()
    }

    private static func performHide(fadeOut: Bool, completion: (() -> Void)?) {
        guard let view = animationView, isVisible else {
            completion?()
            return
        }

        // Mark hidden immediately to prevent a double hide
        setVisible(false)
        animationView = nil

        if fadeOut {
            UIView.animate(
                withDuration: 0.3,
                animations: { view.alpha = 0 },
                completion: { _ in
                    view.stop()
                    view.removeFromSuperview()
                    completion?()
                }
            )
        } else {
            view.stop()
            view.removeFromSuperview()
            completion?()
        }
    }

    /// Immediately removes any overlay without animation.
    private static func removeOverlay() {
        guard let view = animationView else { return }
        setVisible(false)
        animationView = nil
        view.stop()
        view.removeFromSuperview()
    }
}
