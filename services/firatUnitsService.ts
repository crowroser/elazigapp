import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { FIRAT_UNITS, FiratUnit } from '../config/firatUnits';

/**
 * Fırat birim duyuru bildirimleri (uzaktan / anlık push).
 *
 * Mimari:
 *  - Kullanıcı `config/firatUnits.ts`'ten birim seçer → seçim topic listesine (`firat_<sub>`) çevrilir.
 *  - Cihazın FCM token'ı (expo-notifications getDevicePushTokenAsync) alınır.
 *  - {token, topics} arka uca (VPS) POST edilir. Arka uç token'ı ilgili topic'lere abone eder
 *    (firebase-admin) ve yeni duyuru geldiğinde o topic'e push atar.
 *
 * Not: Yerel/planlı bildirimler `notificationService.ts` içindedir; bu servis yalnızca
 * sunucudan gelen birim duyurularının aboneliğini yönetir.
 */

const SELECTED_KEY = '@firat_units_selected'; // string[] — seçili topic anahtarları
const TOKEN_KEY = '@firat_push_token';
const LAST_SYNC_KEY = '@firat_units_last_sync';
const PENDING_KEY = '@firat_units_sync_pending'; // backend yokken/başarısızken bekleyen senkron

/** Arka uç adresi. Tanımlı değilse senkron sessizce ertelenir (uygulama kırılmaz). */
const PUSH_API_URL = (process.env.EXPO_PUBLIC_PUSH_API_URL || '').replace(/\/+$/, '');

const ANDROID_CHANNEL_ID = 'firat-duyuru';

function appVersion(): string {
  return (
    Constants.expoConfig?.version ||
    (Constants as any).manifest?.version ||
    'dev'
  );
}

export const FiratUnitsService = {
  /** Android'de yüksek öncelikli duyuru kanalı (heads-up) oluşturur. */
  async ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Fırat Duyuruları',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch {}
  },

  /** Bildirim izni ister ve kanalı hazırlar. */
  async ensurePermission(): Promise<boolean> {
    if (Platform.OS === 'web' || !Device.isDevice) return false;
    await this.ensureChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  /** Cihazın FCM push token'ını döner (önbellekli). İzin yoksa null. */
  async getDeviceToken(): Promise<string | null> {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    try {
      const granted = await this.ensurePermission();
      if (!granted) return null;
      const { data } = await Notifications.getDevicePushTokenAsync();
      if (data) await AsyncStorage.setItem(TOKEN_KEY, data);
      return data ?? null;
    } catch {
      // Ağ/token hatası uygulamayı kırmasın
      try {
        return await AsyncStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    }
  },

  // ─── Seçim (yerel) ──────────────────────────────────────────────────────────

  /** Seçili topic anahtarları. */
  async getSelected(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(SELECTED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  /** Seçili birimleri (FiratUnit) döner. */
  async getSelectedUnits(): Promise<FiratUnit[]> {
    const topics = new Set(await this.getSelected());
    return FIRAT_UNITS.filter((u) => topics.has(u.topic));
  },

  /**
   * Seçimi kaydeder ve arka uca senkron eder.
   * @returns senkronun durumu: 'synced' | 'pending' (backend yok/başarısız) | 'no-permission'
   */
  async setSelected(topics: string[]): Promise<'synced' | 'pending' | 'no-permission'> {
    const unique = Array.from(new Set(topics));
    try {
      await AsyncStorage.setItem(SELECTED_KEY, JSON.stringify(unique));
    } catch {}
    return this.sync();
  },

  // ─── Arka uç senkronu ─────────────────────────────────────────────────────────

  /**
   * Geçerli seçimi + cihaz token'ını arka uca gönderir.
   * Backend URL tanımlı değilse veya istek başarısızsa "pending" işaretler; bir sonraki
   * uygulama açılışında `flushPending()` tekrar dener.
   */
  async sync(): Promise<'synced' | 'pending' | 'no-permission'> {
    const topics = await this.getSelected();
    const token = await this.getDeviceToken();
    if (!token) {
      await this._markPending(true);
      return 'no-permission';
    }
    if (!PUSH_API_URL) {
      await this._markPending(true);
      return 'pending';
    }
    try {
      const res = await fetch(`${PUSH_API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          topics,
          appVersion: appVersion(),
          updatedAt: Date.now(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      await this._markPending(false);
      return 'synced';
    } catch {
      await this._markPending(true);
      return 'pending';
    }
  },

  /** Uygulama açılışında bekleyen senkron varsa tekrar dener. */
  async flushPending(): Promise<void> {
    try {
      const pending = await AsyncStorage.getItem(PENDING_KEY);
      if (pending === '1') await this.sync();
    } catch {}
  },

  async _markPending(v: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PENDING_KEY, v ? '1' : '0');
    } catch {}
  },

  async getLastSync(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  },

  /** Backend yapılandırılmış mı? (UI'da bilgi göstermek için) */
  isBackendConfigured(): boolean {
    return !!PUSH_API_URL;
  },
};
