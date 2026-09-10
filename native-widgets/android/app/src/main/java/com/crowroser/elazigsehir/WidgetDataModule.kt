package com.crowroser.elazigsehir

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class WidgetDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetDataModule"

    @ReactMethod
    fun updateWidgetData(data: ReadableMap) {
        val context: Context = reactApplicationContext
        val prefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (data.hasKey("prayer_name")) editor.putString("prayer_name", data.getString("prayer_name"))
        if (data.hasKey("prayer_time")) editor.putString("prayer_time", data.getString("prayer_time"))
        if (data.hasKey("prayer_countdown")) editor.putString("prayer_countdown", data.getString("prayer_countdown"))

        if (data.hasKey("bus_line_name")) editor.putString("bus_line_name", data.getString("bus_line_name"))
        if (data.hasKey("bus_stop_name")) editor.putString("bus_stop_name", data.getString("bus_stop_name"))
        if (data.hasKey("bus_eta")) editor.putString("bus_eta", data.getString("bus_eta"))
        if (data.hasKey("bus_next_eta")) editor.putString("bus_next_eta", data.getString("bus_next_eta"))

        if (data.hasKey("elkart_balance")) editor.putString("elkart_balance", data.getString("elkart_balance"))
        if (data.hasKey("elkart_type")) editor.putString("elkart_type", data.getString("elkart_type"))
        if (data.hasKey("news_title")) editor.putString("news_title", data.getString("news_title"))

        editor.apply()

        // Trigger updates for all home screen widgets
        val appWidgetManager = AppWidgetManager.getInstance(context)

        val prayerIds = appWidgetManager.getAppWidgetIds(ComponentName(context, PrayerWidgetProvider::class.java))
        if (prayerIds.isNotEmpty()) {
            val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, prayerIds)
            }
            context.sendBroadcast(intent)
        }

        val busIds = appWidgetManager.getAppWidgetIds(ComponentName(context, BusWidgetProvider::class.java))
        if (busIds.isNotEmpty()) {
            val intent = Intent(context, BusWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, busIds)
            }
            context.sendBroadcast(intent)
        }

        val elkartIds = appWidgetManager.getAppWidgetIds(ComponentName(context, ElkartWidgetProvider::class.java))
        if (elkartIds.isNotEmpty()) {
            val intent = Intent(context, ElkartWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, elkartIds)
            }
            context.sendBroadcast(intent)
        }
    }
}
