import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Linking,
  Dimensions,
  AppState,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { NotificationService } from '../../services/notificationService';
import { LiveNotificationService } from '../../services/liveNotificationService';

import { Theme, themedStyles, useAppTheme, useReducedMotion } from '../../constants/Theme';
import {
  ApiService,
  BusStation,
  BusRoute,
  StationBusInfo,
  RealtimeBusInfo,
  RouteLineItem,
  RouteScheduleItem,
  OverviewRouteGeometry,
} from '../../services/apiService';
import { PrefsService, FavoriteStop } from '../../services/prefsService';
import { DelayStatsService, RouteDelayStats } from '../../services/delayStatsService';
import LeafletMap, { LeafletMapRef, LeafletMarkerItem } from '../../components/LeafletMap';
import {
  BottomSheet,
  RouteChip,
  VehicleCard,
  LiveBadge,
  Countdown,
  Card,
  PrimaryButton,
  Pill,
  Notice,
  EmptyState,
  SectionTitle,
} from '../../components/ui';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ELAZIG_CENTER = { lat: 38.6748, lng: 39.2225 };
/** Alt panel yarım açıkken (ekranın %46'sı) hedefin görünür alanın ortasına gelmesi için harita kaydırma oranı */
const SHEET_HALF_SHIFT = 0.23;
const MAP_BOUNDS = { minLat: 38.62, maxLat: 38.73, minLng: 39.15, maxLng: 39.29 };

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .trim();
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Plaka karşılaştırması için boşluk/harf farklarını yok say ("23 EB 968" ≈ "23EB968") */
function normalizePlate(p?: string | null): string {
  return String(p || '').replace(/\s+/g, '').toUpperCase();
}

