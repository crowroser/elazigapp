package com.crowroser.elazigsehir

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews

class BusWidgetProvider : AppWidgetProvider() {

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
            val views = RemoteViews(context.packageName, R.layout.widget_bus)

            val lineName = prefs.getString("bus_line_name", "🚌 Harput Hattı") ?: "🚌 Harput Hattı"
            val stopName = prefs.getString("bus_stop_name", "Öğretmenevi Durağı") ?: "Öğretmenevi Durağı"
            val eta = prefs.getString("bus_eta", "4 dk") ?: "4 dk"
            val nextEta = prefs.getString("bus_next_eta", "14 Dakika") ?: "14 Dakika"

            views.setTextViewText(R.id.tv_bus_line_name, lineName)
            views.setTextViewText(R.id.tv_bus_stop_name, stopName)
            views.setTextViewText(R.id.tv_bus_eta, eta)
            views.setTextViewText(R.id.tv_bus_next_eta, nextEta)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
