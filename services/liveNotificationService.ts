import { NativeModules, Platform } from 'react-native';

/**
 * Canlı bildirimler (L1) — Android 16 "Live Updates" / Samsung One UI Now Bar.
 *
 * Native köprü: native-widgets/.../LiveNotificationModule.kt
 *  - API 36+ : ProgressStyle + promoted ongoing → Now Bar, kilit ekranı ve durum çubuğu çipi
 *  - API <36 : klasik ongoing + progress bildirimi
 *  - Geri sayım (chronometer) sistem tarafından işletilir; uygulama arka plandayken de akar.
 *
 * Kullanım alanları:
 *  1. Otobüs varış takibi (ulaşım ekranı "Haber ver" ile birlikte)
 *  2. Namaz vaktine geri sayım (native AlarmManager kendini yeniler)
 */

const { LiveNotificationModule } = NativeModules;

export interface LiveSpec {
  title: string;
  text: string;
  subText?: string;
  /** Now Bar / durum çubuğu çipi — kısa tutun ("4 dk", "Akşam") */
  shortText?: string;
  /** 0..100 */
  progress?: number;
  indeterminate?: boolean;
  /** Epoch ms — bildirimde bu ana kadar geri sayım gösterilir */
  chronometerEndMs?: number;
  ongoing?: boolean;
  deepLink?: string;
  /** İlerleme çubuğu üzerindeki ara noktalar (0..100) */
  progressPoints?: number[];
}

export interface LiveCapabilities {
  sdk: number;
  /** Android 16+ (Live Updates API mevcut) */
  promoted: boolean;
  /** Kullanıcı "Canlı güncellemeler" iznini kapatmamış */
  canPostPromoted: boolean;
  prayerLiveEnabled: boolean;
  manufacturer: string;
}

export const BUS_LIVE_ID = 'bus_tracking';

export interface BusLiveInput {
  stopId: string;
  stopName: string;
  lineNo: string | number;
  lineName?: string;
  plate?: string | null;
  etaMin: number | null;
  stopsLeft: number | null;
}

/** Takip başlangıcındaki değerler: ilerleme yüzdesi buna göre hesaplanır */
let busBaseline: { key: string; etaMin: number | null; stopsLeft: number | null } | null = null;

export const LiveNotificationService = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!LiveNotificationModule && typeof LiveNotificationModule.show === 'function';
  },

  async getCapabilities(): Promise<LiveCapabilities | null> {
    if (!this.isAvailable()) return null;
    try {
      return await LiveNotificationModule.getCapabilities();
    } catch {
      return null;
    }
  },

  show(id: string, spec: LiveSpec): boolean {
    if (!this.isAvailable()) return false;
    try {
      LiveNotificationModule.show(id, spec);
      return true;
    } catch (e) {
      console.warn('[LiveNotification] show hatası:', e);
      return false;
    }
  },

  dismiss(id: string): void {
    if (!this.isAvailable()) return;
    try {
      LiveNotificationModule.dismiss(id);
    } catch {}
  },

  // ─── Otobüs canlı takibi ──────────────────────────────────────────────────

  /**
   * Durağa yaklaşan aracın güncel durumunu canlı bildirime yazar.
   * İlk çağrı takibin başlangıcı sayılır; ilerleme (kalan durak veya dakika) ona göre yüzdelenir.
   */
  updateBusLive(input: BusLiveInput): boolean {
    if (!this.isAvailable()) return false;
    const key = `${input.stopId}_${input.lineNo}_${input.plate || ''}`;
    if (!busBaseline || busBaseline.key !== key) {
      busBaseline = { key, etaMin: input.etaMin, stopsLeft: input.stopsLeft };
    }

    let progress: number | undefined;
    const points: number[] = [];
    if (input.stopsLeft != null && busBaseline.stopsLeft != null && busBaseline.stopsLeft > 0) {
      const total = Math.max(busBaseline.stopsLeft, input.stopsLeft);
      progress = Math.round(((total - input.stopsLeft) / total) * 100);
      // Kalan her durak için çubukta bir nokta (en fazla 8)
      for (let i = 1; i <= Math.min(total, 8); i++) points.push(Math.round((i / total) * 100));
    } else if (input.etaMin != null && busBaseline.etaMin != null && busBaseline.etaMin > 0) {
      const total = Math.max(busBaseline.etaMin, input.etaMin);
      progress = Math.round(((total - input.etaMin) / total) * 100);
    }

    const lineLabel = `Hat ${input.lineNo}`;
    const etaText = input.etaMin != null ? `${input.etaMin} dk` : '—';
    const stopsText = input.stopsLeft != null ? `${input.stopsLeft} durak` : null;
    const details = [stopsText, input.plate || null].filter(Boolean).join(' · ');

    return this.show(BUS_LIVE_ID, {
      title: `🚌 ${lineLabel} → ${input.stopName}`,
      text: details ? `${details} · ${input.lineName || ''}`.trim().replace(/ · $/, '') : input.lineName || 'Yaklaşıyor',
      subText: 'Canlı takip',
      shortText: etaText,
      progress,
      progressPoints: points,
      chronometerEndMs: input.etaMin != null && input.etaMin > 0 ? Date.now() + input.etaMin * 60_000 : undefined,
      ongoing: true,
      deepLink: `elazigsehir://transit?stopId=${encodeURIComponent(input.stopId)}`,
    });
  },

  /** Araç durağa vardı: son bir "vardı" bildirimi (ongoing değil) bırakır ve takibi sıfırlar */
  finishBusLive(input: Pick<BusLiveInput, 'lineNo' | 'stopName'>): void {
    busBaseline = null;
    if (!this.isAvailable()) return;
    this.show(BUS_LIVE_ID, {
      title: `🚌 Hat ${input.lineNo} durağa vardı`,
      text: input.stopName,
      shortText: 'Vardı',
      progress: 100,
      ongoing: false,
    });
  },

  stopBusLive(): void {
    busBaseline = null;
    this.dismiss(BUS_LIVE_ID);
  },

  // ─── Namaz vakti canlı geri sayımı ────────────────────────────────────────

  async setPrayerLiveEnabled(enabled: boolean): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      await LiveNotificationModule.setPrayerLiveEnabled(enabled);
      return true;
    } catch (e) {
      console.warn('[LiveNotification] namaz canlı bildirimi ayarlanamadı:', e);
      return false;
    }
  },

  /** Vakitler yeniden senkronlandığında çağrılır; özellik kapalıysa native tarafta no-op */
  refreshPrayerLive(): void {
    if (!this.isAvailable()) return;
    try {
      LiveNotificationModule.refreshPrayerLive();
    } catch {}
  },
};
