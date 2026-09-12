import { ApiService, RealtimeBusInfo, RouteScheduleItem } from './apiService';
import { cached } from './cacheService';

/** Bir saat dilimindeki planlı sefer sayısı (ElazığKart sefer tarifesinden) */
export interface HourlyStat {
  hour: number;
  hourLabel: string;
  departures: number;
  /** Günün ortalamasının 1.5 katından fazla sefer: sık sefer saati */
  isPeak: boolean;
  isCurrentHour: boolean;
}

export interface RouteDelayStats {
  routeCode: string;
  /** Canlı araç hızından türetilen akış durumu; araç yoksa 'veri_yok' */
  currentStatus: 'normal' | 'yavas' | 'veri_yok';
  statusLabel: string;
  statusColor: string;
  activeVehicleCount: number;
  movingVehicleCount: number;
  /** Hareket hâlindeki araçların ortalama hızı (km/sa); araç yoksa null */
  averageSpeedKph: number | null;
  /** Bugünkü tarifedeki ardışık kalkışlar arası ortalama süre (dk); tarife yoksa null */
  averageFrequencyMinutes: number | null;
  /** Bugünkü toplam planlı sefer sayısı */
  totalDepartures: number;
  hourlyStats: HourlyStat[];
  lastUpdated: string;
}

const SLOW_SPEED_KPH = 12;

function minutesOf(s: RouteScheduleItem): number | null {
  if (s.hour != null && s.minute != null) return s.hour * 60 + s.minute;
  const m = String(s.time || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

export const DelayStatsService = {
  /**
   * Bir hat için canlı akış durumu (araç sayısı ve hız) ve bugünkü sefer tarifesinden saatlik sefer yoğunluğu.
   * Tüm değerler ElazığKart canlı araç ve tarife verisinden hesaplanır; tahmini gecikme üretilmez.
   */
  async getRouteDelayStats(routeCode: string): Promise<RouteDelayStats> {
    const cacheKey = `route_stats_${routeCode}`;

    return (
      await cached<RouteDelayStats>(cacheKey, 3 * 60 * 1000, async () => {
        const jsDay = new Date().getDay();
        const weekday = jsDay === 0 ? 7 : jsDay;
        const [liveBuses, schedule] = await Promise.all([
          ApiService.getRealtimeBusData(routeCode).catch(() => [] as RealtimeBusInfo[]),
          ApiService.getRouteSchedule(routeCode, weekday, 'G').catch(() => [] as RouteScheduleItem[]),
        ]);

        // --- Canlı akış ---
        const moving = liveBuses.filter((b) => typeof b.hiz === 'number' && b.hiz > 3);
        const averageSpeedKph = moving.length > 0 ? Math.round(moving.reduce((a, b) => a + (b.hiz || 0), 0) / moving.length) : null;

        let currentStatus: RouteDelayStats['currentStatus'] = 'veri_yok';
        let statusLabel = 'Şu an seferde araç yok';
        let statusColor = '#6b7280';
        if (liveBuses.length > 0) {
          if (averageSpeedKph !== null && averageSpeedKph < SLOW_SPEED_KPH && moving.length >= Math.ceil(liveBuses.length / 2)) {
            currentStatus = 'yavas';
            statusLabel = `Yavaş akış (ort. ${averageSpeedKph} km/sa)`;
            statusColor = '#d97706';
          } else {
            currentStatus = 'normal';
            statusLabel = averageSpeedKph !== null ? `Normal akış (ort. ${averageSpeedKph} km/sa)` : 'Araçlar durakta';
            statusColor = '#16a34a';
          }
        }

        // --- Tarife: saatlik sefer sayısı ve ortalama kalkış aralığı ---
        const times = schedule
          .map(minutesOf)
          .filter((m): m is number => m !== null)
          .sort((a, b) => a - b);
        const perHour = new Map<number, number>();
        times.forEach((m) => {
          const h = Math.floor(m / 60);
          perHour.set(h, (perHour.get(h) || 0) + 1);
        });
        const hoursWithService = Array.from(perHour.keys());
        const firstHour = hoursWithService.length ? Math.min(6, ...hoursWithService) : 6;
        const lastHour = hoursWithService.length ? Math.max(23, ...hoursWithService) : 23;
        const avgPerHour = hoursWithService.length ? times.length / hoursWithService.length : 0;
        const currentHour = new Date().getHours();
        const hourlyStats: HourlyStat[] = [];
        for (let h = firstHour; h <= Math.min(23, lastHour); h++) {
          const departures = perHour.get(h) || 0;
          hourlyStats.push({
            hour: h,
            hourLabel: `${String(h).padStart(2, '0')}:00`,
            departures,
            isPeak: avgPerHour > 0 && departures >= avgPerHour * 1.5,
            isCurrentHour: h === currentHour,
          });
        }
        let averageFrequencyMinutes: number | null = null;
        if (times.length >= 2) {
          let gaps = 0;
          for (let i = 1; i < times.length; i++) gaps += times[i] - times[i - 1];
          averageFrequencyMinutes = Math.round(gaps / (times.length - 1));
        }

        return {
          routeCode,
          currentStatus,
          statusLabel,
          statusColor,
          activeVehicleCount: liveBuses.length,
          movingVehicleCount: moving.length,
          averageSpeedKph,
          averageFrequencyMinutes,
          totalDepartures: times.length,
          hourlyStats,
          lastUpdated: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        };
      })
    ).data;
  },
};
