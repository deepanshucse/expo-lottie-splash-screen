import ExpoModulesCore

public class ExpoLottieSplashScreenModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoLottieSplashScreen")

        // Hides the splash screen. `fade` controls whether to animate out.
        // Resolves only after the view has been removed.
        AsyncFunction("hideAsync") { (fade: Bool, promise: Promise) in
            LottieSplashScreenManager.hide(fadeOut: fade) {
                promise.resolve(nil)
            }
        }

        // Returns whether the splash overlay is currently on screen.
        // Synchronous — safe to call anywhere.
        Function("isVisible") { () -> Bool in
            LottieSplashScreenManager.isVisible
        }
    }
}
