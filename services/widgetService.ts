import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from './apiService';
import { PrefsService } from './prefsService';
import { BriefService } from './briefService';

const { WidgetDataModule } = NativeModules;

export interface WidgetData {
  prayer_name?: string;
  prayer_time?: string;
  prayer_countdown?: string;
  prayer_fajr?: string;
  prayer_sunrise?: string;
  prayer_dhuhr?: string;
  prayer_asr?: string;
  prayer_maghrib?: string;
  prayer_isha?: string;
  bus_line_name?: string;
  bus_stop_id?: string;
  bus_stop_name?: string;
  bus_eta?: string;
  bus_next_eta?: string;
  bus_age_text?: string;
  elkart_balance?: string;
  elkart_type?: string;
  news_title?: string;
  /** L2: Günün Özeti widget'ı (BriefService.toWidgetData) */
  brief_title?: string;
  brief_subtitle?: string;
  brief_icon_1?: string;
  brief_line_1?: string;
  brief_icon_2?: string;
  brief_line_2?: string;
  brief_icon_3?: string;
  brief_line_3?: string;
  brief_icon_4?: string;
  brief_line_4?: string;
  updated_at?: string;
}

const WIDGET_STORAGE_KEY = '@elazig_widget_config';

export const WidgetService = {
  /** Native widget modülü bu build'de var mı? (native-widgets klasörü managed build'e dahil değilse yok) */
  isNativeAvailable(): boolean {
    return Platform.OS === 'android' && !!WidgetDataModule && typeof WidgetDataModule.updateWidgetData === 'function';
  },

  async updateNativeWidgets(data: WidgetData): Promise<boolean> {
    const existing = await this.getWidgetData();
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
    try {
      await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Widget verisi kaydedilemedi:', e);
    }
    if (this.isNativeAvailable()) {
      try {
        WidgetDataModule.updateWidgetData(updated);
        return true;
      } catch (e) {
        console.warn('Native widget güncellenemedi:', e);
      }
    }
    return false;
  },

  /** Kayıtlı widget verisi — hiç senkron yapılmadıysa boş döner (uydurma varsayılan yok) */
  async getWidgetData(): Promise<WidgetData> {
    try {
      const stored = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Widget verisi okunamadı:', e);
    }
    return {};
  },

  /** Tüm widget verilerini canlı kaynaklardan çeker ve native katmana basar */
  async syncWidgets(): Promise<boolean> {
    try {
      const [prayer, news, cardNo, notifRaw] = await Promise.all([
        ApiService.getPrayerTimesAsync().catch(() => null),
        ApiService.getNews().catch(() => []),
        PrefsService.getElazigKartNo().catch(() => null),
        AsyncStorage.getItem('@elazig_notification_preferences').catch(() => null),
      ]);
      const next: WidgetData = {};

      if (prayer?.nextPrayer) {
        next.prayer_name = `Sıradaki: ${prayer.nextPrayer.nameTr}`;
        next.prayer_time = prayer.nextPrayer.time;
        const [h, m] = prayer.nextPrayer.time.split(':').map(Number);
        const now = new Date();
        let diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
        if (diff < 0) diff += 24 * 60;
        const diffH = Math.floor(diff / 60);
        const diffM = diff % 60;
        next.prayer_countdown = diffH > 0 ? `${diffH} sa ${diffM} dk kaldı` : `${diffM} dk kaldı`;

        for (const t of prayer.times) {
          if (t.name === 'Fajr') next.prayer_fajr = t.time;
          if (t.name === 'Sunrise') next.prayer_sunrise = t.time;
          if (t.name === 'Dhuhr') next.prayer_dhuhr = t.time;
          if (t.name === 'Asr') next.prayer_asr = t.time;
          if (t.name === 'Maghrib') next.prayer_maghrib = t.time;
          if (t.name === 'Isha') next.prayer_isha = t.time;
        }
      }

      if (news && news[0]) {
        next.news_title = news[0].title;
      }

      if (cardNo) {
        const bal = await ApiService.queryCardBalance(cardNo).catch(() => null);
        if (bal && bal.success) {
          next.elkart_balance = `${(bal.bakiye ?? 0).toFixed(2).replace('.', ',')} ₺`;
          next.elkart_type = 'ElazığKart';
        }
      }

      // Takip edilen hat & durak
      try {
        const prefs = notifRaw ? JSON.parse(notifRaw) : {};
        if (prefs.selectedRouteCode) {
          const routes = await ApiService.getAllRoutes().catch(() => []);
          const route = routes.find((r) => r.kod === prefs.selectedRouteCode);
          if (route) next.bus_line_name = `Hat ${route.hatNo} · ${route.aciklama}`;
        }
        const recentStops = await PrefsService.getRecentStops().catch(() => []);
        if (recentStops[0]) {
          const stations = await ApiService.getBusStations().catch(() => []);
          const st = stations.find((s) => s.name === recentStops[0]);
          if (st) {
            next.bus_stop_id = String(st.id);
            next.bus_stop_name = st.name;
            next.bus_age_text = 'Az önce';
            const approaching = await ApiService.getStationRemainingTime(st.id).catch(() => []);
            const target = approaching[0];
            if (target) {
              next.bus_eta = target.remainingTimeCurr != null ? `${target.remainingTimeCurr} dk` : '—';
              if (!next.bus_line_name) {
                next.bus_line_name = `Hat ${target.busLineNo} · ${target.busLineLongName || target.busLineCode}`;
              }
              const second = approaching[1];
              next.bus_next_eta = second?.remainingTimeCurr != null ? `${second.remainingTimeCurr} dk` : '';
            }
          }
        }
      } catch (e) {}

      // L2: Günün Özeti widget'ı (OBS'ye giriş yapmadan, önbellekten)
      try {
        const brief = await BriefService.buildBrief({ quick: true });
        Object.assign(next, BriefService.toWidgetData(brief));
      } catch (e) {}

      // Not: native updateWidgetData, namaz canlı geri sayımı (L1) açıksa onu da yeni vakitlerle tazeler
      return await this.updateNativeWidgets(next);
    } catch (e) {
      console.warn('[WidgetService] syncWidgets hatası:', e);
      return false;
    }
  },
};
