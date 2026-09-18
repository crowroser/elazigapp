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
    /** v2: kanal düzeyinde kilit ekranı görünürlüğü PUBLIC (yalnızca oluşturulurken ayarlanabilir) */
    const val CHANNEL_ID = "live_updates_v2"
    private const val LEGACY_CHANNEL_ID = "live_updates"
    const val PREFS = "widget_prefs"
    const val PRAYER_NOTIF_ID = 0x51A7
    const val KEY_PRAYER_LIVE = "prayer_live_enabled"
    const val ACTION_PRAYER_TICK = "com.crowroser.elazigsehir.PRAYER_LIVE_TICK"
    /** Bildirim aksiyon düğmeleri (LiveActionReceiver) */
    const val ACTION_PRAYER_LIVE_OFF = "com.crowroser.elazigsehir.PRAYER_LIVE_OFF"
    const val ACTION_LESSON_LIVE_OFF = "com.crowroser.elazigsehir.LESSON_LIVE_OFF"
    const val LESSON_NOTIF_ID = 0x1E55
    const val KEY_LESSON_LIVE = "lesson_live_enabled"
    /** WidgetService.syncWidgets'in yazdığı haftalık program: [{d,s,e,c,r}] (d: 0=Pazartesi, s/e: "HH:mm") */
    const val KEY_LESSONS_JSON = "lessons_json"
    const val ACTION_LESSON_TICK = "com.crowroser.elazigsehir.LESSON_LIVE_TICK"
    /** Sıradaki ders bildirimi ders başlamadan bu kadar önce belirir */
    private const val LESSON_LEAD_MIN = 45

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
        /** Genişleyen kartta düğmeler (Samsung Now Bar bunları `actions` olarak çizer; kilit ekranında tek dokunuş) */
        val actions: List<Action> = emptyList(),
    )

    /** deepLink → uygulamayı o rotada açar; broadcast → LiveActionReceiver'a iletilir (uygulama açılmaz) */
    data class Action(val label: String, val deepLink: String? = null, val broadcast: String? = null)

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(LEGACY_CHANNEL_ID) != null) nm.deleteNotificationChannel(LEGACY_CHANNEL_ID)
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(CHANNEL_ID, "Canlı Bildirimler", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Otobüs varış takibi, namaz vakti ve ders geri sayımı gibi sürekli güncellenen bildirimler"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
            // Kilit ekranında "hassas içeriği gizle" açıkken de içerik görünsün (Samsung Now Bar kanal ayarına bakıyor)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
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

    /**
     * Bildirimi kurar ve kilit ekranı "hassas içeriği gizle" açıkken de içeriğin görünmesi için aynı içerikli
     * bir publicVersion ekler. VISIBILITY_PUBLIC tek başına Samsung Now Bar'a yetmiyor: publicVersion yoksa
     * kilit ekranındaki kapsülde yalnızca uygulama adı çıkıyor (One UI 8.5'te doğrulandı). İçerik zaten hassas
     * değil (namaz vakti, ders, otobüs).
     */
    private fun broadcastIntent(context: Context, action: String): PendingIntent {
        val i = Intent(context, LiveActionReceiver::class.java).apply { this.action = action }
        return PendingIntent.getBroadcast(context, action.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Bir sonraki dakika sınırı (+0,5 sn): kalan-süre metni dakikada bir tazelenir (Samsung kronometreyi çizmiyor) */
    private fun nextMinuteMs(nowMs: Long): Long = (nowMs / 60_000L + 1) * 60_000L + 500L

    fun build(context: Context, notifId: Int, spec: Spec): Notification {
        val public = buildInner(context, notifId, spec)
        return buildInner(context, notifId, spec, publicVersion = public)
    }

    private fun buildInner(context: Context, notifId: Int, spec: Spec, publicVersion: Notification? = null): Notification {
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
        publicVersion?.let { builder.setPublicVersion(it) }
        spec.actions.forEachIndexed { idx, a ->
            val pi = when {
                a.broadcast != null -> broadcastIntent(context, a.broadcast)
                else -> contentIntent(context, notifId * 31 + idx + 1, a.deepLink)
            } ?: return@forEachIndexed
            val icon = android.graphics.drawable.Icon.createWithResource(context, smallIcon(context))
            builder.addAction(Notification.Action.Builder(icon, a.label, pi).build())
        }

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
                title = "${next.first} · ${next.second}",
                text = "Elazığ · ${prev.first} ${prev.second} → ${next.first} ${next.second}",
                subText = "$remainingText kaldı",
                shortText = remainingText,
                progress = progress,
                chronometerEndMs = endCal.timeInMillis,
                deepLink = "elazigsehir://brief",
                actions = listOf(
                    Action("Vakitler", deepLink = "elazigsehir://brief"),
                    Action("Kapat", broadcast = ACTION_PRAYER_LIVE_OFF),
                ),
            )
        )

        // Bir sonraki yenileme: dakika başında (kalan süre metni), vakit girdiğinde ise hemen (+30 sn)
        val nowMs = System.currentTimeMillis()
        scheduleTick(context, tickIntent(context), minOf(endCal.timeInMillis + 30_000L, nextMinuteMs(nowMs)))
    }

    /** Android 12+ : kullanıcı "Alarmlar ve hatırlatıcılar" iznini vermişse true (öncesinde her zaman true) */
    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return try {
            (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Samsung One UI'da "Kilitliyken içeriği gizle" (global) açıkken Now Bar üçüncü taraf kartlarda
     * VISIBILITY_PUBLIC ve publicVersion'a bakmadan yalnızca uygulama adını gösterir (One UI 8.5'te doğrulandı).
     * Kullanıcı bunu uygulama bazında "Her zaman göster" ile aşabilir; bu ayar uygulamadan okunamıyor,
     * o yüzden yalnızca global ayarı raporlarız ve JS tarafı ipucunu bir kez gösterir.
     */
    fun lockscreenContentHidden(context: Context): Boolean {
        if (!Build.MANUFACTURER.equals("samsung", ignoreCase = true)) return false
        return try {
            android.provider.Settings.Secure.getInt(context.contentResolver, "lock_screen_allow_private_notifications", 1) == 0
        } catch (e: Throwable) {
            false
        }
    }

    /** Uygulamanın bildirim ayarları sayfası (Samsung'da "Kilitliyken içeriği göster veya gizle" burada) */
    fun openAppNotificationSettings(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return try {
            context.startActivity(
                Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, context.packageName)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        } catch (e: Throwable) {
            false
        }
    }

    /** Sistem ayarlarındaki "Alarmlar ve hatırlatıcılar" sayfasını açar (Android 12+) */
    fun openExactAlarmSettings(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        return try {
            context.startActivity(
                Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            true
        } catch (e: Throwable) {
            false
        }
    }

    /**
     * Ders geçişleri / vakit girişleri dakika hassasiyeti ister: izin varsa exact alarm; yoksa
     * setAndAllowWhileIdle'ın 1 saate varan penceresi yerine en fazla 10 dk pencereli setWindow.
     */
    private fun scheduleTick(context: Context, pi: PendingIntent, atMs: Long) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try {
            if (canScheduleExact(context)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
            } else {
                am.setWindow(AlarmManager.RTC_WAKEUP, atMs, 10 * 60_000L, pi)
            }
        } catch (e: SecurityException) {
            am.setWindow(AlarmManager.RTC_WAKEUP, atMs, 10 * 60_000L, pi)
        }
    }

    // ─── Ders zili: şu anki / sıradaki ders (B6) ───────────────────────────────

    private data class Lesson(val startMin: Int, val endMin: Int, val start: String, val end: String, val course: String, val room: String)

    private val LESSON_ACTIONS = listOf(
        Action("Program", deepLink = "elazigsehir://obs"),
        Action("Kapat", broadcast = ACTION_LESSON_LIVE_OFF),
    )

    private fun lessonTickIntent(context: Context): PendingIntent {
        val i = Intent(context, LessonLiveReceiver::class.java).apply { action = ACTION_LESSON_TICK }
        return PendingIntent.getBroadcast(context, LESSON_NOTIF_ID, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun setLessonLiveEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_LESSON_LIVE, enabled).apply()
        if (enabled) refreshLessonLive(context) else stopLessonLive(context)
    }

    fun isLessonLiveEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_LESSON_LIVE, false)

    fun stopLessonLive(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(lessonTickIntent(context))
        cancel(context, LESSON_NOTIF_ID)
    }

    /** lessons_json içinden verilen günün (0=Pazartesi) derslerini başlangıç saatine göre sıralı döndürür */
    private fun lessonsForDay(context: Context, dayIndex: Int): List<Lesson> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LESSONS_JSON, null) ?: return emptyList()
        return try {
            val arr = org.json.JSONArray(raw)
            val out = mutableListOf<Lesson>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                if (o.optInt("d", -1) != dayIndex) continue
                val s = o.optString("s")
                val e = o.optString("e")
                val sm = parseHm(s) ?: continue
                val em = parseHm(e) ?: (sm + 50)
                out.add(Lesson(sm, em, s, e, o.optString("c").ifBlank { "Ders" }, o.optString("r")))
            }
            out.sortedBy { it.startMin }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseHm(v: String?): Int? {
        val m = Regex("(\\d{1,2}):(\\d{2})").find(v ?: return null) ?: return null
        return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
    }

    private fun atMinute(base: Calendar, minuteOfDay: Int): Long = (base.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        add(Calendar.MINUTE, minuteOfDay)
    }.timeInMillis

    /**
     * Günün programından şu anki dersi (ongoing kronometre, bitişe kadar) ya da LESSON_LEAD_MIN içinde
     * başlayacak sıradaki dersi (başlangıca geri sayım) canlı bildirim olarak basar; ders geçişlerine
     * ve gün sonuna alarm kurar. Program yoksa (yayınlanmamış / OBS hesabı yok) bildirim gösterilmez.
     */
    fun refreshLessonLive(context: Context) {
        if (!isLessonLiveEnabled(context)) {
            stopLessonLive(context)
            return
        }
        val now = Calendar.getInstance()
        val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        val dayIndex = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7 // Pazartesi = 0
        val lessons = lessonsForDay(context, dayIndex)
        val pi = lessonTickIntent(context)
        val nowMs = System.currentTimeMillis()

        val current = lessons.firstOrNull { it.startMin <= nowMin && nowMin < it.endMin }
        val next = lessons.firstOrNull { it.startMin > nowMin }

        if (current != null) {
            val span = (current.endMin - current.startMin).coerceAtLeast(1)
            val progress = (((nowMin - current.startMin) * 100) / span).coerceIn(0, 100)
            val nextText = if (next != null) {
                " · sıradaki ${next.start} ${next.course}${if (next.room.isNotBlank()) " (${next.room})" else ""}"
            } else " · günün son dersi"
            post(
                context, LESSON_NOTIF_ID,
                Spec(
                    title = "Şu an: ${current.course}",
                    text = "${current.end}'e kadar${if (current.room.isNotBlank()) " · ${current.room}" else ""}$nextText",
                    subText = "${current.endMin - nowMin} dk kaldı",
                    shortText = "${current.endMin - nowMin} dk",
                    progress = progress,
                    chronometerEndMs = atMinute(now, current.endMin),
                    deepLink = "elazigsehir://obs",
                    actions = LESSON_ACTIONS,
                )
            )
            scheduleTick(context, pi, minOf(atMinute(now, current.endMin) + 30_000L, nextMinuteMs(nowMs)))
            return
        }

        if (next != null && next.startMin - nowMin <= LESSON_LEAD_MIN) {
            val remaining = next.startMin - nowMin
            val progress = (((LESSON_LEAD_MIN - remaining) * 100) / LESSON_LEAD_MIN).coerceIn(0, 100)
            val after = lessons.firstOrNull { it.startMin > next.startMin }
            post(
                context, LESSON_NOTIF_ID,
                Spec(
                    title = "Sıradaki ders ${next.start} · ${next.course}",
                    text = (if (next.room.isNotBlank()) "${next.room} · " else "") + "${next.start}–${next.end}" +
                        (if (after != null) " · sonra ${after.start} ${after.course}" else ""),
                    subText = "$remaining dk sonra başlıyor",
                    shortText = "$remaining dk",
                    progress = progress,
                    chronometerEndMs = atMinute(now, next.startMin),
                    deepLink = "elazigsehir://obs",
                    actions = LESSON_ACTIONS,
                )
            )
            scheduleTick(context, pi, minOf(atMinute(now, next.startMin) + 30_000L, nextMinuteMs(nowMs)))
            return
        }

        // Ders yok ya da henüz uzak: bildirimi kaldır, ilk ilgili ana alarm kur
        cancel(context, LESSON_NOTIF_ID)
        val wakeMs = if (next != null) atMinute(now, next.startMin - LESSON_LEAD_MIN) else atMinute(now, 24 * 60 + 5)
        scheduleTick(context, pi, maxOf(wakeMs, nowMs + 60_000L))
    }
}
