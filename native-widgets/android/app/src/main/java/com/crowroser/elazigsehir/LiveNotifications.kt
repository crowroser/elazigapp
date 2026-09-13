package com.crowroser.elazigsehir

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.util.Calendar

/**
 * Canlı bildirim (Android 16 "Live Updates" / Samsung One UI Now Bar) yardımcıları (L1).
 *
 * API 36+ : Notification.ProgressStyle + FLAG_PROMOTED_ONGOING + setShortCriticalText.
 *           Samsung One UI 8 bunları Now Bar'da ve kilit ekranında, saf Android durum çubuğu
 *           çipi + kilit ekranında "canlı" olarak gösterir.
 * API <36 : Klasik ongoing + progress bildirimi (One UI 7 Now Bar seçili kategorileri gösterebilir).
 *
 * Geri sayım (chronometer) sistem tarafından saniye saniye işletilir; uygulama kapalıyken bile akar.
 */
object LiveNotifications {
    const val CHANNEL_ID = "live_updates"
    const val PREFS = "widget_prefs"
    const val PRAYER_NOTIF_ID = 0x51A7
    const val KEY_PRAYER_LIVE = "prayer_live_enabled"
    const val ACTION_PRAYER_TICK = "com.crowroser.elazigsehir.PRAYER_LIVE_TICK"

    /** JS tarafından gelen bildirim tanımı */
    data class Spec(
        val title: String,
        val text: String,
        val subText: String? = null,
        /** Now Bar / durum çubuğu çipi metni (kısa: "4 dk", "Akşam") */
        val shortText: String? = null,
        /** 0..100; null → ilerleme çubuğu yok */
        val progress: Int? = null,
        val indeterminate: Boolean = false,
        /** Epoch ms; verilirse bildirimde bu ana kadar geri sayım gösterilir */
        val chronometerEndMs: Long? = null,
        val ongoing: Boolean = true,
        /** elazigsehir://... derin bağlantı; tıklanınca açılır */
        val deepLink: String? = null,
        /** İlerleme çubuğu üzerindeki ara noktalar (0..100) — ör. kalan duraklar */
        val progressPoints: List<Int> = emptyList(),
    )

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(CHANNEL_ID, "Canlı Bildirimler", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Otobüs varış takibi ve namaz vakti geri sayımı gibi sürekli güncellenen bildirimler"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
    }

