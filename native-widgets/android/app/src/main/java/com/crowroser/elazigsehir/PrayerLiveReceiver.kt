package com.crowroser.elazigsehir

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Namaz vakti canlı bildiriminin AlarmManager tetikleyicisi (L1).
 * Her tetiklemede sıradaki vakti yeniden hesaplar, bildirimi günceller ve bir sonraki alarmı kurar.
 * Cihaz yeniden başlatılınca alarm silinir; uygulama bir sonraki açılışta (WidgetService.syncWidgets) yeniden kurar.
 */
class PrayerLiveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != LiveNotifications.ACTION_PRAYER_TICK) return
        LiveNotifications.refreshPrayerLive(context)
    }
}