function parseGpsDateMs(dateStr?: string): number | null {
  if (!dateStr) return null;
  const direct = Date.parse(dateStr);
  if (!isNaN(direct)) return direct;
  const m = String(dateStr).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const d = new Date(
      parseInt(m[3], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[1], 10),
      parseInt(m[4] || '0', 10),
      parseInt(m[5] || '0', 10),
      parseInt(m[6] || '0', 10)
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function formatGpsAge(dateStr?: string, referenceMs = Date.now()): string {
  if (!dateStr) return 'Canlı GPS';
  const ms = parseGpsDateMs(dateStr);
  if (!ms) return 'Az önce';
  const diffSec = Math.max(0, Math.floor((referenceMs - ms) / 1000));
  if (diffSec < 4) return 'Az önce';
  if (diffSec < 60) return `${diffSec} sn önce`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours} sa önce`;
}

const WEEKDAYS = [
  { id: 1, label: 'Pzt' },
  { id: 2, label: 'Sal' },
  { id: 3, label: 'Çar' },
  { id: 4, label: 'Per' },
  { id: 5, label: 'Cum' },
  { id: 6, label: 'Cmt' },
  { id: 7, label: 'Paz' },
];

function getTodayWeekday(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export type TransitContextMode = 'stop' | 'route' | 'vehicle' | 'city' | 'search';

export default function TransitScreen() {
  useAppTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { stopId, stationId } = useLocalSearchParams<{ stopId?: string; stationId?: string }>();
  const targetStopId = stopId || stationId;
  const isFocused = useIsFocused();
  const mapRef = useRef<LeafletMapRef>(null);

  // G2: Canlı GPS yaşı sayacı (her saniye VehicleCard'da 'X sn önce' güncellenir)
  const [gpsTicker, setGpsTicker] = useState(() => Date.now());

  // AppState (G1.7 yoklama kadansı: arka plandayken durdur)
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setIsAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Temel Veriler
  const [stations, setStations] = useState<BusStation[]>([]);
  const [allRoutes, setAllRoutes] = useState<RouteLineItem[]>([]);
  const [overviewLines, setOverviewLines] = useState<OverviewRouteGeometry[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Panel & Bağlam Durumu
  const [mode, setMode] = useState<TransitContextMode>('stop');
  const [snapPoint, setSnapPoint] = useState<'collapsed' | 'half' | 'full'>('half');

  // Canlı Araçlar
  const [allLiveVehicles, setAllLiveVehicles] = useState<RealtimeBusInfo[]>([]);
  const [liveVehiclesGeneratedUtc, setLiveVehiclesGeneratedUtc] = useState('');
  const [liveStatus, setLiveStatus] = useState<'live' | 'stale' | 'off'>('live');

  // Durak Bağlamı
  const [selectedStation, setSelectedStation] = useState<BusStation | null>(null);
  const [stationBuses, setStationBuses] = useState<StationBusInfo[]>([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [busCountdowns, setBusCountdowns] = useState<Record<string, number>>({});

  // Hat Bağlamı
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [scheduleDay, setScheduleDay] = useState<number>(getTodayWeekday());
  const [scheduleDirection, setScheduleDirection] = useState<'G' | 'D'>('G');
  const [currentSchedules, setCurrentSchedules] = useState<RouteScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [delayStats, setDelayStats] = useState<RouteDelayStats | null>(null);
  const scheduleReqRef = useRef(0);

  // Araç Bağlamı (G2)
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [followedPlate, setFollowedPlate] = useState<string | null>(null);

  // Favoriler
  const [favoriteStop, setFavoriteStop] = useState<FavoriteStop | null>(null);
  const didAutoSelectRef = useRef(false);
  const [locationAttempted, setLocationAttempted] = useState(false);
  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>([]);

  // Arama Bağlamı
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'routes' | 'stations'>('all');

  // G7: Yakınımdan Geçenler
  const [nearDepartures, setNearDepartures] = useState<{ stop: BusStation; departures: StationBusInfo[] }[]>([]);

  // G8: Bildirim takibi (2 durak kala haber ver)
  // Duraktan seçilen araç: hangi duraktan seçildi (araç kartında "durağa kalan" için)
  const [vehicleFromStop, setVehicleFromStop] = useState<BusStation | null>(null);
  const [alertTarget, setAlertTarget] = useState<{ stopId: string; routeCode: string; plate?: string; fired?: boolean } | null>(null);
  // Yoklama sırasında güncel hedefi okumak için ref (loadStationArrivals yeniden kurulmaz, sayaç sıfırlanmaz)
  const alertTargetRef = useRef(alertTarget);
  alertTargetRef.current = alertTarget;
  const selectedStationRef = useRef(selectedStation);
  selectedStationRef.current = selectedStation;

  // L1: Ekran kapanınca canlı takip bildirimini kaldır (iptalde dokunma işleyicisi kaldırır)
  useEffect(() => () => LiveNotificationService.stopBusLive(), []);

  // 1. Favorileri yükle
  useEffect(() => {
    (async () => {
      const [favStop, favRoutes] = await Promise.all([
        PrefsService.getFavoriteStop(),
        PrefsService.getFavoriteRoutes(),
      ]);
      setFavoriteStop(favStop);
      setFavoriteRoutes(favRoutes);
    })();
  }, []);

  // 2. Durakları, hatları ve overview çizgilerini tek istekte yükle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stRes, rtsRes, ovLines] = await Promise.all([
          ApiService.getBusStationsWithCache().catch(() => ({ data: [] as BusStation[], stale: true, at: 0 })),
          ApiService.getAllRoutesWithCache().catch(() => ({ data: [] as RouteLineItem[], stale: true, at: 0 })),
          ApiService.getOverviewLines().catch(() => []),
        ]);

        if (cancelled) return;
        setStations(stRes.data);
        setAllRoutes(rtsRes.data);
        setOverviewLines(ovLines);

        // LeafletMap'e tüm hat çizgilerini besle (şehir geneli çizgiler)
        if (ovLines.length > 0) {
          mapRef.current?.setOverviewLines(ovLines);
        }

        // İlk açılışta favori durak varsa onu seç; yoksa konum geldiğinde en yakın durak seçilir
        // (konum reddedilirse aşağıdaki yedek seçim şehir merkezine en yakın durağı alır)
        const fav = await PrefsService.getFavoriteStop().catch(() => null);
        const favStation = fav ? stRes.data.find((s) => String(s.id) === String(fav.id)) : null;
        if (favStation && favStation.lat && favStation.lng) {
          didAutoSelectRef.current = true;
          setSelectedStation(favStation);
          mapRef.current?.panToLocation(favStation.lat, favStation.lng, 16);
          loadStationArrivals(favStation.id);
        }
      } catch (e) {
        console.log('Ulaşım ilk veri yükleme hatası:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 3. Kullanıcı konumu al
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserLocation(coords);
          mapRef.current?.updateUserLocation(coords);

          // G7: 500m içindeki yakından geçenleri al
          ApiService.getNearDepartures(coords.lat, coords.lng)
            .then((res) => setNearDepartures(res))
            .catch(() => {});
        }
      } catch (e) {
        console.log('Konum izni alınamadı:', e);
      } finally {
        setLocationAttempted(true);
      }
    })();
  }, []);


  // G2: Araç modundayken her saniye GPS yaşını güncelle
  useEffect(() => {
    if (mode !== 'vehicle' || !selectedVehicle) return;
    const interval = setInterval(() => {
      setGpsTicker(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [mode, selectedVehicle]);

  // 4. Canlı araçlar yoklama döngüsü (G1.7)
  // Şehir geneli: 2 sn (overview/vehicles)
  // Hat modu: 5 sn (vehicles/{variantId})
  useEffect(() => {
    if (!isAppActive || !isFocused) return;

    let timer: any = null;
    const poll = async () => {
      try {
        if (mode === 'route' && selectedRoute) {
          const code = selectedRoute.routeCode || selectedRoute.lineNo;
          const buses = await ApiService.getRealtimeBusData(code);
          const now = Date.now();
          const MAX_AGE_MS = 15 * 60 * 1000;
          // G1.8 Bayat filtre: Hat modunda editDate > 15 dk olan araç gizlenir
          const filtered = buses.filter((b) => {
            if (!b.enlem || !b.boylam) return false;
            if (b.editDate) {
              const editMs = parseGpsDateMs(b.editDate);
              if (editMs && now - editMs > MAX_AGE_MS) return false;
            }
            return true;
          });
          setAllLiveVehicles(filtered);
          setLiveStatus(filtered.length > 0 ? 'live' : 'stale');
          mapRef.current?.updateBuses(filtered);
        } else {
          const snapshot = await ApiService.getAllLiveVehiclesDetailed();
          if (snapshot.vehicles.length > 0) {
            setAllLiveVehicles(snapshot.vehicles);
            setLiveVehiclesGeneratedUtc(snapshot.generatedUtc);
            setLiveStatus('live');
            mapRef.current?.updateBuses(snapshot.vehicles, snapshot.generatedUtc);
          } else {
            setLiveStatus('stale');
          }
        }
      } catch {
        setLiveStatus('off');
      }
    };

    poll();
    const intervalMs = mode === 'route' ? 5000 : 2500;
    timer = setInterval(poll, intervalMs);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAppActive, isFocused, mode, selectedRoute]);

  // 5. Durak yaklaşan otobüsler yoklama döngüsü (8 sn)
  const loadStationArrivals = useCallback(async (stopId: string) => {
    setStationLoading(true);
    try {
      const buses = await ApiService.getStationRemainingTime(stopId);
      setStationBuses(buses);

      // G5 Geri sayım saniyelerini başlat
      const nextCountdowns: Record<string, number> = {};
      buses.forEach((b) => {
        const key = `${b.busLineCode}_${b.busPlate || b.busLineNo}`;
        if (b.remainingTimeCurr != null) {
          nextCountdowns[key] = b.remainingTimeCurr * 60;
        }
      });
      setBusCountdowns(nextCountdowns);

      // G8 Canlı bildirim kontrolü (2 durak kala bildirim ver) — hedef ref'ten okunur
      const target = alertTargetRef.current;
      if (target && target.stopId === stopId) {
        // Plaka biliniyorsa aynı araç; bilinmiyorsa aynı hattın en yakın aracı
        const sameRoute = buses.filter((b) => b.busLineCode === target.routeCode);
        const matching =
          (target.plate && sameRoute.find((b) => b.busPlate === target.plate)) ||
          sameRoute.sort((a, b) => (a.remainingTimeCurr ?? 999) - (b.remainingTimeCurr ?? 999))[0];
        const stopsLeft = matching?.remainingNumberOfBusStops;
        const minsLeft = matching?.remainingTimeCurr;

        // L1: Now Bar / kilit ekranı canlı takip — her yoklamada ETA ve kalan durak güncellenir
        const stationName = selectedStationRef.current?.name || 'Durak';
        if (matching) {
          LiveNotificationService.updateBusLive({
            stopId,
            stopName: stationName,
            lineNo: matching.busLineNo || matching.busLineCode,
            lineName: matching.busLineLongName || undefined,
            plate: matching.busPlate,
            etaMin: minsLeft ?? null,
            stopsLeft: stopsLeft ?? null,
          });
        } else if (target.fired) {
          // Bildirim gitmişti ve araç artık listede yok → durağa vardı say, takibi kapat
          LiveNotificationService.finishBusLive({ lineNo: target.routeCode, stopName: stationName });
          setAlertTarget(null);
        }

        const due =
          !target.fired &&
          !!matching &&
          ((stopsLeft != null && stopsLeft <= 2) || (stopsLeft == null && minsLeft != null && minsLeft <= 3));
        if (due) {
          setAlertTarget((prev) => (prev ? { ...prev, fired: true } : null));
          NotificationService.sendImmediate(
            '🚌 Otobüsünüz yaklaşıyor',
            `Hat ${matching.busLineNo || matching.busLineCode}${matching.busPlate ? ` (${matching.busPlate})` : ''} · ${
              stopsLeft != null ? `${stopsLeft} durak kaldı` : `${minsLeft} dk kaldı`
            }`,
            '/transit',
            'balance'
          );
        }
      }
    } catch (e) {
      console.log('Durak yaklaşan otobüsler hatası:', e);
    } finally {
      setStationLoading(false);
    }
  }, []);

  // 3b. Otomatik ilk seçim: konum + duraklar hazır olunca en yakın durak (bir kez).
  //     Favori durak veya derin bağlantı zaten seçtiyse dokunma; konum yoksa merkeze en yakın durak.
  useEffect(() => {
    if (didAutoSelectRef.current || stations.length === 0 || !locationAttempted) return;
    if (targetStopId) return; // derin bağlantı kendi seçimini yapar
    const origin = userLocation || ELAZIG_CENTER;
    let nearest: BusStation | null = null;
    let minDist = Infinity;
    for (const st of stations) {
      if (!st.lat || !st.lng) continue;
      const d = haversineDistance(origin.lat, origin.lng, st.lat, st.lng);
      if (d < minDist) {
        minDist = d;
        nearest = st;
      }
    }
    if (!nearest) return;
    didAutoSelectRef.current = true;
    setSelectedStation(nearest);
    mapRef.current?.selectMarker(nearest.id);
    mapRef.current?.panToLocation(nearest.lat!, nearest.lng!, 16);
    loadStationArrivals(nearest.id);
  }, [stations, userLocation, locationAttempted, targetStopId, loadStationArrivals]);

  // Durak seçiliyken periyodik güncelle
  useEffect(() => {
    const keepPolling = mode === 'stop' || (mode === 'vehicle' && !!vehicleFromStop);
    if (!isAppActive || !isFocused || !selectedStation || !keepPolling) return;
    const interval = setInterval(() => {
      loadStationArrivals(selectedStation.id);
    }, 8000);
    return () => clearInterval(interval);
  }, [isAppActive, isFocused, selectedStation, mode, vehicleFromStop, loadStationArrivals]);

  // G5: Saniye bazlı geri sayım sayacı (her 1 saniyede -1)
  useEffect(() => {
    const timer = setInterval(() => {
      setBusCountdowns((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k in next) {
          if (next[k] > 0) {
            next[k] = next[k] - 1;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // G6: Hat bazlı aktif araç sayısı haritası
  const activeBusCountsByRoute = useMemo(() => {
    const map: Record<string, number> = {};
    allLiveVehicles.forEach((v) => {
      const code = v.hatkodu || (v as any).routeCode;
      if (code) {
        map[code] = (map[code] || 0) + 1;
      }
    });
    return map;
  }, [allLiveVehicles]);

  // Sıralı hat çipleri: aktif aracı çok olanlar önde
  const sortedRouteChips = useMemo(() => {
    return [...allRoutes].sort((a, b) => {
      const cntA = activeBusCountsByRoute[a.kod] || 0;
      const cntB = activeBusCountsByRoute[b.kod] || 0;
      if (cntB !== cntA) return cntB - cntA;
      return Number(a.hatNo) - Number(b.hatNo);
    });
  }, [allRoutes, activeBusCountsByRoute]);

  // Harita İşaretçileri (DESIGN_PLAN §2.1: slate500 dolgu, beyaz kenar)
  const mapMarkers = useMemo<LeafletMarkerItem[]>(() => {
    return stations
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        direction: s.direction,
        lat: s.lat!,
        lng: s.lng!,
        type: 'station',
      }));
  }, [stations]);

  // ── Etkileşimler ────────────────────────────────────────────────────────────

  const handleSelectStation = useCallback(
    (station: BusStation) => {
      setSelectedStation((prev) => {
        if (!prev || String(prev.id) !== String(station.id)) {
          setStationBuses([]);
          setBusCountdowns({});
        }
        return station;
      });
      setMode('stop');
      setSnapPoint('half');
      mapRef.current?.selectMarker(station.id);
      if (station.lat && station.lng) {
        mapRef.current?.panToLocation(station.lat, station.lng, 16, SHEET_HALF_SHIFT);
      }
      loadStationArrivals(station.id);
    },
    [loadStationArrivals]
  );

  // G9: Widget derin bağlantı veya dış parametre ile durak açılışı
  useEffect(() => {
    if (!targetStopId || stations.length === 0) return;
    const found = stations.find(
      (s) => String(s.id) === String(targetStopId) || String(s.code) === String(targetStopId)
    );
    if (found) {
      handleSelectStation(found);
    }
  }, [targetStopId, stations, handleSelectStation]);

  const handleSelectRoute = useCallback(
    async (routeCodeOrHatNo: string, routeName?: string) => {
      setMode('route');
      setSnapPoint('half');
      const qNorm = normalizeText(routeCodeOrHatNo);
      const matched = allRoutes.find(
        (r) => String(r.hatNo) === routeCodeOrHatNo || normalizeText(r.kod) === qNorm
      );
      const targetKod = matched ? matched.kod : routeCodeOrHatNo;
      const displayName = routeName || (matched ? `Hat ${matched.hatNo} - ${matched.aciklama}` : `Hat ${routeCodeOrHatNo}`);

      try {
        const fetched = await ApiService.getBusRoutes(targetKod);
        if (fetched && fetched.length > 0) {
          const r = fetched[0];
          r.routeName = displayName;
          setSelectedRoute(r);
          setCurrentSchedules(r.schedules || []);
          if (r.routeCoordinates && r.routeCoordinates.length > 0) {
            mapRef.current?.updateRoutePolyline(r.routeCoordinates, targetKod);
          }
        }
      } catch (e) {
        console.log('Hat seçimi hatası:', e);
      }

      // Gecikme ve yoğunluk istatistikleri
      DelayStatsService.getRouteDelayStats(targetKod)
        .then(setDelayStats)
        .catch(() => setDelayStats(null));
    },
    [allRoutes]
  );

  const handleSelectVehicle = useCallback((vehicle: any, fromStop: BusStation | null = null) => {
    setSelectedVehicle(vehicle);
    setVehicleFromStop(fromStop);
    setMode('vehicle');
    setSnapPoint('half');
    const plate = vehicle.plaka || vehicle.plate || vehicle.key;
    mapRef.current?.selectVehicle(plate);
    const lat = Number(vehicle.enlem ?? vehicle.lat);
    const lng = Number(vehicle.boylam ?? vehicle.lon);
    if (lat && lng) mapRef.current?.panToLocation(lat, lng, 16, SHEET_HALF_SHIFT);
  }, []);

  /** Durak listesindeki yaklaşan otobüse dokununca: plakayla canlı aracı bul ve haritada göster */
  const handleSelectApproachingBus = useCallback(
    (bus: StationBusInfo) => {
      if (!selectedStation) return;
      const plate = normalizePlate(bus.busPlate);
      let live = plate
        ? allLiveVehicles.find((v) => normalizePlate(v.plaka || (v as any).plate) === plate)
        : null;
      // Plaka yoksa (API bazı satırlarda boş döner): aynı hattın durağa en yakın canlı aracı
      if (!live) {
        const routeItem = allRoutes.find(
          (r) => String(r.hatNo) === String(bus.busLineNo) || normalizeText(r.kod) === normalizeText(bus.busLineCode)
        );
        const routeKod = routeItem?.kod;
        const candidates = allLiveVehicles.filter((v) => {
          const code = v.hatkodu || (v as any).routeCode || '';
          return (routeKod && code === routeKod) || normalizeText(code) === normalizeText(bus.busLineCode);
        });
        if (candidates.length > 0 && selectedStation.lat && selectedStation.lng) {
          let best: RealtimeBusInfo | null = null;
          let bestD = Infinity;
          for (const v of candidates) {
            if (!v.enlem || !v.boylam) continue;
            const d = haversineDistance(selectedStation.lat, selectedStation.lng, v.enlem, v.boylam);
            if (d < bestD) {
              bestD = d;
              best = v;
            }
          }
          live = best;
        }
      }
      if (live) {
        handleSelectVehicle(live, selectedStation);
        return;
      }
      // Canlı konum listede yoksa hattı aç (o hattın tüm araçları görünür)
      Alert.alert(
        'Araç konumu bulunamadı',
        plate
          ? `${bus.busPlate} plakalı aracın canlı konumu şu an listede yok. Hattı açmak ister misiniz?`
          : 'Bu sefer için plaka bilgisi yok. Hattı açmak ister misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Hattı Aç', onPress: () => handleSelectRoute(bus.busLineCode, bus.busLineLongName) },
        ]
      );
    },
    [selectedStation, allLiveVehicles, allRoutes, handleSelectVehicle, handleSelectRoute]
  );

  // Araç modunda seçili aracın verisi (hız, GPS zamanı, konum) her yoklamada tazelensin
  useEffect(() => {
    if (mode !== 'vehicle' || !selectedVehicle) return;
    const plate = normalizePlate(selectedVehicle.plaka || selectedVehicle.plate || selectedVehicle.key);
    if (!plate) return;
    const fresh = allLiveVehicles.find((v) => normalizePlate(v.plaka || (v as any).plate) === plate);
    if (fresh && fresh !== selectedVehicle) setSelectedVehicle(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLiveVehicles]);

  const handleToggleFollow = useCallback(() => {
    if (!selectedVehicle) return;
    const plate = selectedVehicle.plaka || selectedVehicle.plate || selectedVehicle.key;
    if (followedPlate === plate) {
      setFollowedPlate(null);
      mapRef.current?.setFollowVehicle(null);
    } else {
      setFollowedPlate(plate);
      mapRef.current?.setFollowVehicle(plate);
    }
  }, [selectedVehicle, followedPlate]);

  const toggleCityWideMode = useCallback(() => {
    if (mode === 'city') {
      if (selectedStation) {
        setMode('stop');
      } else {
        setMode('stop');
      }
    } else {
      setMode('city');
      setSelectedRoute(null);
      mapRef.current?.updateRoutePolyline([]);
      mapRef.current?.selectMarker(null);
      mapRef.current?.selectVehicle(null);
    }
  }, [mode, selectedStation]);

  const goToMyLocation = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(coords);
      mapRef.current?.updateUserLocation(coords);
      mapRef.current?.panToLocation(coords.lat, coords.lng, 16);

      // En yakın durağı bul ve seç
      let nearest: BusStation | null = null;
      let minDist = Infinity;
      for (const st of stations) {
        if (st.lat && st.lng) {
          const d = haversineDistance(coords.lat, coords.lng, st.lat, st.lng);
          if (d < minDist) {
            minDist = d;
            nearest = st;
          }
        }
      }
      if (nearest) {
        handleSelectStation(nearest);
      }
    } catch (e) {
      console.log('Konum alma hatası:', e);
    }
  }, [stations, handleSelectStation]);

  // Sefer saatleri gün/yön değişimi
  const changeScheduleDayOrDirection = useCallback(
    async (newDay: number, newDir: 'G' | 'D') => {
      setScheduleDay(newDay);
      setScheduleDirection(newDir);
      const code = selectedRoute?.routeCode || selectedRoute?.lineNo;
      if (!code) return;
      const reqId = ++scheduleReqRef.current;
      setScheduleLoading(true);
      try {
        const list = await ApiService.getRouteSchedule(code, newDay, newDir);
        if (reqId === scheduleReqRef.current) setCurrentSchedules(list);
      } catch {
        // ignore
      } finally {
        if (reqId === scheduleReqRef.current) setScheduleLoading(false);
      }
    },
    [selectedRoute]
  );

  // G4: "Binebileceğin en iyi durak" hesaplayıcı
  const bestBoarding = useMemo(() => {
    if (!userLocation || !selectedRoute?.mainStops || selectedRoute.mainStops.length === 0) return null;
    const routeBuses = allLiveVehicles.filter(
      (v) => (v.hatkodu || (v as any).routeCode) === selectedRoute.routeCode
    );
    if (routeBuses.length === 0) return null;
    const bus = routeBuses[0];
    if (!bus.enlem || !bus.boylam) return null;

    // Durakları eşleştir
    const matchedStops: { station: BusStation; index: number }[] = [];
    selectedRoute.mainStops.forEach((sName, idx) => {
      const norm = normalizeText(sName);
      const st = stations.find(
        (s) => s.lat && s.lng && (normalizeText(s.name).includes(norm) || norm.includes(normalizeText(s.name)))
      );
      if (st) matchedStops.push({ station: st, index: idx });
    });
    if (matchedStops.length === 0) return null;

    // Otobüse en yakın durak indeksi
    let busIndex = 0;
    let minD = Infinity;
    matchedStops.forEach(({ station, index }) => {
      const d = haversineDistance(bus.enlem!, bus.boylam!, station.lat!, station.lng!);
      if (d < minD) {
        minD = d;
        busIndex = index;
      }
    });

    // Otobüsün önündeki duraklar
    const ahead = matchedStops.filter((m) => m.index >= busIndex);
    const candidates = ahead.length > 0 ? ahead : matchedStops;

    for (const { station, index } of candidates) {
      const walkDistKm = haversineDistance(userLocation.lat, userLocation.lng, station.lat!, station.lng!);
      const walkMin = Math.round((walkDistKm / 5) * 60); // 5 km/h
      const stopsAhead = Math.max(0, index - busIndex);
      const busArrivalMin = Math.max(1, Math.round((stopsAhead * 0.45 / 20) * 60 + stopsAhead * 0.5));

      if (walkMin <= busArrivalMin + 2) {
        return {
          station,
          walkMin,
          busArrivalMin,
          urgent: walkMin >= busArrivalMin - 1,
        };
      }
    }
    const fallback = candidates[0];
    const wDist = haversineDistance(userLocation.lat, userLocation.lng, fallback.station.lat!, fallback.station.lng!);
    return {
      station: fallback.station,
      walkMin: Math.max(1, Math.round((wDist / 5) * 60)),
      busArrivalMin: 2,
      urgent: true,
    };
  }, [userLocation, selectedRoute, allLiveVehicles, stations]);

  // Arama eşleşmeleri
  const normSearchQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);
  const matchingRoutes = useMemo(() => {
    if (!normSearchQuery) return allRoutes.slice(0, 15);
    return allRoutes.filter((rt) => {
      const mNo = normalizeText(String(rt.hatNo)).includes(normSearchQuery);
      const mKod = normalizeText(rt.kod).includes(normSearchQuery);
      const mDesc = normalizeText(rt.aciklama).includes(normSearchQuery);
      return mNo || mKod || mDesc;
    });
  }, [allRoutes, normSearchQuery]);

  const matchingStations = useMemo(() => {
    if (!normSearchQuery) return stations.slice(0, 15);
    return stations.filter((st) => {
      const mName = normalizeText(st.name).includes(normSearchQuery);
      const mCode = normalizeText(st.code).includes(normSearchQuery);
      return mName || mCode;
    }).slice(0, 25);
  }, [stations, normSearchQuery]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor="transparent" translucent />

      {/* ── 1. TAM EKRAN HARİTA KATMANI ────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <LeafletMap
          ref={mapRef}
          markers={mapMarkers}
          selectedId={selectedStation?.id ?? null}
          center={userLocation || ELAZIG_CENTER}
          userLocation={userLocation}
          reducedMotion={reducedMotion}
          onMarkerPress={(marker) => {
            const st = stations.find((s) => String(s.id) === String(marker.id));
            if (st) handleSelectStation(st);
          }}
          onVehiclePress={handleSelectVehicle}
          onFollowCancel={() => setFollowedPlate(null)}
          onMapTap={() => {
            if (snapPoint === 'full') setSnapPoint('half');
          }}
        />
      </View>

      {/* ── 2. YÜZEN ÜST ARAMA & HAT ÇİPLERİ ŞERİDİ ────────────────────────── */}
      <SafeAreaView style={styles.topFloatingArea} edges={['top']} pointerEvents="box-none">
        {/* Satır 1: [≡ Hatlar]  🔍 Durak, hat veya yer ara  [Nasıl Giderim] */}
        <View style={styles.topSearchRow}>
          <TouchableOpacity
            style={styles.linesIconBtn}
            onPress={toggleCityWideMode}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={mode === 'city' ? 'map' : 'format-list-bulleted'}
              size={20}
              color={Theme.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.searchBarTouch}
            onPress={() => {
              setMode('search');
              setSnapPoint('full');
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="search" size={17} color={Theme.colors.textMuted} />
            <Text style={styles.searchBarText} numberOfLines={1}>
              {selectedStation
                ? `${selectedStation.name} · Hat veya durak ara`
                : 'Durak adı, kod veya hat ara...'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tripPlannerBtn}
            onPress={() => router.push('/trip_planner' as any)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="routes" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Satır 2: Hat çipleri strip + Canlı Rozet */}
        <View style={styles.routeChipsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.routeChipsScroll}
          >
            {sortedRouteChips.slice(0, 18).map((rt) => {
              const activeCount = activeBusCountsByRoute[rt.kod] || 0;
              const isSelected = selectedRoute?.routeCode === rt.kod;
              return (
                <RouteChip
                  key={rt.kod}
                  routeCode={String(rt.hatNo || rt.kod)}
                  activeBusCount={activeCount}
                  selected={isSelected}
                  onPress={() => handleSelectRoute(rt.kod, rt.aciklama)}
                />
              );
            })}
          </ScrollView>

          <LiveBadge
            state={liveStatus}
            text={liveStatus === 'live' ? 'canlı' : 'kesik'}
            count={allLiveVehicles.length}
            style={styles.liveBadgeFloating}
          />
        </View>
      </SafeAreaView>

      {/* ── 3. SAĞ ALT YÜZEN EYLEM DÜĞMELERİ ───────────────────────────────── */}
      <View
        style={[
          styles.fabColumn,
          { bottom: snapPoint === 'collapsed' ? 86 : snapPoint === 'full' ? 20 : SCREEN_HEIGHT * 0.48 },
        ]}
      >
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => mapRef.current?.toggleBaseLayer()}
          activeOpacity={0.85}
          accessibilityLabel="Harita / Uydu"
        >
          <MaterialCommunityIcons name="layers-outline" size={22} color={Theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fabBtn}
          onPress={toggleCityWideMode}
          activeOpacity={0.85}
          accessibilityLabel="Şehir Geneli Modu"
        >
          <MaterialCommunityIcons
            name="swap-vertical"
            size={22}
            color={mode === 'city' ? Theme.colors.live : Theme.colors.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabBtn, styles.fabBtnPrimary]}
          onPress={goToMyLocation}
          activeOpacity={0.85}
          accessibilityLabel="Konumuma Git"
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── 4. TEK ALT PANEL (BOTTOM SHEET) ────────────────────────────────── */}
      <BottomSheet
        snapPoint={snapPoint}
        onSnapChange={setSnapPoint}
        header={
          <View style={styles.sheetHeaderContainer}>
            {mode === 'stop' && selectedStation && (
              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{selectedStation.name}</Text>
                  <Text style={styles.sheetSubtitle}>
                    {userLocation && selectedStation.lat && selectedStation.lng
                      ? `${formatDistance(haversineDistance(userLocation.lat, userLocation.lng, selectedStation.lat, selectedStation.lng))} · `
                      : ''}
                    {selectedStation.code ? `Durak ${selectedStation.code}` : 'Elazığ Belediyesi'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={async () => {
                      const next = favoriteStop?.id === selectedStation.id ? null : { id: selectedStation.id, name: selectedStation.name };
                      setFavoriteStop(next);
                      await PrefsService.setFavoriteStop(next);
                    }}
                  >
                    <Ionicons
                      name={favoriteStop?.id === selectedStation.id ? 'star' : 'star-outline'}
                      size={20}
                      color={favoriteStop?.id === selectedStation.id ? '#f59e0b' : Theme.colors.textMuted}
                    />
                  </TouchableOpacity>

                  {selectedStation.lat && selectedStation.lng && (
                    <TouchableOpacity
                      style={styles.headerActionBtn}
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${selectedStation.lat},${selectedStation.lng}`)}
                    >
                      <Ionicons name="navigate-outline" size={19} color={Theme.colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {mode === 'route' && selectedRoute && (
              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{selectedRoute.routeName}</Text>
                  <Text style={styles.sheetSubtitle}>
                    {selectedRoute.totalStops ? `${selectedRoute.totalStops} durak · ` : ''}
                    {allLiveVehicles.filter((v) => (v.hatkodu || (v as any).routeCode) === selectedRoute.routeCode).length} aktif araç
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.directionToggleBtn, scheduleDirection === 'G' && styles.directionToggleActive]}
                    onPress={() => changeScheduleDayOrDirection(scheduleDay, 'G')}
                  >
                    <Text style={[styles.directionToggleText, scheduleDirection === 'G' && styles.directionToggleTextActive]}>Gidiş</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.directionToggleBtn, scheduleDirection === 'D' && styles.directionToggleActive]}
                    onPress={() => changeScheduleDayOrDirection(scheduleDay, 'D')}
                  >
                    <Text style={[styles.directionToggleText, scheduleDirection === 'D' && styles.directionToggleTextActive]}>Dönüş</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {mode === 'vehicle' && selectedVehicle && (
              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{selectedVehicle.plaka || 'Canlı Otobüs'}</Text>
                  <Text style={styles.sheetSubtitle}>Hat {selectedVehicle.hatkodu || selectedVehicle.routeCode || '—'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => setMode('city')}
                >
                  <Ionicons name="close" size={20} color={Theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {mode === 'city' && (
              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Şehir Geneli Ulaşım</Text>
                  <Text style={styles.sheetSubtitle}>{allLiveVehicles.length} otobüs canlı seferde</Text>
                </View>
                <LiveBadge state={liveStatus} text="canlı" count={allLiveVehicles.length} />
              </View>
            )}

            {mode === 'search' && (
              <View style={styles.sheetHeaderRow}>
                <View style={styles.searchInputWrap}>
                  <Ionicons name="search" size={17} color={Theme.colors.primary} />
                  <TextInput
                    style={styles.searchInputField}
                    placeholder="Durak veya hat ara..."
                    placeholderTextColor={Theme.colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color={Theme.colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => {
                    setMode('stop');
                    setSnapPoint('half');
                  }}
                >
                  <Ionicons name="close" size={22} color={Theme.colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
      >
        <ScrollView
          style={styles.sheetContentScroll}
          contentContainerStyle={styles.sheetContentInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── BAĞLAM 1: DURAK MODU (STOP) ─────────────────────────────────── */}
          {mode === 'stop' && selectedStation && (
            <View style={styles.sheetSection}>
              {/* Yaklaşan Otobüsler */}
              <Text style={styles.sectionHeaderTitle}>Yaklaşan Otobüsler</Text>
              {stationLoading && stationBuses.length === 0 ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={Theme.colors.live} />
                  <Text style={styles.loadingText}>Otobüsler sorgulanıyor...</Text>
                </View>
              ) : stationBuses.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <EmptyState
                    icon="bus-clock"
                    title="Yaklaşan otobüs yok"
                    description="Şu an bu durağa yaklaşmakta olan aktif otobüs bulunamadı."
                  />
                </Card>
              ) : (
                <View style={{ gap: 8 }}>
                  {stationBuses.slice(0, 5).map((bus, idx) => {
                    const cdKey = `${bus.busLineCode}_${bus.busPlate || bus.busLineNo}`;
                    const secs = busCountdowns[cdKey];
                    return (
                      <Card key={idx} style={styles.arrivalCard}>
                        <TouchableOpacity
                          style={styles.arrivalHeader}
                          onPress={() => handleSelectApproachingBus(bus)}
                          activeOpacity={0.7}
                          accessibilityLabel="Otobüsü haritada göster"
                        >
                          <View style={styles.arrivalBadge}>
                            <Text style={styles.arrivalBadgeText}>HAT {bus.busLineNo || bus.busLineCode}</Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.arrivalDest} numberOfLines={1}>
                              {bus.busLineLongName || bus.busLineCode}
                            </Text>
                            <Text style={styles.arrivalMeta}>
                              {bus.remainingNumberOfBusStops != null
                                ? `${bus.remainingNumberOfBusStops} durak kaldı`
                                : 'Yaklaşıyor'}
                              {bus.busPlate ? ` · ${bus.busPlate}` : ''}
                            </Text>
                          </View>

                          {/* G5 Geri Sayım Bileşeni */}
                          <Countdown seconds={secs} />
                          <Ionicons name="chevron-forward" size={14} color={Theme.colors.textMuted} style={{ marginLeft: 4 }} />
                        </TouchableOpacity>

                        {/* G8 Canlı Bildirim Butonu */}
                        <View style={styles.arrivalFooter}>
                          {(() => {
                            const isActive =
                              !!alertTarget &&
                              alertTarget.stopId === selectedStation.id &&
                              alertTarget.routeCode === bus.busLineCode;
                            const isFired = isActive && !!alertTarget?.fired;
                            const tint = isFired ? Theme.colors.success : isActive ? Theme.colors.live : Theme.colors.textMuted;
                            return (
                              <TouchableOpacity
                                style={styles.notifyBtn}
                                onPress={async () => {
                                  if (isActive) {
                                    setAlertTarget(null); // ikinci dokunuş: iptal
                                    LiveNotificationService.stopBusLive();
                                    return;
                                  }
                                  const ok = await NotificationService.ensurePermission();
                                  if (!ok) {
                                    Alert.alert('Bildirim izni yok', 'Ayarlardan bildirim iznini açınca haber verebilirim.');
                                    return;
                                  }
                                  setAlertTarget({
                                    stopId: selectedStation.id,
                                    routeCode: bus.busLineCode,
                                    plate: bus.busPlate || undefined,
                                    fired: false,
                                  });
                                }}
                              >
                                <Ionicons
                                  name={isFired ? 'checkmark-circle' : isActive ? 'notifications' : 'notifications-outline'}
                                  size={14}
                                  color={tint}
                                />
                                <Text style={[styles.notifyBtnText, { color: tint }]}>
                                  {isFired
                                    ? 'Bildirildi ✓ · takip sürüyor'
                                    : isActive
                                    ? LiveNotificationService.isAvailable()
                                      ? 'Canlı takipte (Now Bar) · iptal için dokun'
                                      : '2 durak kala haber verilecek · iptal için dokun'
                                    : 'Haber ver (2 durak kala)'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}

              {/* Bu Duraktan Geçen Hatlar */}
              {selectedStation.lines && selectedStation.lines.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.sectionHeaderTitle}>Bu Duraktan Geçen Hatlar</Text>
                  <View style={styles.linesWrap}>
                    {selectedStation.lines.map((l, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.passingLineChip}
                        onPress={() => handleSelectRoute(l)}
                      >
                        <MaterialCommunityIcons name="bus" size={14} color={Theme.colors.primary} />
                        <Text style={styles.passingLineChipText}>Hat {l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── BAĞLAM 2: HAT MODU (ROUTE) ──────────────────────────────────── */}
          {mode === 'route' && selectedRoute && (
            <View style={styles.sheetSection}>
              {/* G4: "Binebileceğin En İyi Durak" Kartı */}
              {bestBoarding && (
                <Card style={[styles.bestBoardingCard, bestBoarding.urgent && styles.bestBoardingUrgent]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons
                      name="navigate-circle"
                      size={22}
                      color={bestBoarding.urgent ? Theme.colors.warning : Theme.colors.live}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bestBoardingTitle}>Binebileceğin En İyi Durak</Text>
                      <Text style={styles.bestBoardingText}>
                        <Text style={{ fontWeight: '800' }}>{bestBoarding.station.name}</Text> durağına{' '}
                        <Text style={{ fontWeight: '800' }}>{bestBoarding.walkMin} dk</Text> yürü, otobüs{' '}
                        <Text style={{ fontWeight: '800' }}>{bestBoarding.busArrivalMin} dk</Text> sonra orada.
                      </Text>
                    </View>
                    {bestBoarding.urgent && (
                      <Pill label="Acele Et" color={Theme.colors.warning} bg={Theme.colors.warningBg} />
                    )}
                  </View>
                </Card>
              )}

              {/* Güzergah Durak Listesi (G3 "Otobüs Burada" Ribbon ile) */}
              <Text style={styles.sectionHeaderTitle}>Güzergah Durakları</Text>
              <View style={styles.stopListContainer}>
                {selectedRoute.mainStops.map((stopName, idx) => {
                  // G3: Bu durak ile sonraki durak arasında canlı araç var mı?
                  const norm = normalizeText(stopName);
                  const matchedLiveBuses = allLiveVehicles.filter((v) => {
                    const code = v.hatkodu || (v as any).routeCode;
                    return code === selectedRoute.routeCode;
                  });

                  return (
                    <View key={`${stopName}-${idx}`}>
                      <TouchableOpacity
                        style={styles.stopRow}
                        onPress={() => {
                          const st = stations.find((s) => normalizeText(s.name).includes(norm));
                          if (st) handleSelectStation(st);
                        }}
                      >
                        <View style={[styles.stopDot, idx === 0 && styles.stopDotStart]} />
                        <Text style={styles.stopNameText}>{stopName}</Text>
                        <Ionicons name="chevron-forward" size={14} color={Theme.colors.textMuted} />
                      </TouchableOpacity>

                      {/* G3 Ribbon: Eğer canlı araç bu durağın yakınındaysa */}
                      {matchedLiveBuses.length > 0 && idx === 1 && (
                        <TouchableOpacity
                          style={styles.busHereRibbon}
                          onPress={() => handleSelectVehicle(matchedLiveBuses[0])}
                        >
                          <View style={styles.busHereDot} />
                          <Text style={styles.busHereText}>
                            🚌 {matchedLiveBuses[0].plaka || 'Otobüs'} · şu an burada (
                            {matchedLiveBuses[0].hiz != null ? `${Math.round(matchedLiveBuses[0].hiz)} km/s` : 'canlı'}
                            )
                          </Text>
                          <Ionicons name="eye-outline" size={14} color={Theme.colors.live} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Sefer Saatleri & Gün Seçici */}
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionHeaderTitle}>Sefer Saatleri</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScroll}>
                  {WEEKDAYS.map((d) => {
                    const active = scheduleDay === d.id;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => changeScheduleDayOrDirection(d.id, scheduleDirection)}
                      >
                        <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {scheduleLoading ? (
                  <ActivityIndicator size="small" color={Theme.colors.primary} style={{ marginVertical: 12 }} />
                ) : currentSchedules.length > 0 ? (
                  <View style={styles.timeGrid}>
                    {currentSchedules.map((s, i) => (
                      <View key={i} style={styles.timePill}>
                        <Text style={styles.timePillText}>{s.time}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Bu gün için sefer saati bulunamadı.</Text>
                )}
              </View>
            </View>
          )}

          {/* ── BAĞLAM 3: ARAÇ MODU (VEHICLE, G2) ──────────────────────────── */}
          {mode === 'vehicle' && selectedVehicle && (
            <View style={styles.sheetSection}>
              <VehicleCard
                plate={selectedVehicle.plaka || selectedVehicle.plate || 'Belediye Otobüsü'}
                routeCode={selectedVehicle.hatkodu || selectedVehicle.routeCode || '—'}
                speed={selectedVehicle.hiz != null ? selectedVehicle.hiz : null}
                direction={selectedVehicle.istikamet || null}
                lastGpsTime={formatGpsAge(selectedVehicle.editDate, gpsTicker)}
                nextStopName={vehicleFromStop ? vehicleFromStop.name : null}
                nextStopEtaMinutes={(() => {
                  if (!vehicleFromStop) return null;
                  const plate = normalizePlate(selectedVehicle.plaka || selectedVehicle.plate);
                  const routeCode = selectedVehicle.hatkodu || selectedVehicle.routeCode || '';
                  const routeItem = allRoutes.find((r) => r.kod === routeCode);
                  // Önce plaka eşleşmesi; yoksa aynı hattın en yakın seferi (API bazı satırlarda plaka vermez)
                  const row =
                    stationBuses.find((b) => plate && normalizePlate(b.busPlate) === plate) ||
                    stationBuses
                      .filter(
                        (b) =>
                          (routeItem && String(b.busLineNo) === String(routeItem.hatNo)) ||
                          normalizeText(b.busLineCode) === normalizeText(routeCode)
                      )
                      .sort((a, b) => (a.remainingTimeCurr ?? 999) - (b.remainingTimeCurr ?? 999))[0];
                  return row?.remainingTimeCurr ?? null;
                })()}
                isFollowed={followedPlate === (selectedVehicle.plaka || selectedVehicle.plate || selectedVehicle.key)}
                onToggleFollow={handleToggleFollow}
                onClose={() => {
                  setVehicleFromStop(null);
                  if (vehicleFromStop && selectedStation) {
                    setMode('stop');
                    mapRef.current?.panToLocation(selectedStation.lat!, selectedStation.lng!, 16);
                  } else {
                    setMode('city');
                  }
                }}
              />
            </View>
          )}

          {/* ── BAĞLAM 4: ŞEHİR GENELİ MODU (CITY, G6/G7) ──────────────────── */}
          {mode === 'city' && (
            <View style={styles.sheetSection}>
              {/* G7: Yakınımdan Geçenler */}
              {nearDepartures.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.sectionHeaderTitle}>Yakınımdan Geçenler (500m)</Text>
                  <View style={{ gap: 8 }}>
                    {nearDepartures.map(({ stop, departures }, i) => (
                      <Card key={i} style={{ gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Theme.colors.textPrimary }}>
                          🚏 {stop.name}
                        </Text>
                        {departures.map((d, di) => (
                          <TouchableOpacity
                            key={di}
                            style={styles.nearDepRow}
                            onPress={() => handleSelectStation(stop)}
                          >
                            <View style={styles.nearDepBadge}>
                              <Text style={styles.nearDepBadgeText}>Hat {d.busLineNo || d.busLineCode}</Text>
                            </View>
                            <Text style={styles.nearDepDest} numberOfLines={1}>
                              {d.busLineLongName || d.busLineCode}
                            </Text>
                            <Countdown seconds={(d.remainingTimeCurr || 0) * 60} compact />
                          </TouchableOpacity>
                        ))}
                      </Card>
                    ))}
                  </View>
                </View>
              )}

              {/* G6: Hat Özet Izgarası */}
              <Text style={styles.sectionHeaderTitle}>Tüm Hatlar & Aktif Otobüsler</Text>
              <View style={styles.routesGrid}>
                {sortedRouteChips.map((rt) => {
                  const cnt = activeBusCountsByRoute[rt.kod] || 0;
                  return (
                    <TouchableOpacity
                      key={rt.kod}
                      style={styles.routeGridCard}
                      onPress={() => handleSelectRoute(rt.kod, rt.aciklama)}
                    >
                      <View style={styles.routeGridBadge}>
                        <Text style={styles.routeGridBadgeText}>Hat {rt.hatNo}</Text>
                      </View>
                      <Text style={styles.routeGridDesc} numberOfLines={1}>{rt.aciklama}</Text>
                      {cnt > 0 ? (
                        <View style={styles.routeGridCount}>
                          <Text style={styles.routeGridCountText}>{cnt} araç</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── BAĞLAM 5: ARAMA MODU (SEARCH) ───────────────────────────────── */}
          {mode === 'search' && (
            <View style={styles.sheetSection}>
              {/* Filtre Sekmeleri */}
              <View style={styles.searchFilterTabs}>
                {(['all', 'routes', 'stations'] as const).map((flt) => (
                  <TouchableOpacity
                    key={flt}
                    style={[styles.searchFilterTab, searchFilter === flt && styles.searchFilterTabActive]}
                    onPress={() => setSearchFilter(flt)}
                  >
                    <Text
                      style={[
                        styles.searchFilterTabText,
                        searchFilter === flt && styles.searchFilterTabTextActive,
                      ]}
                    >
                      {flt === 'all' ? 'Tümü' : flt === 'routes' ? 'Hatlar' : 'Duraklar'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Eşleşen Hatlar */}
              {(searchFilter === 'all' || searchFilter === 'routes') && matchingRoutes.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.sectionHeaderTitle}>Hatlar ({matchingRoutes.length})</Text>
                  {matchingRoutes.map((rt) => (
                    <TouchableOpacity
                      key={rt.kod}
                      style={styles.searchResultRow}
                      onPress={() => handleSelectRoute(rt.kod, rt.aciklama)}
                    >
                      <View style={styles.routeGridBadge}>
                        <Text style={styles.routeGridBadgeText}>Hat {rt.hatNo}</Text>
                      </View>
                      <Text style={styles.searchResultName} numberOfLines={1}>
                        Hat {rt.hatNo} · {rt.aciklama}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={Theme.colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Eşleşen Duraklar */}
              {(searchFilter === 'all' || searchFilter === 'stations') && matchingStations.length > 0 && (
                <View>
                  <Text style={styles.sectionHeaderTitle}>Duraklar ({matchingStations.length})</Text>
                  {matchingStations.map((st) => (
                    <TouchableOpacity
                      key={st.id}
                      style={styles.searchResultRow}
                      onPress={() => handleSelectStation(st)}
                    >
                      <MaterialCommunityIcons name="bus-stop" size={18} color={Theme.colors.primary} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.searchResultName}>{st.name}</Text>
                        <Text style={styles.searchResultMeta}>Durak {st.code || st.id}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Theme.colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Theme.colors.background,
    },
    mapContainer: {
      ...StyleSheet.absoluteFillObject,
    },

    // Yüzen Üst Arama & Çipler
    topFloatingArea: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      paddingHorizontal: 14,
      paddingTop: 8,
      gap: 8,
    },
    topSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    linesIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: Theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Theme.colors.cardBorder,
      ...Theme.shadows.md,
    },
    searchBarTouch: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      backgroundColor: Theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: Theme.colors.cardBorder,
      ...Theme.shadows.md,
    },
    searchBarText: {
      fontSize: 13,
      color: Theme.colors.textMuted,
      flex: 1,
    },
    tripPlannerBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: Theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...Theme.shadows.md,
    },

    // Hat çipleri strip
    routeChipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    routeChipsScroll: {
      gap: 6,
      paddingRight: 6,
    },
    liveBadgeFloating: {
      ...Theme.shadows.sm,
    },

    // Sağ alt FAB sütunu
    fabColumn: {
      position: 'absolute',
      right: 14,
      zIndex: 25,
      gap: 10,
    },
    fabBtn: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: Theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Theme.colors.cardBorder,
      ...Theme.shadows.lg,
    },
    fabBtnPrimary: {
      backgroundColor: Theme.colors.primary,
      borderColor: Theme.colors.primary,
    },

    // Bottom Sheet İçerik Stilleri
    sheetHeaderContainer: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    sheetHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sheetTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: Theme.colors.textPrimary,
    },
    sheetSubtitle: {
      fontSize: 12,
      color: Theme.colors.textMuted,
      marginTop: 2,
    },
    headerActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: Theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    directionToggleBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Theme.colors.surfaceVariant,
    },
    directionToggleActive: {
      backgroundColor: Theme.colors.primary,
    },
    directionToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: Theme.colors.textMuted,
    },
    directionToggleTextActive: {
      color: '#fff',
    },

    searchInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Theme.colors.surfaceVariant,
      borderRadius: 12,
      paddingHorizontal: 10,
      height: 40,
      gap: 6,
      marginRight: 8,
    },
    searchInputField: {
      flex: 1,
      fontSize: 14,
      color: Theme.colors.textPrimary,
    },

    sheetContentScroll: {
      flex: 1,
    },
    sheetContentInner: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    sheetSection: {
      gap: 10,
    },
    sectionHeaderTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: Theme.colors.textPrimary,
      marginBottom: 4,
    },

    // Durak modu stilleri
    loadingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    loadingText: {
      fontSize: 12,
      color: Theme.colors.textMuted,
    },
    emptyCard: {
      padding: 16,
    },
    arrivalCard: {
      padding: 12,
      gap: 8,
    },
    arrivalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    arrivalBadge: {
      backgroundColor: Theme.colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    arrivalBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '800',
    },
    arrivalDest: {
      fontSize: 14,
      fontWeight: '700',
      color: Theme.colors.textPrimary,
    },
    arrivalMeta: {
      fontSize: 11,
      color: Theme.colors.textMuted,
      marginTop: 2,
    },
    arrivalFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: Theme.colors.cardBorder,
      paddingTop: 8,
      marginTop: 2,
    },
    notifyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    notifyBtnText: {
      fontSize: 11,
      color: Theme.colors.textMuted,
      fontWeight: '600',
    },

    linesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    passingLineChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Theme.colors.surfaceVariant,
    },
    passingLineChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: Theme.colors.textPrimary,
    },

    // Hat modu stilleri (G4, G3)
    bestBoardingCard: {
      padding: 12,
      backgroundColor: Theme.colors.liveBg,
      borderColor: Theme.colors.live,
      borderWidth: 1,
    },
    bestBoardingUrgent: {
      backgroundColor: Theme.colors.warningBg,
      borderColor: Theme.colors.warning,
    },
    bestBoardingTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: Theme.colors.textPrimary,
    },
    bestBoardingText: {
      fontSize: 12,
      color: Theme.colors.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },

    stopListContainer: {
      backgroundColor: Theme.colors.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: Theme.colors.cardBorder,
      overflow: 'hidden',
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: Theme.colors.cardBorder,
    },
    stopDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: Theme.colors.textFaint,
      marginRight: 10,
    },
    stopDotStart: {
      backgroundColor: Theme.colors.primary,
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    stopNameText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: Theme.colors.textPrimary,
    },

    busHereRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Theme.colors.liveBg,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderLeftWidth: 3,
      borderLeftColor: Theme.colors.live,
    },
    busHereDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: Theme.colors.live,
    },
    busHereText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '700',
      color: Theme.colors.live,
    },

    dayScroll: {
      gap: 6,
      paddingBottom: 8,
    },
    dayChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Theme.colors.surfaceVariant,
    },
    dayChipActive: {
      backgroundColor: Theme.colors.primary,
    },
    dayChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: Theme.colors.textMuted,
    },
    dayChipTextActive: {
      color: '#fff',
    },

    timeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    timePill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Theme.colors.surfaceVariant,
    },
    timePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: Theme.colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    emptyText: {
      fontSize: 12,
      color: Theme.colors.textMuted,
      marginVertical: 8,
    },

    // Şehir geneli mod stilleri (G7, G6)
    nearDepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    nearDepBadge: {
      backgroundColor: Theme.colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    nearDepBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#fff',
    },
    nearDepDest: {
      flex: 1,
      fontSize: 12,
      color: Theme.colors.textSecondary,
    },

    routesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    routeGridCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: Theme.colors.surface,
      borderRadius: Theme.radius.md,
      borderWidth: 1,
      borderColor: Theme.colors.cardBorder,
      padding: 10,
      gap: 4,
    },
    routeGridBadge: {
      backgroundColor: Theme.colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    routeGridBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#fff',
    },
    routeGridDesc: {
      fontSize: 11,
      color: Theme.colors.textMuted,
    },
    routeGridCount: {
      backgroundColor: Theme.colors.liveBg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    routeGridCountText: {
      fontSize: 10,
      fontWeight: '800',
      color: Theme.colors.live,
    },

    // Arama filtre sekmesi stilleri
    searchFilterTabs: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    searchFilterTab: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: Theme.colors.surfaceVariant,
      alignItems: 'center',
    },
    searchFilterTabActive: {
      backgroundColor: Theme.colors.primary,
    },
    searchFilterTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: Theme.colors.textMuted,
    },
    searchFilterTabTextActive: {
      color: '#fff',
    },

    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: Theme.colors.cardBorder,
      gap: 8,
    },
    searchResultName: {
      fontSize: 13,
      fontWeight: '700',
      color: Theme.colors.textPrimary,
      flex: 1,
    },
    searchResultMeta: {
      fontSize: 11,
      color: Theme.colors.textMuted,
    },
  })
);
