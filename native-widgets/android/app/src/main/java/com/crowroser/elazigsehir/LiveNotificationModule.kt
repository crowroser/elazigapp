package com.crowroser.elazigsehir

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

/**
 * JS köprüsü: canlı bildirim (Live Update / Now Bar) basma ve namaz geri sayımını yönetme (L1).
 * Bkz. services/liveNotificationService.ts
 */
class LiveNotificationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "LiveNotificationModule"

    /** { sdk, promoted (API 36+), canPostPromoted (kullanıcı izni), prayerLiveEnabled } */
    @ReactMethod
    fun getCapabilities(promise: Promise) {
        val ctx = reactApplicationContext
        val map = Arguments.createMap()
        map.putInt("sdk", Build.VERSION.SDK_INT)
        map.putBoolean("promoted", Build.VERSION.SDK_INT >= 36)
        map.putBoolean("canPostPromoted", LiveNotifications.canPostPromoted(ctx))
        map.putBoolean("prayerLiveEnabled", LiveNotifications.isPrayerLiveEnabled(ctx))
        map.putString("manufacturer", Build.MANUFACTURER ?: "")
        promise.resolve(map)
    }

    @ReactMethod
    fun show(id: String, opts: ReadableMap) {
        val points = mutableListOf<Int>()
        if (opts.hasKey("progressPoints") && opts.getType("progressPoints") == ReadableType.Array) {
            val arr = opts.getArray("progressPoints")
            if (arr != null) for (i in 0 until arr.size()) points.add(arr.getInt(i))
        }
        val spec = LiveNotifications.Spec(
            title = opts.getString("title") ?: "",
            text = opts.getString("text") ?: "",
            subText = if (opts.hasKey("subText")) opts.getString("subText") else null,
            shortText = if (opts.hasKey("shortText")) opts.getString("shortText") else null,
            progress = if (opts.hasKey("progress") && !opts.isNull("progress")) opts.getInt("progress") else null,
            indeterminate = opts.hasKey("indeterminate") && opts.getBoolean("indeterminate"),
            chronometerEndMs = if (opts.hasKey("chronometerEndMs") && !opts.isNull("chronometerEndMs")) opts.getDouble("chronometerEndMs").toLong() else null,
            ongoing = !opts.hasKey("ongoing") || opts.getBoolean("ongoing"),
            deepLink = if (opts.hasKey("deepLink")) opts.getString("deepLink") else null,
            progressPoints = points,
        )
        LiveNotifications.post(reactApplicationContext, id.hashCode(), spec)
    }

    @ReactMethod
    fun dismiss(id: String) {
        LiveNotifications.cancel(reactApplicationContext, id.hashCode())
    }

    @ReactMethod
    fun setPrayerLiveEnabled(enabled: Boolean, promise: Promise) {
        LiveNotifications.setPrayerLiveEnabled(reactApplicationContext, enabled)
        promise.resolve(enabled)
    }

    /** Vakitler yeniden senkronlandığında (WidgetService) çağrılır; açık değilse hiçbir şey yapmaz */
    @ReactMethod
    fun refreshPrayerLive() {
        LiveNotifications.refreshPrayerLive(reactApplicationContext)
    }
}
