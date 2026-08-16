package expo.modules.lottiesplashscreen

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoLottieSplashScreenModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoLottieSplashScreen")

        // Hide the splash screen, optionally with a fade-out.
        // Resolves the promise once the animation is removed.
        AsyncFunction("hideAsync") { fade: Boolean, promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject("ERR_NO_ACTIVITY", "Activity is not available.", null)
                return@AsyncFunction
            }
            LottieSplashScreenManager.hide(activity, fade) {
                promise.resolve(null)
            }
        }

        // Returns whether the splash screen overlay is currently visible.
        Function("isVisible") {
            LottieSplashScreenManager.isVisible()
        }
    }
}
