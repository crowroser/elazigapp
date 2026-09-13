package com.crowroser.elazigsehir

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import java.util.Calendar

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

            // Tıklayınca uygulamayı aç
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_prayer_root, pendingIntent)
            }

            // Vakitleri SharedPreferences'tan dinamik hesapla
            val fajr = prefs.getString("prayer_fajr", null)
            val sunrise = prefs.getString("prayer_sunrise", null)
            val dhuhr = prefs.getString("prayer_dhuhr", null)
            val asr = prefs.getString("prayer_asr", null)
            val maghrib = prefs.getString("prayer_maghrib", null)
            val isha = prefs.getString("prayer_isha", null)

            var prayerName: String
            var prayerTime: String
            var countdown: String

            if (fajr != null && sunrise != null && dhuhr != null && asr != null && maghrib != null && isha != null) {
                val now = Calendar.getInstance()
                val currentMins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)

                val prayers = listOf(
                    Triple("İmsak", fajr, timeToMinutes(fajr)),
                    Triple("Güneş", sunrise, timeToMinutes(sunrise)),
                    Triple("Öğle", dhuhr, timeToMinutes(dhuhr)),
                    Triple("İkindi", asr, timeToMinutes(asr)),
                    Triple("Akşam", maghrib, timeToMinutes(maghrib)),
                    Triple("Yatsı", isha, timeToMinutes(isha))
                )

                var next = prayers.firstOrNull { it.third > currentMins }
                var diff: Int

                if (next != null) {
                    diff = next.third - currentMins
                } else {
                    // Yatsıdan sonra: sıradaki İmsak (yarın)
                    next = prayers.first()
                    diff = (next.third + 24 * 60) - currentMins
                }

                prayerName = "Sıradaki: ${next.first}"
                prayerTime = next.second
                val hours = diff / 60
                val mins = diff % 60
                countdown = if (hours > 0) "${hours} sa ${mins} dk kaldı" else "${mins} dk kaldı"
            } else {
                prayerName = prefs.getString("prayer_name", "Namaz Vakitleri") ?: "Namaz Vakitleri"
                prayerTime = prefs.getString("prayer_time", "—") ?: "—"
                countdown = prefs.getString("prayer_countdown", "Vakitleri yüklemek için dokunun") ?: "Vakitleri yüklemek için dokunun"
            }

            views.setTextViewText(R.id.tv_next_prayer_name, prayerName)
            views.setTextViewText(R.id.tv_next_prayer_time, prayerTime)
            views.setTextViewText(R.id.tv_prayer_countdown, countdown)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun timeToMinutes(timeStr: String): Int {
            return try {
                val parts = timeStr.trim().split(":")
                parts[0].toInt() * 60 + parts[1].toInt()
            } catch (e: Exception) {
                0
            }
        }
    }
}
