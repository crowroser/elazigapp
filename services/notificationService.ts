import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from './apiService';
import { PrefsService } from './prefsService';
import { ObsService, diffGrades } from './obsService';
import { EventsService } from './eventsService';

/**
 * Yerel bildirimler altyapısı.
 * Sunucu gerekmez; tüm bildirimler cihazda zamanlanır.
 *
 * Kategoriler: lesson (ders), exam (sınav), prayer (namaz), balance (bakiye), grade (not değişikliği), event (etkinlik)
 */

// ─── Handler (uygulama açıkken bildirimi gösterme davranışı) ────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotifCategory = 'lesson' | 'exam' | 'prayer' | 'balance' | 'grade' | 'event';

export interface ScheduledItem {
  title: string;
  body: string;
  route?: string;
  trigger: Notifications.NotificationTriggerInput;
}

export interface NotifPreferences {
  lessonEnabled: boolean;
  lessonMinutesBefore: number;
  examEnabled: boolean;
  prayerEnabled: boolean;
  prayerMinutesBefore: number;
  balanceEnabled: boolean;
  balanceThreshold: number;
  gradeEnabled: boolean;
}

const DEFAULT_PREFS: NotifPreferences = {
  lessonEnabled: false,
  lessonMinutesBefore: 15,
  examEnabled: false,
  prayerEnabled: false,
  prayerMinutesBefore: 10,
  balanceEnabled: true,
  balanceThreshold: 20,
  gradeEnabled: true,
};

const PREFS_KEY = '@notif_preferences';
const LAST_SYNC_KEY = '@notif_last_sync';
const BALANCE_NOTIF_DATE_KEY = '@notif_balance_date';

// ─── Service ────────────────────────────────────────────────────────────────

