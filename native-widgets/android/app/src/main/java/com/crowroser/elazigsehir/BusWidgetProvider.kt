package com.crowroser.elazigsehir

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
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

            // Tıklayınca uygulamayı aç (G9: duraklı derin bağlantı)
            val stopId = prefs.getString("bus_stop_id", null)
            val launchIntent = if (!stopId.isNullOrEmpty()) {
                Intent(Intent.ACTION_VIEW, android.net.Uri.parse("elazigsehir://transit?stopId=$stopId")).apply {
                    setPackage(context.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
            } else {
                context.packageManager.getLaunchIntentForPackage(context.packageName)
            }
            if (launchIntent != null) {
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    1,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_bus_root, pendingIntent)
            }

            // G9: "X dk önce" etiketi zorunlu
            val ageText = prefs.getString("bus_age_text", null)
            val updatedAtStr = prefs.getString("updated_at", null)
            val liveTagText = if (!updatedAtStr.isNullOrEmpty()) {
                try {
                    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                    val date = sdf.parse(updatedAtStr)
                    if (date != null) {
                        val diffMin = Math.max(0L, (System.currentTimeMillis() - date.time) / (60 * 1000L))
                        if (diffMin <= 1) "🟢 Az önce" else "🟢 $diffMin dk önce"
                    } else "🟢 CANLI"
                } catch (e: Exception) {
                    "🟢 CANLI"
                }
            } else if (!ageText.isNullOrEmpty()) {
                "🟢 $ageText"
            } else {
                "🟢 CANLI"
            }
            views.setTextViewText(R.id.tv_live_tag, liveTagText)

            val lineName = prefs.getString("bus_line_name", null) ?: "🚌 Hat Seçilmedi"
            val stopName = prefs.getString("bus_stop_name", null) ?: "Uygulamadan durak seçin"
            val eta = prefs.getString("bus_eta", null) ?: "—"
            val nextEta = prefs.getString("bus_next_eta", null) ?: "—"

            views.setTextViewText(R.id.tv_bus_line_name, lineName)
            views.setTextViewText(R.id.tv_bus_stop_name, stopName)
            views.setTextViewText(R.id.tv_bus_eta, eta)
            views.setTextViewText(R.id.tv_bus_next_eta, nextEta)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
