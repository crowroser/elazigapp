package com.crowroser.elazigsehir

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

class WidgetDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetDataModule"

    /**
     * JS'ten gelen tüm anahtarları widget_prefs'e yazar (yeni alan eklemek için Kotlin'e dokunmak gerekmez),
     * sonra ana ekrandaki tüm widget'ları günceller.
     */
    @ReactMethod
    fun updateWidgetData(data: ReadableMap) {
        val context: Context = reactApplicationContext
        val prefs = context.getSharedPreferences(LiveNotifications.PREFS, Context.MODE_PRIVATE)
        val editor = prefs.edit()

        val it = data.keySetIterator()
        while (it.hasNextKey()) {
            val key = it.nextKey()
            when (data.getType(key)) {
                ReadableType.String -> editor.putString(key, data.getString(key))
                ReadableType.Number -> editor.putString(key, data.getDouble(key).let { d -> if (d == Math.floor(d)) d.toLong().toString() else d.toString() })
                ReadableType.Boolean -> editor.putBoolean(key, data.getBoolean(key))
                ReadableType.Null -> editor.remove(key)
                else -> { /* dizi/harita widget'ta kullanılmaz */ }
            }
        }
        editor.apply()

        val appWidgetManager = AppWidgetManager.getInstance(context)
        val providers = listOf(
            PrayerWidgetProvider::class.java,
            BusWidgetProvider::class.java,
            ElkartWidgetProvider::class.java,
            BriefWidgetProvider::class.java,
        )
        for (provider in providers) {
            val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, provider))
            if (ids.isEmpty()) continue
            val intent = Intent(context, provider).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            context.sendBroadcast(intent)
        }

        // Namaz canlı bildirimi açıksa yeni vakitlerle tazele
        LiveNotifications.refreshPrayerLive(context)
    }
}
