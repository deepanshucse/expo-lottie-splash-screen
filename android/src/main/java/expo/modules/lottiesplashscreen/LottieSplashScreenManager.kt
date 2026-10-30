package expo.modules.lottiesplashscreen

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.Activity
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.AlphaAnimation
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable

object LottieSplashScreenManager {

    private const val TAG = "LottieSplashScreen"
    private const val FADE_DURATION_MS = 300L

    /** Colour resource written by the config plugin (has a values-night variant for dark mode). */
    private const val BACKGROUND_COLOR_RESOURCE = "lottie_splash_background"

    private val mainHandler = Handler(Looper.getMainLooper())

    // All mutable state below is only read and written on the main thread, so the
    // "is the animation done? → queue the hide" check can't race the animation ending.
    private var containerView: FrameLayout? = null
    private var lottieView: LottieAnimationView? = null
    private var focusListener: ViewTreeObserver.OnWindowFocusChangeListener? = null
    private var playbackStarted = false
    private var autoHide = false

    /**
     * Whether the Lottie animation has completed at least one full play-through
     * (or failed to load). Until this is true, any early hideAsync() call is queued
     * and executed only after the animation finishes — so the splash is never cut short.
     */
    private var animationCompleted = false

    /** Queued hide request received before the animation finished. */
    private var pendingHide: (() -> Unit)? = null

    /** Written on the main thread, read from the JS thread by isVisible(). */
    @Volatile private var visible = false

    /**
     * Called from MainActivity.onCreate() — injected by the Config Plugin. Must run on the
     * main thread, before super.onCreate().
     *
     * @param backgroundColor Solid hex colour (#RRGGBB) painted behind the animation so
     *                        any system splash underneath is fully covered. Only used if the
     *                        plugin's colour resource is missing; defaults to black if unparseable.
     * @param restored        `true` when the activity is being recreated (savedInstanceState
     *                        != null). The app is already past launch, so no overlay is shown.
     */
    @JvmOverloads
    fun show(
        activity: Activity,
        animationName: String,
        autoHide: Boolean,
        loop: Boolean,
        backgroundColor: String = "#000000",
        restored: Boolean = false
    ) {
        // Always install, on every API level: it switches the activity from BootTheme to
        // postSplashScreenTheme (AppTheme). Skipping it would leave a non-AppCompat theme.
        val splashScreen = activity.installSplashScreen()

        // Drop any overlay left over from a previous Activity instance (and resolve its
        // pending hide) so it can't leak the old Activity or stay on screen.
        flushPendingHide()
        removeOverlay()
        animationCompleted = false
        playbackStarted = false
        this.autoHide = autoHide

        if (restored) return

        // The overlay is added (and `visible` set) synchronously, before JS can run, so a
        // hideAsync() call can never arrive "before" the splash and be lost. Playback starts
        // once the system splash goes away so the first frames aren't hidden behind it.
        addOverlay(activity, animationName, loop, resolveBackgroundColor(activity, backgroundColor))

        splashScreen.setOnExitAnimationListener { provider ->
            provider.remove()
            startPlayback()
        }
    }

    private fun resolveBackgroundColor(activity: Activity, fallback: String): Int {
        val resId = activity.resources.getIdentifier(BACKGROUND_COLOR_RESOURCE, "color", activity.packageName)
        if (resId != 0) return ContextCompat.getColor(activity, resId)
        return try {
            Color.parseColor(fallback)
        } catch (_: IllegalArgumentException) {
            Color.BLACK
        }
    }

    private fun addOverlay(activity: Activity, animationName: String, loop: Boolean, bgColor: Int) {
        val container = FrameLayout(activity).apply {
            setBackgroundColor(bgColor)
        }

        val view = LottieAnimationView(activity).apply {
            repeatCount = if (loop) LottieDrawable.INFINITE else 0

            // Without this, a malformed animation throws and crashes the app.
            setFailureListener { error ->
                Log.w(TAG, "Failed to load splash animation '$animationName'", error)
                // Ignore failures from an overlay that has already been released.
                if (lottieView === this) onAnimationFinished()
            }

            addAnimatorListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    onAnimationFinished()
                }

                // A looping animation never ends — treat the first full loop as "played".
                override fun onAnimationRepeat(animation: Animator) {
                    onAnimationFinished()
                }
            })
        }

        container.addView(
            view,
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

        // Fallback start: the exit listener above isn't called when the system shows no
        // splash (e.g. some launch paths), but the window still gains focus.
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (hasFocus) startPlayback()
        }
        container.viewTreeObserver.addOnWindowFocusChangeListener(listener)

        containerView = container
        lottieView = view
        focusListener = listener
        visible = true

        val resId = activity.resources.getIdentifier(animationName, "raw", activity.packageName)
        if (resId != 0) {
            view.setAnimation(resId)
        } else {
            Log.w(TAG, "Splash animation 'res/raw/$animationName' not found")
            onAnimationFinished()
        }
    }

    private fun startPlayback() {
        val view = lottieView ?: return
        if (playbackStarted) return
        playbackStarted = true
        if (!animationCompleted) view.playAnimation()
    }

    private fun onAnimationFinished() {
        if (animationCompleted) return
        animationCompleted = true
        if (!visible) return

        val pending = pendingHide
        pendingHide = null
        when {
            pending != null -> pending()
            autoHide -> dismissOverlay(fade = false, onDone = null)
        }
    }

    /**
     * Hides the splash screen. Safe to call from any thread.
     *
     * If the Lottie animation hasn't completed yet, the hide is **queued** and
     * will execute automatically once the animation finishes — ensuring the
     * full animation always plays even if the app is ready early.
     */
    fun hide(fade: Boolean, onDone: (() -> Unit)?) {
        mainHandler.post {
            if (visible && !animationCompleted) {
                // Animation still running — queue the dismiss for after it ends.
                // onDone is called then so the JS Promise resolves at the right time.
                val previous = pendingHide
                pendingHide = {
                    previous?.invoke()
                    dismissOverlay(fade, onDone)
                }
            } else {
                dismissOverlay(fade, onDone)
            }
        }
    }

    private fun flushPendingHide() {
        val pending = pendingHide ?: return
        pendingHide = null
        pending()
    }

    private fun dismissOverlay(fade: Boolean, onDone: (() -> Unit)?) {
        val view = containerView
        if (view == null || !visible) {
            onDone?.invoke()
            return
        }

        // Mark hidden immediately to prevent a double dismiss
        visible = false
        releaseViews()

        if (fade) {
            val anim = AlphaAnimation(1f, 0f).apply {
                duration = FADE_DURATION_MS
                fillAfter = false
            }
            view.startAnimation(anim)
            view.postDelayed({
                (view.parent as? ViewGroup)?.removeView(view)
                onDone?.invoke()
            }, FADE_DURATION_MS)
        } else {
            (view.parent as? ViewGroup)?.removeView(view)
            onDone?.invoke()
        }
    }

    /** Immediately removes any overlay without animation. */
    private fun removeOverlay() {
        val view = containerView ?: return
        visible = false
        releaseViews()
        (view.parent as? ViewGroup)?.removeView(view)
    }

    /** Stops the animation and drops every reference to the overlay (and so to its Activity). */
    private fun releaseViews() {
        focusListener?.let { listener ->
            containerView?.viewTreeObserver?.takeIf { it.isAlive }?.removeOnWindowFocusChangeListener(listener)
        }
        lottieView?.apply {
            removeAllAnimatorListeners()
            cancelAnimation()
        }
        containerView = null
        lottieView = null
        focusListener = null
    }

    fun isVisible(): Boolean = visible
}
