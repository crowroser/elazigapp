package com.crowroser.elazigsehir

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.view.View
import android.widget.RemoteViews

/**
 * "Günün Özeti" ana ekran widget'ı (L2) — Samsung Now Brief tarzı.
 * İçerik uygulamadaki BriefService tarafından üretilip widget_prefs'e yazılır:
 *   brief_title, brief_subtitle, brief_icon_1..4, brief_line_1..4, updated_at
 * Tıklanınca elazigsehir://brief derin bağlantısı ile özet ekranı açılır.
 */
class BriefWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences(LiveNotifications.PREFS, Context.MODE_PRIVATE)
        for (id in appWidgetIds) updateAppWidget(context, appWidgetManager, id, prefs)
    }

    companion object {
        private val ROW_IDS = intArrayOf(R.id.row_brief_1, R.id.row_brief_2, R.id.row_brief_3, R.id.row_brief_4)
        private val ICON_IDS = intArrayOf(R.id.tv_brief_icon_1, R.id.tv_brief_icon_2, R.id.tv_brief_icon_3, R.id.tv_brief_icon_4)
        private val LINE_IDS = intArrayOf(R.id.tv_brief_line_1, R.id.tv_brief_line_2, R.id.tv_brief_line_3, R.id.tv_brief_line_4)

        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, prefs: SharedPreferences) {
            val views = RemoteViews(context.packageName, R.layout.widget_brief)

            val launch = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("elazigsehir://brief")).apply {
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pi = PendingIntent.getActivity(context, 4, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_brief_root, pi)

            views.setTextViewText(R.id.tv_brief_title, prefs.getString("brief_title", null) ?: "Günün Özeti")
            views.setTextViewText(R.id.tv_brief_subtitle, prefs.getString("brief_subtitle", null) ?: "Elazığ Şehir")

            // "HH:mm" güncelleme damgası (uydurma veri yok; yoksa boş)
            val updatedAt = prefs.getString("updated_at", null)
            val stamp = try {
                if (updatedAt.isNullOrEmpty()) "" else {
                    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                    val d = sdf.parse(updatedAt)
                    if (d != null) java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(d) else ""
                }
            } catch (e: Exception) { "" }
            views.setTextViewText(R.id.tv_brief_updated, stamp)

            var shown = 0
            for (i in 0 until 4) {
                val line = prefs.getString("brief_line_${i + 1}", null)
                if (line.isNullOrBlank()) {
                    views.setViewVisibility(ROW_IDS[i], View.GONE)
                } else {
                    views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
                    views.setTextViewText(ICON_IDS[i], prefs.getString("brief_icon_${i + 1}", null) ?: "•")
                    views.setTextViewText(LINE_IDS[i], line)
                    shown++
                }
            }
            views.setViewVisibility(R.id.tv_brief_empty, if (shown == 0) View.VISIBLE else View.GONE)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
