package com.crowroser.elazigsehir

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Canlı bildirim düğmeleri ("Kapat"). Kilit ekranından uygulama açılmadan çalışır; native tercihi kapatır,
 * JS tarafı (ayar ekranları) açılışta getCapabilities ile bu durumu tercihlerine yansıtır.
 */
class LiveActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            LiveNotifications.ACTION_PRAYER_LIVE_OFF -> LiveNotifications.setPrayerLiveEnabled(context, false)
            LiveNotifications.ACTION_LESSON_LIVE_OFF -> LiveNotifications.setLessonLiveEnabled(context, false)
        }
    }
}
