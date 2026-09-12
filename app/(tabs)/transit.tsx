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
  Platform,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import {
  ApiService,
  BusStation,
  BusRoute,
  CardBalanceResult,
  StationBusInfo,
  RealtimeBusInfo,
  RouteLineItem,
  RouteScheduleItem,
} from '../../services/apiService';
import { CardQueryModal } from '../../components/CardQueryModal';
import { AuthProfileModal } from '../../components/AuthProfileModal';
import { AuthService, UserProfile } from '../../services/authService';
import { PrefsService, FavoriteStop } from '../../services/prefsService';
import { DelayStatsService, RouteDelayStats } from '../../services/delayStatsService';
import { auth } from '../../config/firebase';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { buildLeafletHtml } from '../../components/LeafletMap';
import { formatLastUpdated } from '../../services/cacheService';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const ELAZIG_CENTER = { lat: 38.6745, lng: 39.2205 };
const MAP_BOUNDS = {
  minLat: 38.62,
  maxLat: 38.73,
  minLng: 39.15,
  maxLng: 39.29,
};

const BUS_COLORS = ['#1A365D', '#3182CE', '#2D3748', '#0061a5', '#0f766e', '#7c3aed', '#b45309'];

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

function projectToScreen(lat: number, lng: number): { left: `${number}%`; top: `${number}%` } {
  const x = Math.max(4, Math.min(92, ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100));
  const y = Math.max(6, Math.min(88, ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100));
  return {
    left: `${x}%` as `${number}%`,
    top: `${y}%` as `${number}%`,
  };
}

