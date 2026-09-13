package com.crowroser.elazigsehir

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
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

            // Tıklayınca uygulamayı aç
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    2,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_elkart_root, pendingIntent)
            }

            val balance = prefs.getString("elkart_balance", null) ?: "— ₺"
            val type = prefs.getString("elkart_type", null) ?: "Kart Tanımlı Değil"
            val newsTitle = prefs.getString("news_title", null) ?: "Güncel haberler için dokunun"

            views.setTextViewText(R.id.tv_elkart_balance, balance)
            views.setTextViewText(R.id.tv_elkart_type, type)
            views.setTextViewText(R.id.tv_news_title, newsTitle)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