    /** Android 16+ ve kullanıcı "Canlı güncellemeler" iznini kapatmamışsa true */
    fun canPostPromoted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 36) return false
        return try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.canPostPromotedNotifications()
        } catch (e: Throwable) {
            false
        }
    }

    private fun smallIcon(context: Context): Int {
        // expo-notifications eklentisi notification_icon üretir; yoksa uygulama ikonu
        val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        return if (id != 0) id else context.applicationInfo.icon
    }

    private fun contentIntent(context: Context, requestCode: Int, deepLink: String?): PendingIntent? {
        val intent = if (!deepLink.isNullOrEmpty()) {
            Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
                setPackage(context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        } else {
            context.packageManager.getLaunchIntentForPackage(context.packageName)
        } ?: return null
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun build(context: Context, notifId: Int, spec: Spec): Notification {
        ensureChannel(context)
        @Suppress("DEPRECATION")
        val builder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context))
            .setSmallIcon(smallIcon(context))
            .setContentTitle(spec.title)
            .setContentText(spec.text)
            .setOngoing(spec.ongoing)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)

        spec.subText?.let { builder.setSubText(it) }
        contentIntent(context, notifId, spec.deepLink)?.let { builder.setContentIntent(it) }

        if (spec.chronometerEndMs != null) {
            builder.setWhen(spec.chronometerEndMs)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
        }

        val hasProgress = spec.progress != null || spec.indeterminate
        if (Build.VERSION.SDK_INT >= 36) {
            if (hasProgress) {
                val style = Notification.ProgressStyle()
                    .setStyledByProgress(true)
                    .setProgressIndeterminate(spec.indeterminate)
                    .setProgressSegments(listOf(Notification.ProgressStyle.Segment(100)))
                if (!spec.indeterminate) style.setProgress((spec.progress ?: 0).coerceIn(0, 100))
                if (spec.progressPoints.isNotEmpty()) {
                    style.setProgressPoints(spec.progressPoints.map { Notification.ProgressStyle.Point(it.coerceIn(0, 100)) })
                }
                builder.setStyle(style)
            }
            if (spec.ongoing) requestPromotedOngoing(builder)
            spec.shortText?.let { builder.setShortCriticalText(it) }
        } else if (hasProgress) {
            builder.setProgress(100, (spec.progress ?: 0).coerceIn(0, 100), spec.indeterminate)
        }

        return builder.build()
    }

    /**
     * Live Update isteği. Android 16.0 (API 36) yalnızca FLAG_PROMOTED_ONGOING'i tanır; 16 QPR1+ (36.1)
     * uygulamanın koyduğu bayrağı siler ve bayrağı ancak EXTRA_REQUEST_PROMOTED_ONGOING /
     * setRequestPromotedOngoing(true) isteği + izin + promotable şartlar sağlanınca kendisi verir.
     * compileSdk 36 olduğundan 36.1 API'si reflection ile çağrılır; extra ise her sürümde doğrudan konur.
     */
    private fun requestPromotedOngoing(builder: Notification.Builder) {
        builder.setFlag(Notification.FLAG_PROMOTED_ONGOING, true)
        builder.addExtras(android.os.Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
        try {
            builder.javaClass.getMethod("setRequestPromotedOngoing", java.lang.Boolean.TYPE).invoke(builder, true)
        } catch (e: Throwable) {
            // 36.0: yöntem yok, bayrak + extra yeterli
        }
    }

    fun post(context: Context, notifId: Int, spec: Spec) {
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(notifId, build(context, notifId, spec))
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS izni yoksa sessizce geç
        }
    }

    fun cancel(context: Context, notifId: Int) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(notifId)
    }

    // ─── Namaz vakti canlı geri sayımı ─────────────────────────────────────────

    private val PRAYER_KEYS = listOf(
        "prayer_fajr" to "İmsak",
        "prayer_dhuhr" to "Öğle",
        "prayer_asr" to "İkindi",
        "prayer_maghrib" to "Akşam",
        "prayer_isha" to "Yatsı",
    )

    private fun tickIntent(context: Context): PendingIntent {
        val i = Intent(context, PrayerLiveReceiver::class.java).apply { action = ACTION_PRAYER_TICK }
        return PendingIntent.getBroadcast(context, PRAYER_NOTIF_ID, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun setPrayerLiveEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_PRAYER_LIVE, enabled).apply()
        if (enabled) {
            refreshPrayerLive(context)
        } else {
            stopPrayerLive(context)
        }
    }

    fun isPrayerLiveEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_PRAYER_LIVE, false)

    fun stopPrayerLive(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(tickIntent(context))
        cancel(context, PRAYER_NOTIF_ID)
    }

    /**
     * Widget tercihlerindeki (uygulamanın senkronladığı) günlük vakitlerden sıradaki vakti bulur,
     * geri sayımlı bildirimi basar ve bir sonraki yenileme için alarm kurar.
     * Veri yoksa ya da 3 günden eskiyse bildirimi kaldırır (uydurma vakit gösterilmez).
     */
    fun refreshPrayerLive(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_PRAYER_LIVE, false)) {
            stopPrayerLive(context)
            return
        }

        val updatedAt = prefs.getString("updated_at", null)
        val dataAgeOk = try {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
            val d = if (updatedAt != null) sdf.parse(updatedAt) else null
            d != null && System.currentTimeMillis() - d.time < 3L * 24 * 60 * 60 * 1000
        } catch (e: Exception) {
            false
        }

        val now = Calendar.getInstance()
        val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        val times = PRAYER_KEYS.mapNotNull { (key, label) ->
            val raw = prefs.getString(key, null) ?: return@mapNotNull null
            val parts = raw.split(":")
            val h = parts.getOrNull(0)?.trim()?.toIntOrNull() ?: return@mapNotNull null
            val m = parts.getOrNull(1)?.trim()?.toIntOrNull() ?: return@mapNotNull null
            Triple(label, raw.trim(), h * 60 + m)
        }
        if (!dataAgeOk || times.isEmpty()) {
            cancel(context, PRAYER_NOTIF_ID)
            return
        }

        // Sıradaki ve bir önceki vakit (gün sınırını aşarak)
        val nextIdx = times.indexOfFirst { it.third > nowMin }
        val next = if (nextIdx >= 0) times[nextIdx] else times.first()
        val nextMin = if (nextIdx >= 0) next.third else next.third + 24 * 60
        val prev = if (nextIdx > 0) times[nextIdx - 1] else times.last()
        // nextIdx == 0 → önceki vakit dünün son vakti; nextIdx == -1 → bugünün son vakti geçti, sıradaki yarının ilki
        val prevMin = when {
            nextIdx > 0 -> prev.third
            nextIdx == 0 -> prev.third - 24 * 60
            else -> prev.third
        }

        val span = (nextMin - prevMin).coerceAtLeast(1)
        val progress = (((nowMin - prevMin) * 100) / span).coerceIn(0, 100)
        val remaining = nextMin - nowMin

        val endCal = (now.clone() as Calendar).apply {
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.MINUTE, remaining)
        }

        val remainingText = if (remaining >= 60) "${remaining / 60} sa ${remaining % 60} dk" else "$remaining dk"
        post(
            context,
            PRAYER_NOTIF_ID,
            Spec(
                title = "🕌 ${next.first} · ${next.second}",
                text = "Elazığ · ${prev.first} ${prev.second} → ${next.first} ${next.second}",
                subText = "$remainingText kaldı",
                shortText = next.first,
                progress = progress,
                chronometerEndMs = endCal.timeInMillis,
                deepLink = "elazigsehir://brief",
            )
        )

        // Bir sonraki yenileme: en geç 10 dk sonra, vakit girdiğinde ise hemen (+30 sn)
        val nextTickMs = minOf(endCal.timeInMillis + 30_000L, System.currentTimeMillis() + 10 * 60_000L)
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTickMs, tickIntent(context))
        } catch (e: SecurityException) {
            am.set(AlarmManager.RTC, nextTickMs, tickIntent(context))
        }
    }
}