export const NotificationService = {
  /** Bildirim izni kontrolü ve istek */
  async ensurePermission(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (!Device.isDevice) return false;

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  /** Bildirim tercihleri */
  async getPreferences(): Promise<NotifPreferences> {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  },

  async savePreferences(prefs: NotifPreferences): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  },

  /** Son senkron zamanı (6 saatten sık çalıştırmayı önlemek için) */
  async getLastSyncTime(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  },

  async setLastSyncTime(ts: number): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(ts));
    } catch {}
  },

  /** Bugün bakiye bildirimi gönderildi mi? (günde en fazla 1) */
  async wasBalanceNotifiedToday(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(BALANCE_NOTIF_DATE_KEY);
      if (!raw) return false;
      const today = new Date().toISOString().slice(0, 10);
      return raw === today;
    } catch {
      return false;
    }
  },

  async markBalanceNotifiedToday(): Promise<void> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await AsyncStorage.setItem(BALANCE_NOTIF_DATE_KEY, today);
    } catch {}
  },

  /**
   * Belirli bir kategorideki planlanmış bildirimleri iptal edip yenilerini zamanlama.
   * Aynı kategoriyi yeniden planlamadan önce eskilerini temizler.
   */
  async reschedule(category: NotifCategory, items: ScheduledItem[]): Promise<void> {
    try {
      // Eski planlamaları temizle
      const all = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        all
          .filter((n) => n.content.data?.category === category)
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
      );
      // Yenilerini planla
      for (const it of items) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: it.title,
            body: it.body,
            data: { category, route: it.route },
          },
          trigger: it.trigger,
        });
      }
    } catch {
      // Bildirim planlama hatası uygulamayı kırmasın
    }
  },

  /** Belirli bir kategorideki tüm planlanmış bildirimleri iptal et */
  async cancelCategory(category: NotifCategory): Promise<void> {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        all
          .filter((n) => n.content.data?.category === category)
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
      );
    } catch {}
  },

  /** Anlık bildirim gönder (ör. bakiye eşiğin altında, not değişikliği) */
  async sendImmediate(title: string, body: string, route?: string, category?: NotifCategory): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { category: category || 'grade', route },
        },
        trigger: null, // hemen gönder
      });
    } catch {}
  },

  /** Planlanmış toplam bildirim sayısını döner (debug/test için) */
  async getScheduledCount(): Promise<number> {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      return all.length;
    } catch {
      return 0;
    }
  },

  /** Kategori bazında planlanmış bildirim sayıları */
  async getScheduledCountByCategory(): Promise<Record<string, number>> {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const counts: Record<string, number> = {};
      for (const n of all) {
        const cat = (n.content.data?.category as string) || 'unknown';
        counts[cat] = (counts[cat] || 0) + 1;
      }
      return counts;
    } catch {
      return {};
    }
  },

  /**
   * Ders programından haftalık bildirimler planla.
   * Her ders başlangıcından `minutesBefore` dk önce tetiklenir.
   */
  async scheduleLessons(
    entries: { day: string; dayIndex: number; startTime: string; courseName: string; room: string }[],
    minutesBefore = 15
  ): Promise<void> {
    const items: ScheduledItem[] = [];
    for (const e of entries) {
      const [h, m] = e.startTime.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      // RN-compatible weekly trigger
      let triggerMin = m - minutesBefore;
      let triggerHour = h;
      if (triggerMin < 0) {
        triggerMin += 60;
        triggerHour -= 1;
      }
      if (triggerHour < 0) continue; // gece yarısı öncesi — atla

      // dayIndex: 0=Pazartesi → weekday: 2=Monday (JS 1=Sunday)
      const weekday = ((e.dayIndex + 1) % 7) + 1;

      items.push({
        title: `📚 ${e.courseName}`,
        body: `${minutesBefore} dk sonra · ${e.startTime} · ${e.room || 'Derslik belirtilmemiş'}`,
        route: '/obs',
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: triggerHour,
          minute: triggerMin,
        },
      });
    }
    await this.reschedule('lesson', items);
  },

  /**
   * Sınav takviminden bildirimler planla.
   * Sınavdan 1 gün önce (09:00) + 1 saat önce tetiklenir.
   */
  async scheduleExams(
    exams: { courseName: string; examName: string; date: string; room: string }[]
  ): Promise<void> {
    const items: ScheduledItem[] = [];
    const now = Date.now();

    for (const ex of exams) {
      // Tarih formatı: "DD.MM.YYYY HH:mm" veya "DD.MM.YYYY"
      const dateMatch = ex.date.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
      if (!dateMatch) continue;

      const [, dd, mm, yyyy, hh, mi] = dateMatch;
      const examDate = new Date(
        parseInt(yyyy),
        parseInt(mm) - 1,
        parseInt(dd),
        hh ? parseInt(hh) : 9,
        mi ? parseInt(mi) : 0
      );

      // 1 gün önce — sabah 09:00
      const dayBefore = new Date(examDate.getTime() - 24 * 60 * 60 * 1000);
      dayBefore.setHours(9, 0, 0, 0);
      if (dayBefore.getTime() > now) {
        items.push({
          title: `📝 Yarın sınav: ${ex.courseName}`,
          body: `${ex.examName} · ${ex.date}${ex.room ? ` · ${ex.room}` : ''}`,
          route: '/obs',
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore },
        });
      }

      // 1 saat önce
      const hourBefore = new Date(examDate.getTime() - 60 * 60 * 1000);
      if (hourBefore.getTime() > now) {
        items.push({
          title: `📝 1 saat sonra sınav: ${ex.courseName}`,
          body: `${ex.examName}${ex.room ? ` · ${ex.room}` : ''}`,
          route: '/obs',
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: hourBefore },
        });
      }
    }
    await this.reschedule('exam', items);
  },

  /**
   * Namaz vakitlerinden bildirimler planla (bugünün vakitleri için).
   * Her vakitten `minutesBefore` dk önce tetiklenir.
   */
  async schedulePrayers(
    times: { name: string; time: string; date?: Date }[],
    minutesBefore = 10
  ): Promise<void> {
    const items: ScheduledItem[] = [];
    const now = Date.now();
    const today = new Date();

    for (const p of times) {
      // Güneş (sunrise) ezan vakti değildir; bildirim gönderilmez (İmsak = sabah ezanı, kalır)
      if (/güneş|sunrise/i.test(p.name)) continue;
      const [h, m] = p.time.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const day = p.date || today;
      const prayerDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0);
      const triggerDate = new Date(prayerDate.getTime() - minutesBefore * 60 * 1000);

      if (triggerDate.getTime() > now) {
        items.push({
          title: `🕌 ${p.name} vakti yaklaşıyor`,
          body: `${p.time} · ${minutesBefore} dk sonra ezan okunacak`,
          route: undefined,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });
      }
    }
    await this.reschedule('prayer', items);
  },

  /**
   * Tüm bildirim kategorilerini ve zamanlamalarını senkronize eder.
   * _layout.tsx içinde uygulama açıldığında ve AppState 'active' olduğunda çağrılır.
   * 6 saatten sık çalışmayı engellemek için son zaman kontrol edilir (force=true hariç).
   */
  async syncAllSchedules(force = false): Promise<{ synced: boolean; reason?: string }> {
    const hasPerm = await this.ensurePermission();
    if (!hasPerm) return { synced: false, reason: 'İzin verilmedi' };

    const lastSync = await this.getLastSyncTime();
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (!force && Date.now() - lastSync < SIX_HOURS) {
      return { synced: false, reason: 'Son senkron üzerinden 6 saat geçmedi' };
    }

    const prefs = await this.getPreferences();

    // 1. Namaz vakitleri: bugün + yarın (uygulama yarın açılmasa da bildirimler planlı kalsın)
    if (prefs.prayerEnabled) {
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const [todayTimes, tomorrowTimes] = await Promise.all([
          ApiService.getPrayerTimesAsync(),
          ApiService.getPrayerTimesAsync(tomorrow).catch(() => null),
        ]);
        const list: { name: string; time: string; date?: Date }[] = [];
        todayTimes?.times?.forEach((p) => list.push({ name: p.nameTr || p.name, time: p.time }));
        tomorrowTimes?.times?.forEach((p) => list.push({ name: p.nameTr || p.name, time: p.time, date: tomorrow }));
        if (list.length > 0) await this.schedulePrayers(list, prefs.prayerMinutesBefore);
      } catch {}
    }

    // 2. Bakiye kontrolü (günde en fazla 1 kez)
    if (prefs.balanceEnabled) {
      try {
        const cardNo = await PrefsService.getElazigKartNo();
        if (cardNo) {
          const alreadyNotified = await this.wasBalanceNotifiedToday();
          if (!alreadyNotified) {
            const bRes = await ApiService.queryCardBalance(cardNo);
            if (bRes.success && bRes.bakiye != null && bRes.bakiye < (prefs.balanceThreshold || 20)) {
              await this.sendImmediate(
                'Düşük Bakiye Uyarısı',
                `ElazığKart bakiyeniz ₺${bRes.bakiye.toFixed(2)}, eşiğinizin altına düştü.`,
                '/(tabs)/index',
                'balance'
              );
              await this.markBalanceNotifiedToday();
            }
          }
        }
      } catch {}
    }

    // 3. OBS (Dersler, Sınavlar, Notlar)
    if (prefs.lessonEnabled || prefs.examEnabled || prefs.gradeEnabled) {
      try {
        const creds = await ObsService.getCredentials();
        if (creds) {
          const loggedIn = await ObsService.autoLogin();
          if (loggedIn) {
            // Ders programı
            if (prefs.lessonEnabled) {
              try {
                const tt = await ObsService.getTimetable();
                if (tt.entries && tt.entries.length > 0) {
                  await this.scheduleLessons(tt.entries, prefs.lessonMinutesBefore);
                }
              } catch {}
            }

            // Sınav takvimi
            if (prefs.examEnabled) {
              try {
                const ex = await ObsService.getExamSchedule();
                if (ex.groups && ex.groups.length > 0) {
                  const flatExams = ex.groups.flatMap((g) =>
                    g.exams.map((e) => ({
                      courseName: g.courseName || g.courseCode,
                      examName: e.examName,
                      date: e.date,
                      room: e.room,
                    }))
                  );
                  await this.scheduleExams(flatExams);
                }
              } catch {}
            }

            // Yeni not algılama (F8)
            if (prefs.gradeEnabled) {
              try {
                const gRes = await ObsService.getGrades();
                if (gRes.grades && gRes.grades.length > 0) {
                  const prevSnapshot = await PrefsService.getGradeSnapshot();
                  const { changes, snapshot } = diffGrades(prevSnapshot, gRes.grades, gRes.currentSemester);
                  await PrefsService.setGradeSnapshot(snapshot);
                  if (changes.length > 0) {
                    const currentUnseen = await PrefsService.getUnseenGrades();
                    await PrefsService.setUnseenGrades([...currentUnseen, ...changes]);

                    if (changes.length === 1) {
                      const c = changes[0];
                      await this.sendImmediate(
                        'Yeni Not Açıklandı',
                        `${c.courseCode} · ${c.label} açıklandı: ${c.newValue}`,
                        '/obs',
                        'grade'
                      );
                    } else {
                      await this.sendImmediate(
                        'Yeni Notlar Açıklandı',
                        `${changes.length} yeni ders notu/sınav sonucu açıklandı.`,
                        '/obs',
                        'grade'
                      );
                    }
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    // 4. Takip edilen etkinlikler (F12)
    try {
      const tracked = await PrefsService.getTrackedEvents();
      if (tracked.length > 0) {
        for (const item of tracked) {
          try {
            const { sessions } = await EventsService.getSessions(item.link);
            if (sessions && sessions.length > 0) {
              const firstSession = sessions[0];
              const currentPrice = firstSession.discountedPrice || firstSession.price;
              const remaining = firstSession.remainingTickets;
              const sessionDate = new Date(firstSession.date).getTime();

              // Fiyat indirimi
              if (item.lastPrice != null && currentPrice < item.lastPrice) {
                const discount = Math.round(((item.lastPrice - currentPrice) / item.lastPrice) * 100);
                await this.sendImmediate(
                  '🎟️ Fiyat İndirimi!',
                  `Takip ettiğiniz "${item.title}" etkinliğinde %${discount} indirim var! Yeni fiyat: ₺${currentPrice}`,
                  '/(tabs)/news',
                  'event'
                );
              }

              // Son biletler
              if (remaining != null && remaining > 0 && remaining <= 20 && (item.lastRemaining == null || item.lastRemaining > 20)) {
                await this.sendImmediate(
                  '🎟️ Son Biletler!',
                  `"${item.title}" için son ${remaining} bilet kaldı!`,
                  '/(tabs)/news',
                  'event'
                );
              }

              // Tükendi
              if (firstSession.isSoldOut && item.lastRemaining !== 0) {
                await this.sendImmediate(
                  '🎟️ Biletler Tükendi',
                  `"${item.title}" etkinliğinin tüm biletleri tükendi.`,
                  '/(tabs)/news',
                  'event'
                );
              }

              // Etkinlik yaklaştı (24 saat)
              const hoursLeft = (sessionDate - Date.now()) / (1000 * 60 * 60);
              if (hoursLeft > 0 && hoursLeft <= 24 && (!item.lastRemaining || hoursLeft > 23)) {
                await this.sendImmediate(
                  '🎟️ Etkinlik Yaklaşıyor',
                  `"${item.title}" yarın ${firstSession.venue} sahnesinde!`,
                  '/(tabs)/news',
                  'event'
                );
              }

              // Güncel durumu kaydet
              await PrefsService.updateTrackedEvent(item.slug, {
                lastPrice: currentPrice,
                lastRemaining: remaining ?? (firstSession.isSoldOut ? 0 : 999),
                sessionDate: firstSession.date,
              });
            }
          } catch {}
        }
      }
    } catch {}

    await this.setLastSyncTime(Date.now());
    return { synced: true };
  },
};
