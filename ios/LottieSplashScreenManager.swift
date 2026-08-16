import UIKit
import Lottie

@objc public class LottieSplashScreenManager: NSObject {

    private static var animationView: LottieAnimationView?
    private static var _isVisible = false

    /// Whether the Lottie animation has completed at least one full play-through.
    /// Until this is true, any early hide() call is queued and executed only after
    /// the animation finishes — so the splash is never cut short.
    private static var animationCompleted = false

    /// Queued completion block received before animation finished.
    private static var pendingHide: (() -> Void)?

    @objc public static var isVisible: Bool { _isVisible }

    /// Call this from AppDelegate to show the splash screen.
    /// `animationName` is the filename (without extension) of the bundled Lottie JSON.
    /// `backgroundColor` is painted behind the animation to cover any underlying
    /// system splash screen. Accepts a hex string e.g. "#1A1A2E"; defaults to black.
    @objc public static func show(
        in window: UIWindow,
        animationName: String,
        autoHide: Bool,
        loop: Bool,
        backgroundColor: String = "#000000"
    ) {
        // Reset state for this show() call
        animationCompleted = false
        pendingHide = nil

        DispatchQueue.main.async {
            let view = LottieAnimationView(name: animationName)
            view.frame = window.bounds
            view.contentMode = .scaleAspectFit
            view.loopMode = loop ? .loop : .playOnce
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.backgroundColor = UIColor(hex: backgroundColor) ?? .black

            window.addSubview(view)
            _isVisible = true
            animationView = view

            view.play { finished in
                guard finished else { return }
                DispatchQueue.main.async {
                    animationCompleted = true

                    if autoHide {
                        // autoHide: dismiss automatically when animation ends
                        hide(fadeOut: false, completion: nil)
                    } else {
                        // autoHide: false — flush any pending hide from JS
                        if let pending = pendingHide {
                            pendingHide = nil
                            if _isVisible { pending() }
                        }
                    }
                }
            }
        }
    }

    /// Hides the splash screen, optionally with a fade-out.
    ///
    /// If the Lottie animation hasn't completed yet, the hide is **queued** and
    /// executes automatically once the animation finishes — ensuring the full
    /// animation always plays even if the app is ready early.
    @objc public static func hide(fadeOut: Bool, completion: (() -> Void)?) {
        DispatchQueue.main.async {
            guard _isVisible else {
                completion?()
                return
            }

            if !animationCompleted {
                // Animation still running — queue the dismiss for after it ends.
                pendingHide = { performHide(fadeOut: fadeOut, completion: completion) }
            } else {
                performHide(fadeOut: fadeOut, completion: completion)
            }
        }
    }

    private static func performHide(fadeOut: Bool, completion: (() -> Void)?) {
        guard let view = animationView, _isVisible else {
            completion?()
            return
        }

        // Mark hidden immediately to prevent a concurrent double-hide
        _isVisible = false
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
}
