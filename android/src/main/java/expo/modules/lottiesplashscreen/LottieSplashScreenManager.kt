package expo.modules.lottiesplashscreen

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.view.ViewGroup
import android.view.animation.AlphaAnimation
import android.widget.FrameLayout
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable

object LottieSplashScreenManager {

    private var containerView: FrameLayout? = null
    @Volatile private var visible = false

    /**
     * Whether the Lottie animation has completed at least one full play-through.
     * Until this is true, any early hideAsync() call is queued and executed
     * only after the animation finishes — so the splash is never cut short.
     */
    @Volatile private var animationCompleted = false

    /** Queued hide request received before the animation finished. */
    private var pendingHide: (() -> Unit)? = null

    /**
     * Called from MainActivity.onCreate() — injected by the Config Plugin.
     *
     * @param backgroundColor Solid hex colour (#RRGGBB) painted behind the animation so
     *                        any system splash / expo-splash-screen underneath is fully
     *                        covered. Defaults to black if the string is unparseable.
     */
    fun show(
        activity: Activity,
        animationName: String,
        autoHide: Boolean,
        loop: Boolean,
        backgroundColor: String = "#000000"
    ) {
        // Reset state for this show() call
        animationCompleted = false
        pendingHide = null

        val bgColor = try {
            Color.parseColor(backgroundColor)
        } catch (_: IllegalArgumentException) {
            Color.BLACK
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: wait for the system splash exit animation, then swap in Lottie
            val splashScreen = activity.installSplashScreen()
            splashScreen.setOnExitAnimationListener { provider ->
                provider.remove()   // dismiss the system splash immediately
                activity.runOnUiThread { showOverlay(activity, animationName, autoHide, loop, bgColor) }
            }
        } else {
            // Android 5–11: show Lottie overlay directly on top of DecorView
            activity.runOnUiThread { showOverlay(activity, animationName, autoHide, loop, bgColor) }
        }
    }

    private fun showOverlay(
        activity: Activity,
        animationName: String,
        autoHide: Boolean,
        loop: Boolean,
        bgColor: Int
    ) {
        val container = FrameLayout(activity).apply {
            setBackgroundColor(bgColor)
        }

        val lottieView = LottieAnimationView(activity).apply {
            val resId = activity.resources.getIdentifier(animationName, "raw", activity.packageName)
            if (resId != 0) setAnimation(resId)
            repeatCount = if (loop) LottieDrawable.INFINITE else 0
            playAnimation()

            addAnimatorListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    animationCompleted = true

                    if (autoHide) {
                        // autoHide: dismiss automatically when animation ends
                        if (visible) {
                            activity.runOnUiThread { dismissOverlay(fade = false, onDone = null) }
                        }
                    } else {
                        // autoHide: false — check if JS called hide() before animation ended
                        pendingHide?.let { pending ->
                            pendingHide = null
                            if (visible) {
                                activity.runOnUiThread { pending() }
                            }
                        }
                    }
                }
            })
        }

        container.addView(
            lottieView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )

        val root = activity.window.decorView as ViewGroup
        root.addView(
            container,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        containerView = container
        visible = true
    }

    /**
     * Hides the splash screen.
     *
     * If the Lottie animation hasn't completed yet, the hide is **queued** and
     * will execute automatically once the animation finishes — ensuring the
     * full animation always plays even if the app is ready early.
     */
    fun hide(activity: Activity, fade: Boolean, onDone: (() -> Unit)?) {
        if (!animationCompleted && visible) {
            // Animation still running — queue the dismiss for after it ends.
            // onDone is called then so the JS Promise resolves at the right time.
            pendingHide = { dismissOverlay(fade, onDone) }
        } else {
            activity.runOnUiThread { dismissOverlay(fade, onDone) }
        }
    }

    private fun dismissOverlay(fade: Boolean, onDone: (() -> Unit)?) {
        val view = containerView
        if (view == null || !visible) {
            onDone?.invoke()
            return
        }

        // Mark hidden immediately to prevent concurrent double-dismiss
        visible = false
        containerView = null

        // Stop the Lottie animation so the GPU thread stops rendering
        (view.getChildAt(0) as? LottieAnimationView)?.cancelAnimation()

        if (fade) {
            val anim = AlphaAnimation(1f, 0f).apply {
                duration = 300
                fillAfter = false
            }
            view.startAnimation(anim)
            view.postDelayed({
                (view.parent as? ViewGroup)?.removeView(view)
                onDone?.invoke()
            }, 300)
        } else {
            (view.parent as? ViewGroup)?.removeView(view)
            onDone?.invoke()
        }
    }

    fun isVisible(): Boolean = visible
}
