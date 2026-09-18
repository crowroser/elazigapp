package com.crowroser.elazigsehir

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Ders zili canlı bildiriminin AlarmManager tetikleyicisi (B6).
 * Ders başlangıç/bitişlerinde ve gün sonunda tetiklenir; şu anki / sıradaki dersi yeniden hesaplar.
 * Cihaz yeniden başlatılınca alarm silinir; uygulama bir sonraki açılışta (WidgetService.syncWidgets) yeniden kurar.
 */
class LessonLiveReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != LiveNotifications.ACTION_LESSON_TICK) return
        LiveNotifications.refreshLessonLive(context)
    }
}
