package com.crowroser.elazigsehir

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews

class ElkartWidgetProvider : AppWidgetProvider() {

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
            val views = RemoteViews(context.packageName, R.layout.widget_elkart)

            val balance = prefs.getString("elkart_balance", "142,50 ₺") ?: "142,50 ₺"
            val type = prefs.getString("elkart_type", "Tam Kart") ?: "Tam Kart"
            val newsTitle = prefs.getString("news_title", "\"Elazığ Gastronomi Festivali bu hafta sonu Kültür Park'ta başlıyor...\"")
                ?: "\"Elazığ Gastronomi Festivali bu hafta sonu Kültür Park'ta başlıyor...\""

            views.setTextViewText(R.id.tv_elkart_balance, balance)
            views.setTextViewText(R.id.tv_elkart_type, type)
            views.setTextViewText(R.id.tv_news_title, newsTitle)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