function getBusColor(hatkodu?: string, index = 0): string {
  if (!hatkodu) return BUS_COLORS[index % BUS_COLORS.length];
  let hash = 0;
  for (let i = 0; i < hatkodu.length; i++) hash = (hash + hatkodu.charCodeAt(i) * (i + 1)) % 997;
  return BUS_COLORS[hash % BUS_COLORS.length];
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m mesafede`;
  return `${km.toFixed(1)} km mesafede`;
}

const WEEKDAYS = [
  { id: 1, label: 'Pzt', full: 'Pazartesi' },
  { id: 2, label: 'Sal', full: 'Salı' },
  { id: 3, label: 'Çar', full: 'Çarşamba' },
  { id: 4, label: 'Per', full: 'Perşembe' },
  { id: 5, label: 'Cum', full: 'Cuma' },
  { id: 6, label: 'Cmt', full: 'Cumartesi' },
  { id: 7, label: 'Paz', full: 'Pazar' },
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

export default function TransitScreen() {
  useAppTheme();
  const [stations, setStations] = useState<BusStation[]>([]);
  const [nearbyStations, setNearbyStations] = useState<BusStation[]>([]);
  const [allRoutes, setAllRoutes] = useState<RouteLineItem[]>([]);
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [liveBuses, setLiveBuses] = useState<RealtimeBusInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitStale, setTransitStale] = useState(false);
  const [transitAt, setTransitAt] = useState(0);
  const [selectedStation, setSelectedStation] = useState<BusStation | null>(null);
  const [stationBuses, setStationBuses] = useState<StationBusInfo[]>([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState(ELAZIG_CENTER);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'stations' | 'routes'>('all');
  const [showRoutesPanel, setShowRoutesPanel] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [scheduleDay, setScheduleDay] = useState<number>(getTodayWeekday());
  const [scheduleDirection, setScheduleDirection] = useState<'G' | 'D'>('G');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [currentSchedules, setCurrentSchedules] = useState<RouteScheduleItem[]>([]);
  const [favoriteStop, setFavoriteStop] = useState<FavoriteStop | null>(null);
  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>([]);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const router = useRouter();
  const [delayStats, setDelayStats] = useState<RouteDelayStats | null>(null);

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

  const toggleFavoriteStop = useCallback(
    async (station: BusStation) => {
      const isFav = favoriteStop?.id === station.id;
      const nextFav: FavoriteStop | null = isFav ? null : { id: station.id, name: station.name };
      setFavoriteStop(nextFav);
      await PrefsService.setFavoriteStop(nextFav);
      const uid = auth.currentUser?.uid;
      if (uid) {
        AuthService.updateUserProfile(uid, { favoriteStop: nextFav }).catch(() => {});
      }
    },
    [favoriteStop]
  );

  const toggleFavoriteRoute = useCallback(
    async (routeCode: string) => {
      const updated = await PrefsService.toggleFavoriteRoute(routeCode);
      setFavoriteRoutes(updated);
      const uid = auth.currentUser?.uid;
      if (uid) {
        AuthService.updateUserProfile(uid, { favoriteRoutes: updated }).catch(() => {});
      }
    },
    []
  );
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cardInfo, setCardInfo] = useState<CardBalanceResult>({ success: false });
  const [refreshingBuses, setRefreshingBuses] = useState(false);
  // Şehir geneli canlı mod: haritada boş yere dokununca tüm otobüsler
  const [cityLive, setCityLive] = useState(false);
  const cityLiveRef = useRef(false);
  // Hızlı gün/yön geçişlerinde eski yanıtın yenisini ezmemesi için istek sıra numarası
  const scheduleReqRef = useRef(0);
  const statsReqRef = useRef(0); // hızlı hat değişiminde eski hattın istatistiği yeni hatta görünmesin

  const enterCityLive = useCallback(async () => {
    cityLiveRef.current = true;
    setCityLive(true);
    setSheetExpanded(false);
    setShowRoutesPanel(false);
    setShowSearch(false);
    setSelectedRoute(null);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if (window.updateRoutePolyline) { window.updateRoutePolyline([]); } true;`);
    }
    const all = await ApiService.getAllLiveVehicles();
    if (cityLiveRef.current) setLiveBuses(all);
  }, []);

  const exitCityLive = useCallback(() => {
    cityLiveRef.current = false;
    setCityLive(false);
  }, []);

  // Canlı modda 5 sn'de bir tüm araçları yenile
  useEffect(() => {
    if (!cityLive) return;
    const t = setInterval(async () => {
      const all = await ApiService.getAllLiveVehicles();
      if (cityLiveRef.current) setLiveBuses(all);
    }, 5000);
    return () => clearInterval(t);
  }, [cityLive]);

  const sheetAnim = useRef(new Animated.Value(1)).current;
  const iframeRef = useRef<any>(null);
  const webViewRef = useRef<WebView>(null);
  const isMapReadyRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const didAutoSelectRef = useRef(false);
  const didLocateSelectRef = useRef(false);

  const recordStopSearch = (stopName: string) => {
    AuthService.addRecentBusStop(auth.currentUser?.uid || null, stopName);
  };

  const recordRouteSearch = (routeName: string) => {
    AuthService.addRecentBusRoute(auth.currentUser?.uid || null, routeName);
  };

  const syncUserLocationToMap = useCallback((coords: { lat: number; lng: number }, pan = true) => {
    if (webViewRef.current && isMapReadyRef.current) {
      webViewRef.current.injectJavaScript(
        `if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(coords)}); }
         ${pan ? `if (window.panToLocation) { window.panToLocation(${coords.lat}, ${coords.lng}, 15); }` : ''}
         true;`
      );
    }
  }, []);

  const loadLiveBuses = useCallback(async (targetRouteCode?: string) => {
    if (cityLiveRef.current) return;
    setRefreshingBuses(true);
    try {
      let code = targetRouteCode || selectedRoute?.routeCode || (stationBuses.length > 0 ? stationBuses[0].busLineCode : '') || (allRoutes.length > 0 ? allRoutes[0].kod : '');
      if (code) {
        const buses = await ApiService.getRealtimeBusData(code);
        const filtered = buses.filter((b) => b.enlem && b.boylam);
        setLiveBuses(filtered);
      }
    } catch (e) {
      console.log('Canlı otobüs yükleme hatası:', e);
    }
    setRefreshingBuses(false);
  }, [selectedRoute, stationBuses, allRoutes]);

  const loadStationDetail = useCallback(async (station: BusStation, isBackgroundUpdate = false, panMap = true) => {
    if (isBackgroundUpdate && cityLiveRef.current) return;
    if (!isBackgroundUpdate) exitCityLive();
    setSelectedStation(station);
    if (panMap) {
      setSheetExpanded(true);
    }
    setShowRoutesPanel(false);
    if (!isBackgroundUpdate) {
      setStationLoading(true);
    }
    recordStopSearch(station.name);

    if (!isBackgroundUpdate && panMap && station.lat && station.lng) {
      setMapCenter({ lat: station.lat, lng: station.lng });
      if (webViewRef.current && isMapReadyRef.current) {
        webViewRef.current.injectJavaScript(
          `if (window.panToLocation) { window.panToLocation(${station.lat}, ${station.lng}, 16); } true;`
        );
      }
    }

    try {
      const [buses, stationRoutes] = await Promise.all([
        ApiService.getStationRemainingTime(station.id),
        // Duraktan geçen hatlar (ilk açılışta; arka plan yenilemede tekrar çekmeye gerek yok)
        isBackgroundUpdate || station.lines.length > 0
          ? Promise.resolve<RouteLineItem[]>([])
          : ApiService.getStationRoutes(station.id),
      ]);
      setStationBuses(buses);

      if (stationRoutes.length > 0) {
        const lines = stationRoutes.map((r) => `${r.hatNo} ${r.kod}`.trim());
        setSelectedStation((prev) => (prev && prev.id === station.id ? { ...prev, lines } : prev));
        setStations((prev) => prev.map((s) => (s.id === station.id ? { ...s, lines } : s)));
        setNearbyStations((prev) => prev.map((s) => (s.id === station.id ? { ...s, lines } : s)));
      }

      if (buses.length > 0 && buses[0].busLineCode) {
        const live = await ApiService.getRealtimeBusData(buses[0].busLineCode);
        setLiveBuses(live.filter((b) => b.enlem && b.boylam));
      }
    } catch (e) {
      console.log('Durak detay yükleme hatası:', e);
    }
    setStationLoading(false);
  }, []);

  const loadRouteDetail = useCallback(async (routeCodeOrHatNo: string, routeName?: string) => {
    exitCityLive();
    setRefreshingBuses(true);
    setShowRoutesPanel(true);
    setShowSearch(false);

    // Hat kodunu çöz (kullanıcı hat no veya kod vermiş olabilir)
    const qNorm = normalizeText(routeCodeOrHatNo);
    const matched = allRoutes.find(
      (r) => String(r.hatNo) === routeCodeOrHatNo || normalizeText(r.kod) === qNorm
    );
    const targetKod = matched ? matched.kod : routeCodeOrHatNo;
    const displayName = routeName || (matched ? `Hat ${matched.hatNo} - ${matched.aciklama}` : `Hat ${routeCodeOrHatNo}`);
    recordRouteSearch(displayName);

    // 1. Canlı otobüsleri seçili hat bazlı belediye API'sinden çek
    try {
      const liveRouteBuses = await ApiService.getRealtimeBusData(targetKod);
      const filtered = liveRouteBuses.filter((b) => b.enlem && b.boylam);
      setLiveBuses(filtered);

      if (filtered.length > 0 && filtered[0].enlem && filtered[0].boylam) {
        setMapCenter({ lat: filtered[0].enlem, lng: filtered[0].boylam });
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if (window.panToLocation) { window.panToLocation(${filtered[0].enlem}, ${filtered[0].boylam}); } true;`
          );
        }
      }
    } catch (e) {
      console.log('Hat canlı otobüs yükleme hatası:', e);
    }
    setRefreshingBuses(false);

    // 2. Hat detaylarını (duraklar, sefer saatleri, fiyat ve polyline koordinatları) çek
    try {
      let existingRoute = routes.find((r) => r.routeCode === targetKod || r.lineNo === targetKod);
      if (!existingRoute || !existingRoute.mainStops || existingRoute.mainStops.length === 0) {
        const fetched = await ApiService.getBusRoutes(targetKod);
        if (fetched && fetched.length > 0) {
          existingRoute = fetched[0];
          existingRoute.routeName = displayName;
          setRoutes((prev) => [fetched[0], ...prev.filter((p) => p.routeCode !== targetKod && p.lineNo !== targetKod)]);
        }
      }

      if (existingRoute) {
        setSelectedRoute(existingRoute);
        scheduleReqRef.current++; // önceki hattın bekleyen sefer isteğini geçersiz kıl
        setScheduleDay(getTodayWeekday());
        setScheduleDirection('G');
        setScheduleLoading(false);
        setCurrentSchedules(existingRoute.schedules || []);

        // Harita üzerine polyline çiz
        if (webViewRef.current && existingRoute.routeCoordinates && existingRoute.routeCoordinates.length > 0) {
          const js = `if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(existingRoute.routeCoordinates)}); } true;`;
          webViewRef.current.injectJavaScript(js);
        }

        const statsReq = ++statsReqRef.current;
        setDelayStats(null);
        DelayStatsService.getRouteDelayStats(targetKod)
          .then((s) => statsReq === statsReqRef.current && setDelayStats(s))
          .catch(() => statsReq === statsReqRef.current && setDelayStats(null));
      } else {
        setSelectedRoute({
          lineNo: targetKod,
          routeCode: targetKod,
          routeName: displayName,
          departureTimes: [],
          mainStops: [],
        });
        setCurrentSchedules([]);
        const statsReq = ++statsReqRef.current;
        setDelayStats(null);
        DelayStatsService.getRouteDelayStats(targetKod)
          .then((s) => statsReq === statsReqRef.current && setDelayStats(s))
          .catch(() => statsReq === statsReqRef.current && setDelayStats(null));
      }
    } catch (e) {
      console.log('Hat rota bilgisi alma hatası:', e);
    }
  }, [allRoutes, routes]);

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
        if (reqId !== scheduleReqRef.current) return; // daha yeni bir istek var
        setCurrentSchedules(list);
      } catch (e) {
        console.log('Sefer saatleri değiştirme hatası:', e);
      } finally {
        if (reqId === scheduleReqRef.current) setScheduleLoading(false);
      }
    },
    [selectedRoute]
  );

  const todayWeekday = getTodayWeekday();
  const isSelectedToday = scheduleDay === todayWeekday;

  const nextDepartureIndex = useMemo(() => {
    if (!isSelectedToday || currentSchedules.length === 0) return -1;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < currentSchedules.length; i++) {
      const s = currentSchedules[i];
      const m =
        s.hour !== undefined && s.minute !== undefined
          ? s.hour * 60 + s.minute
          : parseTimeToMinutes(s.time);
      if (m !== null && m > nowMinutes) {
        return i;
      }
    }
    return -1;
  }, [isSelectedToday, currentSchedules]);

  // Selected station live tracking polling (seamless background updates every 8 seconds)
  useEffect(() => {
    if (!selectedStation) return;
    const interval = setInterval(() => {
      loadStationDetail(selectedStation, true);
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedStation, loadStationDetail]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserLocation(coords);
          userLocationRef.current = coords;
          if (
            coords.lat > MAP_BOUNDS.minLat &&
            coords.lat < MAP_BOUNDS.maxLat &&
            coords.lng > MAP_BOUNDS.minLng &&
            coords.lng < MAP_BOUNDS.maxLng
          ) {
            setMapCenter(coords);
          }
          if (isMapReadyRef.current) {
            syncUserLocationToMap(coords, true);
          }

          // F1: Sunucu hazır uç noktasıyla en yakın durakları anında al
          try {
            const nearby = await ApiService.getNearbyStations(coords.lat, coords.lng);
            if (nearby.length > 0) {
              setNearbyStations(nearby);
              if (!didLocateSelectRef.current) {
                didLocateSelectRef.current = true;
                didAutoSelectRef.current = true;
                await loadStationDetail(nearby[0], false, false);
              }
            }
          } catch (err) {
            console.log('Yakındaki durakları yükleme hatası:', err);
          }
        }
      } catch (e) {
        console.log('Konum izni alınamadı:', e);
      }
    })();
  }, [syncUserLocationToMap, loadStationDetail]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      // cached() önbellekte kayıt yokken ağ hatasını fırlatır (ilk açılış + çevrimdışı);
      // ekran boş listeyle açılmalı, sonsuz yüklemede kalmamalı.
      const empty = { data: [] as any[], stale: true, at: 0 };
      const [stRes, routesRes] = await Promise.all([
        ApiService.getBusStationsWithCache().catch((e) => {
          console.log('Duraklar yüklenemedi:', e);
          return empty as Awaited<ReturnType<typeof ApiService.getBusStationsWithCache>>;
        }),
        ApiService.getAllRoutesWithCache().catch((e) => {
          console.log('Hatlar yüklenemedi:', e);
          return empty as Awaited<ReturnType<typeof ApiService.getAllRoutesWithCache>>;
        }),
      ]);
      const stList = stRes.data;
      const officialRoutes = routesRes.data;
      setStations(stList);
      setAllRoutes(officialRoutes);
      setTransitStale(stRes.stale || routesRes.stale);
      setTransitAt(Math.max(stRes.at, routesRes.at));

      if (stList.length > 0 && !didLocateSelectRef.current && !didAutoSelectRef.current) {
        didAutoSelectRef.current = true;
        const uLoc = userLocationRef.current;
        if (uLoc) {
          const withCoords = stList.filter((s) => s.lat && s.lng);
          if (withCoords.length > 0) {
            let nearest = withCoords[0];
            let minDist = Infinity;
            for (const s of withCoords) {
              const d = haversineDistance(uLoc.lat, uLoc.lng, s.lat!, s.lng!);
              if (d < minDist) {
                minDist = d;
                nearest = s;
              }
            }
            didLocateSelectRef.current = true;
            await loadStationDetail(nearest, false, false);
          }
        } else {
          const withCoords = stList.find((s) => s.lat && s.lng) || stList[0];
          await loadStationDetail(withCoords, false, false);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [loadStationDetail]);

  // Konum gelince bir kez en yakın durağa geç (haritayı kullanıcı konumundan uzaklaştırmadan)
  useEffect(() => {
    if (!userLocation || stations.length === 0 || didLocateSelectRef.current) return;
    const withCoords = stations.filter((s) => s.lat && s.lng);
    if (withCoords.length === 0) return;

    let nearest = withCoords[0];
    let minDist = Infinity;
    for (const s of withCoords) {
      const d = haversineDistance(userLocation.lat, userLocation.lng, s.lat!, s.lng!);
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    }
    didLocateSelectRef.current = true;
    loadStationDetail(nearest, false, false);
  }, [userLocation, stations, loadStationDetail]);

  // Canlı otobüs konumlarını periyodik yenile
  useEffect(() => {
    const interval = setInterval(loadLiveBuses, 20000);
    return () => clearInterval(interval);
  }, [loadLiveBuses]);

  // Web: iframe postMessage dinle
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'mapReady') {
          isMapReadyRef.current = true;
          if (userLocationRef.current) {
            syncUserLocationToMap(userLocationRef.current, true);
          }
        } else if (data?.type === 'mapTap') {
          enterCityLive();
        } else if (data?.type === 'station' && data.id) {
          const st = stations.find((s) => String(s.id) === String(data.id));
          if (st) loadStationDetail(st);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [stations, loadStationDetail, syncUserLocationToMap, enterCityLive]);

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 0 : 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [sheetExpanded, sheetAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 40) setSheetExpanded(false);
        else if (g.dy < -40) setSheetExpanded(true);
      },
    })
  ).current;

  const sortedStations = useMemo(() => {
    let list = [...stations];
    if (userLocation) {
      list = list
        .map((s) => ({
          ...s,
          _distance:
            s.lat && s.lng
              ? haversineDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
              : 999,
        }))
        .sort((a, b) => (a as any)._distance - (b as any)._distance);
    }
    return list;
  }, [stations, userLocation]);

  const surroundingStations = useMemo(() => {
    if (nearbyStations.length > 0) {
      return nearbyStations;
    }
    return sortedStations.slice(0, 10);
  }, [nearbyStations, sortedStations]);

  const normQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const matchingRoutes = useMemo(() => {
    if (!normQuery) return allRoutes.slice(0, 15);
    return allRoutes.filter((rt) => {
      const matchHatNo = normalizeText(String(rt.hatNo)).includes(normQuery) ||
                        normalizeText(`hat ${rt.hatNo}`).includes(normQuery);
      const matchKod = normalizeText(rt.kod).includes(normQuery);
      const matchAciklama = normalizeText(rt.aciklama).includes(normQuery);
      return matchHatNo || matchKod || matchAciklama;
    });
  }, [allRoutes, normQuery]);

  const matchingStations = useMemo(() => {
    if (!normQuery) return sortedStations.slice(0, 20);
    return sortedStations.filter((st) => {
      const matchName = normalizeText(st.name).includes(normQuery);
      const matchCode = normalizeText(st.code).includes(normQuery) ||
                        normalizeText(st.id).includes(normQuery);
      const matchLines = st.lines.some((l) => normalizeText(l).includes(normQuery));
      return matchName || matchCode || matchLines;
    }).slice(0, 35);
  }, [sortedStations, normQuery]);

  // F6: Durak adıyla arama → eşleşen ilk duraklardan geçen hatlar ("… durağından geçiyor")
  const stopRoutesCacheRef = useRef<Map<string, RouteLineItem[]>>(new Map());
  const [stopRouteHits, setStopRouteHits] = useState<{ route: RouteLineItem; stopName: string }[]>([]);
  useEffect(() => {
    if (!normQuery || normQuery.length < 3 || matchingStations.length === 0) {
      setStopRouteHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const targets = matchingStations.slice(0, 2);
      const results = await Promise.all(
        targets.map(async (st) => {
          const cache = stopRoutesCacheRef.current;
          if (!cache.has(st.id)) cache.set(st.id, await ApiService.getStationRoutes(st.id));
          return { st, routes: cache.get(st.id) || [] };
        })
      );
      if (cancelled) return;
      const seen = new Set<string>();
      const hits: { route: RouteLineItem; stopName: string }[] = [];
      results.forEach(({ st, routes: rs }) =>
        rs.forEach((r) => {
          if (seen.has(r.kod) || matchingRoutes.some((m) => m.kod === r.kod)) return;
          seen.add(r.kod);
          hits.push({ route: r, stopName: st.name });
        })
      );
      setStopRouteHits(hits.slice(0, 8));
    }, 350); // yazarken her tuşta istek atmamak için
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normQuery, matchingStations, matchingRoutes]);

  const mapStations = useMemo(
    () =>
      stations
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          lat: s.lat!,
          lng: s.lng!,
          direction: s.direction,
        })),
    [stations]
  );

  const selectedDistance = useMemo(() => {
    if (!selectedStation?.lat || !selectedStation?.lng || !userLocation) return null;
    return haversineDistance(
      userLocation.lat,
      userLocation.lng,
      selectedStation.lat,
      selectedStation.lng
    );
  }, [selectedStation, userLocation]);

  const serviceUpdateText = useMemo(() => {
    const delayed = stationBuses.filter(
      (b) => b.remainingTimeCurr != null && b.remainingTimeCurr >= 8
    );
    if (delayed.length > 0) {
      const line = delayed[0].busLineNo || delayed[0].busLineCode;
      return `Hat ${line} şu an ${delayed[0].remainingTimeCurr} dk içinde geliyor.`;
    }
    if (liveBuses.length > 0) {
      return `${liveBuses.length} otobüs haritada canlı takip ediliyor.`;
    }
    return 'Canlı sefer bilgileri Elazığ Belediyesi API üzerinden güncelleniyor.';
  }, [stationBuses, liveBuses]);

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 230],
  });

  const fabTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-210, 0],
  });

  const goToMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(coords);
      userLocationRef.current = coords;
      setMapCenter(coords);
      syncUserLocationToMap(coords, true);

      // F1: Sunucunun hazır yakın duraklarını al
      try {
        const nearby = await ApiService.getNearbyStations(coords.lat, coords.lng);
        if (nearby.length > 0) {
          setNearbyStations(nearby);
          loadStationDetail(nearby[0], false, true);
          return;
        }
      } catch (err) {
        console.log('Konuma gitme yakın duraklar hatası:', err);
      }

      const withCoords = stations.filter((s) => s.lat && s.lng);
      if (withCoords.length > 0) {
        let nearest = withCoords[0];
        let minDist = Infinity;
        for (const s of withCoords) {
          const d = haversineDistance(coords.lat, coords.lng, s.lat!, s.lng!);
          if (d < minDist) {
            minDist = d;
            nearest = s;
          }
        }
        loadStationDetail(nearest, false, true);
      }
    } catch (e) {
      console.log('Konum alma hatası:', e);
    }
  };

  // Build HTML ONCE on initial load to prevent WebView reloads, zoom resets, & white flashes
  const initialLeafletHtml = useMemo(
    () =>
      buildLeafletHtml(
        mapStations,
        liveBuses.map((b) => ({
          plaka: b.plaka,
          hatkodu: b.hatkodu,
          enlem: b.enlem || 0,
          boylam: b.boylam || 0,
          istikamet: b.istikamet,
          hiz: b.hiz,
        })),
        userLocation || ELAZIG_CENTER,
        null,
        userLocation
      ),
    [mapStations.length > 0]
  );

  // Inject live bus marker updates dynamically without reloading WebView!
  useEffect(() => {
    if (webViewRef.current && liveBuses.length > 0) {
      const busPayload = liveBuses.map((b) => ({
        plaka: b.plaka,
        hatkodu: b.hatkodu,
        enlem: b.enlem || 0,
        boylam: b.boylam || 0,
        istikamet: b.istikamet,
        hiz: b.hiz,
      }));
      const js = `if (window.updateBuses) { window.updateBuses(${JSON.stringify(busPayload)}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [liveBuses]);

  // Inject user location pulse marker dynamically when user location is retrieved
  useEffect(() => {
    if (webViewRef.current && userLocation) {
      const js = `if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(userLocation)}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [userLocation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={Theme.colors.surface} />

      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>Ulaşım</Text>
            <Text style={styles.headerSub}>
              {refreshingBuses ? 'Canlı veriler güncelleniyor…' : `${stations.length || '—'} durak · ${allRoutes.length || '—'} hat · canlı`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {refreshingBuses && <ActivityIndicator size="small" color={Theme.colors.accent} />}
          {cityLive && (
            <TouchableOpacity style={styles.liveChip} onPress={exitCityLive} activeOpacity={0.8}>
              <View style={styles.liveDot} />
              <Text style={styles.liveChipText}>{liveBuses.length} otobüs</Text>
              <Ionicons name="close" size={12} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.cardChip}
            onPress={() => setCardModalVisible(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="credit-card-chip-outline" size={16} color="#fff" />
            <Text style={styles.cardChipText}>
              {cardInfo.bakiye !== undefined ? `₺${cardInfo.bakiye.toFixed(2)}` : 'Kart'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarText}>
              {(userProfile?.displayName || 'M').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Search Bar — Always visible for 1-tap search */}
      <View style={styles.topSearchBarContainer}>
        <TouchableOpacity
          style={styles.topSearchBar}
          onPress={() => {
            setShowSearch(true);
            setShowRoutesPanel(false);
          }}
          activeOpacity={0.88}
        >
          <Ionicons name="search" size={18} color={Theme.colors.primary} />
          <Text style={styles.topSearchPlaceholder} numberOfLines={1}>
            {selectedStation
              ? `${selectedStation.name} • Durak veya Hat Ara...`
              : 'Durak adı, kod (Örn: 701) veya Hat ara (Örn: 27)...'}
          </Text>
          <View style={styles.topSearchAction}>
            <Text style={styles.topSearchActionText}>Ara</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tripPlannerBtn}
          onPress={() => router.push('/trip_planner' as any)}
          activeOpacity={0.85}
          accessibilityLabel="Nasıl Giderim Rota Planlayıcı"
        >
          <MaterialCommunityIcons name="routes" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {transitStale && (
        <View style={styles.transitStaleBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#0369a1" />
          <Text style={styles.transitStaleText}>
            Çevrimdışı — son güncelleme {formatLastUpdated(transitAt)}
          </Text>
        </View>
      )}

      {/* Main Canvas */}
      <View style={styles.mainCanvas}>
        {/* Full-screen Map */}
            {Platform.OS === 'web' ? (
              <View style={styles.mapFull}>
                {React.createElement('iframe', {
                  ref: iframeRef,
                  srcDoc: initialLeafletHtml,
                  style: { width: '100%', height: '100%', border: 'none' },
                  title: 'Elazığ Canlı Transit Haritası',
                })}
                <View style={styles.mapGradient} pointerEvents="none" />
              </View>
            ) : (
              <View style={styles.mapFull}>
                <WebView
                  ref={webViewRef}
                  originWhitelist={['*']}
                  source={{ html: initialLeafletHtml }}
                  style={{ flex: 1, backgroundColor: Theme.colors.surfaceVariant }}
                  onMessage={(event) => {
                    try {
                      const data = JSON.parse(event.nativeEvent.data);
                      if (data.type === 'mapReady') {
                        isMapReadyRef.current = true;
                        if (userLocationRef.current) {
                          syncUserLocationToMap(userLocationRef.current, true);
                        }
                      } else if (data.type === 'mapTap') {
                        enterCityLive();
                      } else if (data.type === 'station' && data.id) {
                        const st = stations.find((s) => String(s.id) === String(data.id));
                        if (st) loadStationDetail(st);
                      }
                    } catch (e) {
                      console.log('WebView message error:', e);
                    }
                  }}
                  onLoadEnd={() => {
                    setTimeout(() => {
                      isMapReadyRef.current = true;
                      if (userLocationRef.current) {
                        syncUserLocationToMap(userLocationRef.current, true);
                      }
                    }, 350);
                  }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={false}
                  scalesPageToFit={true}
                />
                <View style={styles.mapGradient} pointerEvents="none" />
              </View>
            )}

            {/* Enhanced Search overlay for both Stations and Routes */}
            {showSearch && (
              <View style={styles.searchOverlay}>
                <View style={styles.searchHeader}>
                  <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color={Theme.colors.primary} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Durak adı, kod veya Hat ara (Örn: 27, Valilik)..."
                      placeholderTextColor={Theme.colors.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoFocus
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={18} color={Theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                    }}
                    style={styles.searchCloseBtn}
                  >
                    <Ionicons name="close" size={22} color={Theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Filter Tabs */}
                <View style={styles.filterTabsRow}>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'all' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('all')}
                  >
                    <Text style={[styles.filterChipText, searchFilter === 'all' && styles.filterChipTextActive]}>
                      Tümü
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'routes' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('routes')}
                  >
                    <MaterialCommunityIcons
                      name="routes"
                      size={14}
                      color={searchFilter === 'routes' ? '#fff' : Theme.colors.secondary}
                    />
                    <Text style={[styles.filterChipText, searchFilter === 'routes' && styles.filterChipTextActive]}>
                      Hatlar ({matchingRoutes.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'stations' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('stations')}
                  >
                    <MaterialCommunityIcons
                      name="bus-stop"
                      size={14}
                      color={searchFilter === 'stations' ? '#fff' : Theme.colors.primary}
                    />
                    <Text style={[styles.filterChipText, searchFilter === 'stations' && styles.filterChipTextActive]}>
                      Duraklar ({matchingStations.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.searchResults}
                  contentContainerStyle={styles.searchResultsContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Direct query action if numeric */}
                  {/^\d+$/.test(normQuery) && (
                    <TouchableOpacity
                      style={styles.directActionCard}
                      onPress={() => loadRouteDetail(normQuery, `Hat ${normQuery}`)}
                    >
                      <View style={styles.directActionIcon}>
                        <MaterialCommunityIcons name="bus-clock" size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.directActionTitle}>Hat {normQuery} Canlı Takip & Seferleri</Text>
                        <Text style={styles.directActionSub}>Bu hattın canlı otobüslerini ve duraklarını haritada gör</Text>
                      </View>
                      <Ionicons name="arrow-forward-circle" size={22} color={Theme.colors.secondary} />
                    </TouchableOpacity>
                  )}

                  {/* Empty query: Quick Lines & Recents */}
                  {!normQuery && allRoutes.length > 0 && (
                    <View style={styles.quickSection}>
                      <Text style={styles.quickSectionTitle}>Sık Kullanılan Hatlar</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsScroll}>
                        {allRoutes.slice(0, 10).map((rt) => (
                          <TouchableOpacity
                            key={`quick-${rt.kod}`}
                            style={styles.quickLineChip}
                            onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                          >
                            <Text style={styles.quickLineChipText}>Hat {rt.hatNo}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Routes section */}
                  {(searchFilter === 'all' || searchFilter === 'routes') && matchingRoutes.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <MaterialCommunityIcons name="routes" size={16} color={Theme.colors.secondary} />
                        <Text style={styles.searchSectionTitle}>Otobüs Hatları ({matchingRoutes.length})</Text>
                      </View>
                      {matchingRoutes.map((rt) => (
                        <TouchableOpacity
                          key={`rt-${rt.kod}`}
                          style={styles.routeResultItem}
                          onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                        >
                          <View style={[styles.routeBadge, { backgroundColor: getBusColor(String(rt.hatNo)) }]}>
                            <Text style={styles.routeBadgeText}>HAT {rt.hatNo}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.routeResultName}>Hat {rt.hatNo} - {rt.kod}</Text>
                            <Text style={styles.routeResultDesc} numberOfLines={1}>{rt.aciklama}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* F6: Aranan duraktan geçen hatlar */}
                  {(searchFilter === 'all' || searchFilter === 'routes') && stopRouteHits.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <MaterialCommunityIcons name="bus-stop" size={16} color={Theme.colors.secondary} />
                        <Text style={styles.searchSectionTitle}>Duraktan Geçen Hatlar ({stopRouteHits.length})</Text>
                      </View>
                      {stopRouteHits.map(({ route: rt, stopName }) => (
                        <TouchableOpacity
                          key={`sr-${rt.kod}`}
                          style={styles.routeResultItem}
                          onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                        >
                          <View style={[styles.routeBadge, { backgroundColor: getBusColor(String(rt.hatNo)) }]}>
                            <Text style={styles.routeBadgeText}>HAT {rt.hatNo}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.routeResultName}>Hat {rt.hatNo} - {rt.aciklama}</Text>
                            <Text style={styles.routeResultDesc} numberOfLines={1}>{stopName} durağından geçiyor</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Stations section */}
                  {(searchFilter === 'all' || searchFilter === 'stations') && matchingStations.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <MaterialCommunityIcons name="bus-stop" size={16} color={Theme.colors.primary} />
                        <Text style={styles.searchSectionTitle}>Otobüs Durakları</Text>
                      </View>
                      {matchingStations.map((st) => (
                        <TouchableOpacity
                          key={`st-${st.id}`}
                          style={styles.searchResultItem}
                          onPress={() => {
                            loadStationDetail(st);
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                        >
                          <View style={styles.stationIconBox}>
                            <MaterialCommunityIcons name="bus-stop" size={18} color={Theme.colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.searchResultName}>{st.name}</Text>
                            <Text style={styles.searchResultMeta}>
                              {st.code}
                              {st.direction ? ` · ${st.direction}` : ''}
                              {(st as any)._distance != null && (st as any)._distance < 100
                                ? ` · ${formatDistance((st as any)._distance)}`
                                : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* No results */}
                  {normQuery && matchingRoutes.length === 0 && matchingStations.length === 0 && (
                    <View style={styles.noResultsBox}>
                      <MaterialCommunityIcons name="bus-stop-covered" size={36} color={Theme.colors.textMuted} />
                      <Text style={styles.noResultsTitle}>Sonuç Bulunamadı</Text>
                      <Text style={styles.noResultsSub}>"{searchQuery}" ile eşleşen hat veya durak bulunamadı.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Routes panel (layers) */}
            {showRoutesPanel && (
              <View style={styles.routesPanel}>
                <View style={styles.routesPanelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="routes" size={20} color={Theme.colors.primary} />
                    <Text style={styles.routesPanelTitle}>Hat Seferleri & Durakları</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowRoutesPanel(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={Theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* All Elazığ bus lines horizontal picker */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeTabs} contentContainerStyle={{ paddingRight: 12 }}>
                  {allRoutes.map((rt) => (
                    <TouchableOpacity
                      key={`panel-${rt.kod}`}
                      style={[
                        styles.routeTab,
                        (selectedRoute?.routeCode === rt.kod || selectedRoute?.lineNo === rt.kod) && styles.routeTabActive,
                      ]}
                      onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                    >
                      <Text
                        style={[
                          styles.routeTabText,
                          (selectedRoute?.routeCode === rt.kod || selectedRoute?.lineNo === rt.kod) && styles.routeTabTextActive,
                        ]}
                      >
                        Hat {rt.hatNo}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {selectedRoute && (
                  <ScrollView style={styles.routeDetailScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.routeHeaderRow}>
                      <Text style={[styles.routeName, { flex: 1, marginRight: 8 }]} numberOfLines={2}>
                        {selectedRoute.routeName}
                      </Text>
                      <TouchableOpacity
                        style={styles.starBtn}
                        onPress={() => toggleFavoriteRoute(selectedRoute.routeCode || selectedRoute.lineNo)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={
                            favoriteRoutes.includes(selectedRoute.routeCode || '') ||
                            favoriteRoutes.includes(selectedRoute.lineNo || '')
                              ? 'star'
                              : 'star-outline'
                          }
                          size={22}
                          color={
                            favoriteRoutes.includes(selectedRoute.routeCode || '') ||
                            favoriteRoutes.includes(selectedRoute.lineNo || '')
                              ? '#f59e0b'
                              : Theme.colors.textMuted
                          }
                        />
                      </TouchableOpacity>
                    </View>
                    {selectedRoute.priceInfo ? (
                      <Text style={styles.routePrice}>💳 {selectedRoute.priceInfo}</Text>
                    ) : null}
                    {selectedRoute.totalStops ? (
                      <Text style={styles.routeStopsCount}>
                        🚏 Toplam {selectedRoute.totalStops} durak (Durağa dokunarak haritada görün)
                      </Text>
                    ) : null}

                    {/* Interactive Route Stops List */}
                    {selectedRoute.mainStops.map((stop, idx) => (
                      <TouchableOpacity
                        key={`${stop}-${idx}`}
                        style={styles.routeStopRow}
                        onPress={() => {
                          const matched = stations.find(
                            (s) =>
                              normalizeText(s.name).includes(normalizeText(stop)) ||
                              normalizeText(stop).includes(normalizeText(s.name))
                          );
                          if (matched) {
                            loadStationDetail(matched);
                          }
                        }}
                      >
                        <View style={[styles.routeStopDot, idx === 0 && styles.routeStopDotFirst]} />
                        <Text style={styles.routeStopName}>{stop}</Text>
                        <Ionicons name="locate-outline" size={16} color={Theme.colors.secondary} />
                      </TouchableOpacity>
                    ))}

                    {/* Sefer Saatleri & Gün/Yön Seçici */}
                    <View style={styles.scheduleSection}>
                      <View style={styles.scheduleHeaderRow}>
                        <Text style={styles.departuresTitle}>Sefer Saatleri</Text>
                        <View style={styles.directionRow}>
                          <TouchableOpacity
                            style={[
                              styles.directionChip,
                              scheduleDirection === 'G' && styles.directionChipActive,
                            ]}
                            onPress={() => changeScheduleDayOrDirection(scheduleDay, 'G')}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="arrow-forward-circle"
                              size={13}
                              color={scheduleDirection === 'G' ? '#fff' : Theme.colors.primary}
                            />
                            <Text
                              style={[
                                styles.directionChipText,
                                scheduleDirection === 'G' && styles.directionChipTextActive,
                              ]}
                            >
                              Gidiş
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.directionChip,
                              scheduleDirection === 'D' && styles.directionChipActive,
                            ]}
                            onPress={() => changeScheduleDayOrDirection(scheduleDay, 'D')}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="arrow-back-circle"
                              size={13}
                              color={scheduleDirection === 'D' ? '#fff' : Theme.colors.primary}
                            />
                            <Text
                              style={[
                                styles.directionChipText,
                                scheduleDirection === 'D' && styles.directionChipTextActive,
                              ]}
                            >
                              Dönüş
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Gün Çipleri (Pzt ... Paz) */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.dayScroll}
                        contentContainerStyle={styles.dayScrollContent}
                      >
                        {WEEKDAYS.map((day) => {
                          const isDayToday = day.id === todayWeekday;
                          const isSelected = day.id === scheduleDay;
                          return (
                            <TouchableOpacity
                              key={day.id}
                              style={[
                                styles.dayChip,
                                isSelected && styles.dayChipActive,
                                isDayToday && !isSelected && styles.dayChipToday,
                              ]}
                              onPress={() => changeScheduleDayOrDirection(day.id, scheduleDirection)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dayChipText,
                                  isSelected && styles.dayChipTextActive,
                                  isDayToday && !isSelected && styles.dayChipTextToday,
                                ]}
                              >
                                {day.label}
                              </Text>
                              {isDayToday && (
                                <View
                                  style={[
                                    styles.todayDot,
                                    isSelected && { backgroundColor: Theme.colors.surface },
                                  ]}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Saatler Izgarası */}
                      {scheduleLoading ? (
                        <View style={styles.scheduleLoadingRow}>
                          <ActivityIndicator size="small" color={Theme.colors.primary} />
                          <Text style={styles.scheduleLoadingText}>Saatler güncelleniyor...</Text>
                        </View>
                      ) : currentSchedules.length > 0 ? (
                        <View style={styles.timeGrid}>
                          {currentSchedules.map((s, i) => {
                            const isNext = i === nextDepartureIndex;
                            const isPast = isSelectedToday && nextDepartureIndex !== -1 && i < nextDepartureIndex;
                            return (
                              <View
                                key={`${s.time}-${i}`}
                                style={[
                                  styles.timePill,
                                  isPast && styles.timePillPast,
                                  isNext && styles.timePillNext,
                                ]}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Text
                                    style={[
                                      styles.timePillText,
                                      isPast && styles.timePillTextPast,
                                      isNext && styles.timePillTextNext,
                                    ]}
                                  >
                                    {s.time}
                                  </Text>
                                  {isNext && (
                                    <View style={styles.nextBadge}>
                                      <Text style={styles.nextBadgeText}>SONRAKİ</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.emptyScheduleText}>
                          Bu gün ve yön için planlanmış sefer saati bulunamadı.
                        </Text>
                      )}
                    </View>

                    {/* Hat Yoğunluğu ve Gecikme İstatistiği (F15) */}
                    <View style={styles.delayStatsSection}>
                      <View style={styles.delayStatsHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={16} color={Theme.colors.primary} />
                          <Text style={styles.delayStatsTitle}>Canlı Akış & Sefer Yoğunluğu</Text>
                        </View>
                        {delayStats && (
                          <View style={[styles.delayStatusBadge, { backgroundColor: delayStats.statusColor + '20', borderColor: delayStats.statusColor }]}>
                            <View style={[styles.delayStatusDot, { backgroundColor: delayStats.statusColor }]} />
                            <Text style={[styles.delayStatusText, { color: delayStats.statusColor }]}>
                              {delayStats.statusLabel}
                            </Text>
                          </View>
                        )}
                      </View>

                      {delayStats ? (
                        <>
                          <View style={styles.delayMetaRow}>
                            <Text style={styles.delayMetaText}>
                              🚌 Aktif Araç: <Text style={{ fontWeight: '800', color: Theme.colors.textPrimary }}>{delayStats.activeVehicleCount}</Text>
                            </Text>
                            <Text style={styles.delayMetaText}>
                              ⏱️ Kalkış Aralığı:{' '}
                              <Text style={{ fontWeight: '800', color: Theme.colors.textPrimary }}>
                                {delayStats.averageFrequencyMinutes != null ? `~${delayStats.averageFrequencyMinutes} dk` : '—'}
                              </Text>
                              {delayStats.totalDepartures > 0 ? ` (bugün ${delayStats.totalDepartures} sefer)` : ''}
                            </Text>
                          </View>

                          {delayStats.hourlyStats.length > 0 && delayStats.totalDepartures > 0 ? (
                            <>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll}>
                                <View style={styles.chartContainer}>
                                  {(() => {
                                    const maxDep = Math.max(1, ...delayStats.hourlyStats.map((s) => s.departures));
                                    return delayStats.hourlyStats.map((item) => (
                                      <View key={item.hour} style={styles.chartBarCol}>
                                        <Text style={styles.chartBarVal}>{item.departures > 0 ? item.departures : ''}</Text>
                                        <View style={styles.chartBarBg}>
                                          <View
                                            style={[
                                              styles.chartBarFill,
                                              {
                                                height: `${item.departures > 0 ? Math.max(12, Math.round((item.departures / maxDep) * 100)) : 0}%`,
                                                backgroundColor: item.isCurrentHour ? '#0284c7' : item.isPeak ? '#ea580c' : '#10b981',
                                              },
                                            ]}
                                          />
                                        </View>
                                        <Text style={[styles.chartBarHour, item.isCurrentHour && styles.chartBarHourCurrent]}>
                                          {item.hourLabel.split(':')[0]}
                                        </Text>
                                      </View>
                                    ));
                                  })()}
                                </View>
                              </ScrollView>
                              <Text style={styles.chartLegend}>
                                Saat başına planlı sefer (gidiş tarifesi) • 🟦 Şu anki saat • 🟧 Sık sefer saatleri
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.chartLegend}>Bugün için tarife bilgisi alınamadı.</Text>
                          )}
                        </>
                      ) : null}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}
            {/* Floating Action Buttons */}
            <Animated.View style={[styles.fabColumn, { transform: [{ translateY: fabTranslateY }] }]}>
              <TouchableOpacity
                style={styles.fabSecondary}
                onPress={() => {
                  setShowRoutesPanel((v) => !v);
                  setShowSearch(false);
                }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="layers-outline" size={22} color={Theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fabPrimary} onPress={goToMyLocation} activeOpacity={0.85}>
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>

            {/* Bottom Sheet */}
            <Animated.View
              style={[styles.bottomSheet, { transform: [{ translateY: sheetTranslateY }] }]}
              {...panResponder.panHandlers}
            >
              <TouchableOpacity
                style={styles.dragHandleHit}
                onPress={() => setSheetExpanded((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={styles.dragHandle} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetHeaderTouchable}
                onPress={() => setSheetExpanded((v) => !v)}
                activeOpacity={0.85}
              >
                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {selectedStation?.name || 'Durak Seçin'}
                    </Text>
                    <View style={styles.sheetMetaRow}>
                      <MaterialCommunityIcons
                        name="near-me"
                        size={14}
                        color={Theme.colors.textMuted}
                      />
                      <Text style={styles.sheetMeta}>
                        {selectedDistance != null
                          ? formatDistance(selectedDistance)
                          : selectedStation?.lines.length
                          ? `${selectedStation.lines.length} hat geçiyor`
                          : selectedStation?.direction || 'Konum bekleniyor'}
                      </Text>
                      {selectedStation?.code ? (
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{selectedStation.code}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {selectedStation ? (
                      <TouchableOpacity
                        style={styles.starBtn}
                        onPress={() => toggleFavoriteStop(selectedStation)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={favoriteStop?.id === selectedStation.id ? 'star' : 'star-outline'}
                          size={22}
                          color={favoriteStop?.id === selectedStation.id ? '#f59e0b' : Theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    ) : null}
                    {selectedStation?.lat && selectedStation?.lng ? (
                      <TouchableOpacity
                        style={styles.detailsBtn}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps?q=${selectedStation.lat},${selectedStation.lng}`
                          )
                        }
                      >
                        <Text style={styles.detailsBtnText}>Yol Tarifi</Text>
                      </TouchableOpacity>
                    ) : null}
                    <Ionicons
                      name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
                      size={20}
                      color={Theme.colors.textMuted}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Scrollable sheet body so content never clips or overlaps */}
              <ScrollView
                style={styles.sheetBodyScroll}
                contentContainerStyle={styles.sheetBodyContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Live Arrivals */}
                {stationLoading ? (
                  <View style={styles.sheetLoading}>
                    <ActivityIndicator size="small" color={Theme.colors.primary} />
                    <Text style={styles.sheetLoadingText}>Yaklaşan otobüsler yükleniyor...</Text>
                  </View>
                ) : (
                  <View style={styles.arrivalsGrid}>
                    {stationBuses.length > 0 ? (
                      stationBuses.slice(0, 4).map((bus, idx) => (
                        <View
                          key={`${bus.busLineCode}-${idx}`}
                          style={[
                            styles.arrivalCard,
                            idx >= 2 && stationBuses.length === 3 && idx === 2
                              ? styles.arrivalCardWide
                              : null,
                            stationBuses.length === 1 ? styles.arrivalCardWide : null,
                          ]}
                        >
                          <View style={styles.arrivalCardTop}>
                            <View
                              style={[
                                styles.hatBadge,
                                { backgroundColor: getBusColor(String(bus.busLineNo || bus.busLineCode), idx) },
                              ]}
                            >
                              <Text style={styles.hatBadgeText}>
                                HAT {bus.busLineNo || bus.busLineCode || '—'}
                              </Text>
                            </View>
                            <Text style={styles.arrivalMins}>
                              {bus.remainingTimeCurr != null ? `${bus.remainingTimeCurr} dk` : '—'}
                            </Text>
                          </View>
                          <Text style={styles.arrivalDest} numberOfLines={1}>
                            {bus.busLineLongName || bus.busLineCode || '—'}
                          </Text>
                          {(bus.remainingNumberOfBusStops != null || bus.busPlate) && (
                            <Text style={styles.arrivalNext} numberOfLines={1}>
                              {bus.remainingNumberOfBusStops != null ? `${bus.remainingNumberOfBusStops} durak uzakta` : ''}
                              {bus.remainingNumberOfBusStops != null && bus.busPlate ? ' · ' : ''}
                              {bus.busPlate || ''}
                            </Text>
                          )}
                          {bus.remainingTimeNext != null && (
                            <Text style={styles.arrivalNext}>
                              Sonraki: {bus.remainingTimeNext} dk
                            </Text>
                          )}
                        </View>
                      ))
                    ) : (
                      <View style={styles.arrivalCardWide}>
                        <Text style={styles.noBusText}>
                          Bu duraktan şu an yaklaşan aktif otobüs bulunamadı.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Nearby stations quick list */}
                {surroundingStations.length > 1 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.nearbySectionTitle}>Çevredeki Diğer Duraklar</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.nearbyScroll}
                      contentContainerStyle={styles.nearbyScrollContent}
                    >
                      {surroundingStations.map((st) => (
                        <TouchableOpacity
                          key={st.id}
                          style={[
                            styles.nearbyChip,
                            selectedStation?.id === st.id && styles.nearbyChipActive,
                          ]}
                          onPress={() => loadStationDetail(st)}
                        >
                          <MaterialCommunityIcons
                            name="bus-stop"
                            size={14}
                            color={
                              selectedStation?.id === st.id ? '#fff' : Theme.colors.primary
                            }
                          />
                          <Text
                            style={[
                              styles.nearbyChipText,
                              selectedStation?.id === st.id && styles.nearbyChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {st.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
      </View>

      <CardQueryModal
        visible={cardModalVisible}
        onClose={() => setCardModalVisible(false)}
        onSuccess={(res) => {
          if (res.success) setCardInfo(res);
        }}
      />
      <AuthProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onProfileUpdated={(prof) => setUserProfile(prof)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Theme.colors.background,
    zIndex: 40,
  },
  headerSub: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.colors.success,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveChipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cardChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.colors.primary,
    borderWidth: 0,
    borderColor: Theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  mainCanvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
  },
  mapFull: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  mapGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
    // soft fade simulated via overlay tint
    opacity: 0.5,
    zIndex: 1,
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    bottom: 85,
    zIndex: 60,
    gap: 12,
    alignItems: 'center',
  },
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.md,
  },
  fabPrimary: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.lg,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0,
    borderColor: Theme.colors.cardBorder,
    paddingBottom: 16,
    maxHeight: SCREEN_HEIGHT * 0.46,
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 16,
  },
  dragHandleHit: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.colors.cardBorder,
  },
  sheetHeaderTouchable: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
    marginBottom: 2,
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sheetMeta: {
    fontSize: 13,
    color: Theme.colors.textMuted,
  },
  codeBadge: {
    backgroundColor: Theme.colors.secondaryBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.secondary,
  },
  detailsBtn: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  sheetBodyScroll: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheetLoading: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  sheetLoadingText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  arrivalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  arrivalCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  arrivalCardWide: {
    width: '100%',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  arrivalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hatBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  arrivalMins: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.accentDark,
  },
  arrivalDest: {
    fontSize: 13,
    color: Theme.colors.textPrimary,
  },
  arrivalNext: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 4,
  },
  noBusText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  serviceUpdate: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.colors.surfaceVariant,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  serviceUpdateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#66affe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceUpdateTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  serviceUpdateBody: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  nearbySectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nearbyScroll: {
    marginTop: 4,
  },
  nearbyScrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  nearbyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 160,
  },
  nearbyChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  nearbyChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
    maxWidth: 120,
  },
  nearbyChipTextActive: {
    color: '#fff',
  },
  // Top Search Bar (Always visible)
  topSearchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: Theme.colors.background,
    zIndex: 35,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    ...Theme.shadows.sm,
  },
  tripPlannerBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.sm,
  },
  topSearchPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontWeight: '500',
  },
  topSearchAction: {
    backgroundColor: Theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  topSearchActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // Search Overlay (Full featured modal)
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    maxHeight: SCREEN_HEIGHT * 0.72,
    backgroundColor: Theme.colors.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 2,
    borderBottomColor: Theme.colors.cardBorder,
    overflow: 'hidden',
    ...Theme.shadows.lg,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.colors.textPrimary,
  },
  searchCloseBtn: {
    padding: 6,
  },

  // Filter Tabs
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textPrimary,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Search Results
  searchResults: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  searchResultsContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Direct Action Card
  directActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.colors.secondaryBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.colors.secondary,
    padding: 12,
    marginVertical: 6,
  },
  directActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  directActionSub: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },

  // Quick Lines Section
  quickSection: {
    marginVertical: 8,
  },
  quickSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  quickChipsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  quickLineChip: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  quickLineChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.primary,
  },

  // Search Sections (Hatlar / Duraklar)
  searchSection: {
    marginTop: 8,
  },
  searchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    marginBottom: 4,
  },
  searchSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  routeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 54,
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  routeResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  routeResultDesc: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  stationIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  searchResultMeta: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  noResultsBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  noResultsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  noResultsSub: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    textAlign: 'center',
  },

  // Routes Panel (Layers)
  routesPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 72,
    bottom: 280,
    zIndex: 35,
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    padding: 14,
    ...Theme.shadows.lg,
  },
  routesPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  routesPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  routeTabs: {
    flexGrow: 0,
    marginBottom: 10,
  },
  routeTab: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  routeTabActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  routeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textPrimary,
  },
  routeTabTextActive: {
    color: '#fff',
  },
  routeDetailScroll: {
    flex: 1,
  },
  routeName: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.primary,
    marginBottom: 4,
  },
  routePrice: {
    fontSize: 12,
    color: Theme.colors.secondary,
    marginBottom: 4,
  },
  routeStopsCount: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginBottom: 10,
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  routeStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.cardBorder,
  },
  routeStopDotFirst: {
    backgroundColor: Theme.colors.primary,
  },
  routeStopName: {
    fontSize: 13,
    color: Theme.colors.textPrimary,
    flex: 1,
  },
  departuresTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  scheduleSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.cardBorder,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  directionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  directionChipActive: {
    backgroundColor: Theme.colors.primary,
  },
  directionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.textMuted,
  },
  directionChipTextActive: {
    color: '#ffffff',
  },
  dayScroll: {
    marginBottom: 10,
  },
  dayScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    position: 'relative',
  },
  dayChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  dayChipToday: {
    borderColor: Theme.colors.secondary,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textPrimary,
  },
  dayChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dayChipTextToday: {
    color: Theme.colors.secondary,
    fontWeight: '700',
  },
  todayDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.colors.secondary,
  },
  scheduleLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  scheduleLoadingText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timePill: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  timePillPast: {
    opacity: 0.45,
    backgroundColor: Theme.colors.surfaceSubtle,
  },
  timePillNext: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  timePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  timePillTextPast: {
    color: '#94a3b8',
  },
  timePillTextNext: {
    color: '#ffffff',
    fontWeight: '700',
  },
  nextBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 5,
  },
  nextBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
  emptyScheduleText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  starBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  transitStaleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Theme.colors.secondaryBg,
    borderBottomWidth: 1,
    borderBottomColor: '#bae6fd',
    paddingVertical: 5,
    paddingHorizontal: 12,
    zIndex: 10,
  },
  transitStaleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369a1',
  },
  delayStatsSection: {
    marginTop: 14,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: Theme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    gap: 10,
  },
  delayStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  delayStatsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
  },
  delayStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  delayStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  delayStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  delayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  delayMetaText: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
  },
  chartScroll: {
    marginVertical: 4,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 8,
    paddingHorizontal: 4,
  },
  chartBarCol: {
    alignItems: 'center',
    width: 24,
    height: '100%',
    justifyContent: 'flex-end',
    gap: 2,
  },
  chartBarVal: {
    fontSize: 8,
    color: Theme.colors.textMuted,
    fontWeight: '700',
  },
  chartBarBg: {
    width: 12,
    height: 50,
    backgroundColor: Theme.colors.cardBorder,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
  },
  chartBarHour: {
    fontSize: 9,
    color: Theme.colors.textMuted,
    fontWeight: '600',
  },
  chartBarHourCurrent: {
    color: '#0284c7',
    fontWeight: '900',
  },
  chartLegend: {
    fontSize: 10,
    color: Theme.colors.textMuted,
    textAlign: 'center',
  },
}));
