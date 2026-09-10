package com.crowroser.elazigsehir

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews

class PrayerWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs: SharedPreferences = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE)

        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId, prefs)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            prefs: SharedPreferences
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_prayer)

            val nextPrayerName = prefs.getString("prayer_name", "Sıradaki: Öğle") ?: "Sıradaki: Öğle"
            val nextPrayerTime = prefs.getString("prayer_time", "12:44") ?: "12:44"
            val countdown = prefs.getString("prayer_countdown", "-02:15:10 kaldı") ?: "-02:15:10 kaldı"

            views.setTextViewText(R.id.tv_next_prayer_name, nextPrayerName)
            views.setTextViewText(R.id.tv_next_prayer_time, nextPrayerTime)
            views.setTextViewText(R.id.tv_prayer_countdown, countdown)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
