import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';

import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import {
  ApiService,
  WeatherData,
  CardBalanceResult,
  NewsItem,
  Pharmacy,
  OutageItem,
  StationBusInfo,
  BusStation,
  PrayerTime,
} from '../../services/apiService';
import { AuthService, UserProfile } from '../../services/authService';
import { PrefsService, FavoriteStop } from '../../services/prefsService';
import { cached } from '../../services/cacheService';
import { ObsService, ObsTimetableEntry, ObsGraduationAnalysis } from '../../services/obsService';
import { CardQueryModal } from '../../components/CardQueryModal';
import { AuthProfileModal } from '../../components/AuthProfileModal';
import { Card, Pill, Countdown, LiveBadge } from '../../components/ui';

const C = Theme.colors;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
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

interface QuickActionItem {
  id: string;
  title: string;
  icon: string;
  color: string;
  bg: string;
  route: string;
}

export default function HomeScreen() {
  useAppTheme();
  const router = useRouter();

  // Profil & Kart
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cardNo, setCardNo] = useState('');
  const [cardInfo, setCardInfo] = useState<CardBalanceResult | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);

  // Hava & Namaz
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [prayerData, setPrayerData] = useState<{ times: PrayerTime[]; nextPrayer?: PrayerTime } | null>(null);

  // Öğrenci (OBS)
  const [obsName, setObsName] = useState('');
  const [obsLoggedIn, setObsLoggedIn] = useState(false);
  const [todayLessons, setTodayLessons] = useState<ObsTimetableEntry[]>([]);
  const [obsDept, setObsDept] = useState('');
  const [obsGrad, setObsGrad] = useState<ObsGraduationAnalysis | null>(null);
  const [unseenGradeCount, setUnseenGradeCount] = useState(0);

  // Favori Durak & Yaklaşan Otobüsler
  const [favoriteStop, setFavoriteStop] = useState<FavoriteStop | null>(null);
  const [favoriteStopBuses, setFavoriteStopBuses] = useState<StationBusInfo[]>([]);
  const [favoriteStopLoading, setFavoriteStopLoading] = useState(false);
  const [stopCountdowns, setStopCountdowns] = useState<Record<string, number>>({});

  // G7: Yakınımdan Geçenler
  const [nearDepartures, setNearDepartures] = useState<{ stop: BusStation; departures: StationBusInfo[] }[]>([]);

  // Şehir Verileri
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [outages, setOutages] = useState<OutageItem[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  // 1. Kart bakiyesi yükleme
  const loadCard = useCallback(async (no: string, silent = false) => {
    if (!no) return;
    if (!silent) setCardBusy(true);
    try {
      const res = await ApiService.queryCardBalance(no);
      if (res.success) {
        setCardInfo(res);
        const now = new Date();
        await PrefsService.setLastBalance({
          cardNo: no,
          balance: res.bakiye ?? 0,
          pending: res.bekleyenBakiye ?? 0,
          validity: res.gecerlilik || '',
          fetchedAt: now.toISOString(),
        });
      }
    } catch {
      // ignore
    } finally {
      setCardBusy(false);
    }
  }, []);

  // 2. Favori durak ve canlı yaklaşanları yükle
  const refreshFavorites = useCallback(async () => {
    const favStop = await PrefsService.getFavoriteStop();
    setFavoriteStop(favStop);

    if (favStop) {
      setFavoriteStopLoading(true);
      try {
        const buses = await ApiService.getStationRemainingTime(favStop.id);
        setFavoriteStopBuses(buses);
        const cds: Record<string, number> = {};
        buses.forEach((b) => {
          const key = `${b.busLineCode}_${b.busPlate || b.busLineNo}`;
          if (b.remainingTimeCurr != null) {
            cds[key] = b.remainingTimeCurr * 60;
          }
        });
        setStopCountdowns(cds);
      } catch (e) {
        console.log('Favori durak canlı veri hatası:', e);
      } finally {
        setFavoriteStopLoading(false);
      }
    } else {
      setFavoriteStopBuses([]);
    }
  }, []);

  // G5: Saniye geri sayım döngüsü
  useEffect(() => {
    const timer = setInterval(() => {
      setStopCountdowns((prev) => {
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

  // 3. Genel verileri yükle
  const loadGeneralData = useCallback(async () => {
    const [w, p, n, ph, out] = await Promise.all([
      ApiService.getWeather().catch(() => null),
      ApiService.getPrayerTimesAsync().catch(() => null),
      ApiService.getNews().catch(() => []),
      ApiService.getPharmacies().catch(() => []),
      ApiService.getOutages().catch(() => []),
    ]);
    setWeather(w);
    setPrayerData(p);
    setNews(n.slice(0, 3));
    setPharmacies(ph.slice(0, 3));
    setOutages(out.slice(0, 2));
  }, []);

  // 4. Konum ve G7 Yakınımdan Geçenler
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          ApiService.getNearDepartures(loc.coords.latitude, loc.coords.longitude, 3)
            .then(setNearDepartures)
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // 5. İlk açılış
  useEffect(() => {
    loadGeneralData();
    (async () => {
      const savedCard = await PrefsService.getElazigKartNo();
      if (savedCard) {
        setCardNo(savedCard);
        const last = await PrefsService.getLastBalance();
        if (last && last.cardNo === savedCard) {
          setCardInfo({
            success: true,
            bakiye: last.balance,
            bekleyenBakiye: last.pending,
            gecerlilik: last.validity,
          });
        }
        loadCard(savedCard, true);
      }
    })();
  }, [loadGeneralData, loadCard]);

  // Sekme odağında OBS ve favori güncellemesi
  useFocusEffect(
    useCallback(() => {
      const s = ObsService.getCachedStudent();
      if (s) {
        setObsName(s.fullName);
        setObsDept(s.department || s.faculty || '');
        setObsLoggedIn(true);
      } else {
        ObsService.getCredentials().then((c) => {
          setObsName(c ? c.studentNo : '');
          setObsLoggedIn(!!c);
        });
      }

      // Cihazda önbellekli OBS özeti (ağ isteği yok): mezuniyet anlık görüntüsü + görülmemiş notlar
      PrefsService.getGraduationSnapshot().then((g) => setObsGrad(g)).catch(() => {});
      PrefsService.getUnseenGrades().then((u) => setUnseenGradeCount(u.length)).catch(() => {});

      ObsService.getCredentials().then(async (cred) => {
        if (cred) {
          try {
            const { data: tt } = await cached('obs_timetable_home', 6 * 60 * 60 * 1000, () =>
              ObsService.getTimetable()
            );
            if (tt && tt.entries) {
              const todayIdx = (new Date().getDay() + 6) % 7;
              setTodayLessons(tt.entries.filter((e) => e.dayIndex === todayIdx));
            }
          } catch {}
          // Mezuniyet ozeti (6 saat onbellek, OBS kuyrugunda serilestirilir)
          try {
            const g = await ObsService.getGraduationAnalysis();
            // Snapshot yazilmaz: O3 degisim bildirimi (notificationService) onceki/yeni farkini kendisi tutar
            if (g) setObsGrad(g);
          } catch {}
        }
      });

      refreshFavorites();
      const interval = setInterval(refreshFavorites, 20000);
      return () => clearInterval(interval);
    }, [refreshFavorites])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadGeneralData(),
      refreshFavorites(),
      cardNo ? loadCard(cardNo) : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const handleCardResult = async (res: CardBalanceResult, queriedNo: string) => {
    if (!res.success) return;
    setCardInfo(res);
    setCardNo(queriedNo);
    await PrefsService.setElazigKartNo(queriedNo);
    await PrefsService.setLastBalance({
      cardNo: queriedNo,
      balance: res.bakiye ?? 0,
      pending: res.bekleyenBakiye ?? 0,
      validity: res.gecerlilik || '',
      fetchedAt: new Date().toISOString(),
    });
    if (profile) AuthService.updateUserProfile(profile.uid, { elazigKartNo: queriedNo }).catch(() => {});
  };

  const firstName = (profile?.displayName || obsName || '').split(' ')[0];

  // Hızlı erişim çubukları (DESIGN_PLAN §4: 4'lü tek satır, yatay kaydırma)
  const quickActions: QuickActionItem[] = [
    {
      id: 'howtogo',
      title: 'Nasıl Giderim',
      icon: 'routes',
      color: C.success,
      bg: C.successBg,
      route: '/trip_planner',
    },
    {
      id: 'transit',
      title: 'Otobüsüm Nerede',
      icon: 'bus-marker',
      color: C.primary,
      bg: C.surfaceVariant,
      route: '/(tabs)/transit',
    },
    {
      id: 'obs',
      title: 'OBS & Mezuniyet',
      icon: 'school',
      color: C.uniRed,
      bg: C.uniRedSoft,
      route: '/obs',
    },
    {
      id: 'pharmacy',
      title: 'Nöbetçi Eczane',
      icon: 'medical-bag',
      color: C.danger,
      bg: C.dangerBg,
      route: '/(tabs)/services',
    },
    {
      id: 'events',
      title: 'Etkinlikler',
      icon: 'ticket-confirmation-outline',
      color: C.info,
      bg: C.infoBg,
      route: '/(tabs)/services',
    },
    {
      id: 'dining',
      title: 'Yemekhane',
      icon: 'silverware-fork-knife',
      color: C.accentDark,
      bg: C.accentBg,
      route: '/(tabs)/university',
    },
  ];

  // Namaz kalan süre
  const prayerCountdown = useMemo(() => {
    if (!prayerData?.nextPrayer?.time) return '';
    const [h, m] = prayerData.nextPrayer.time.split(':').map(Number);
    const now = new Date();
    let diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (diff < 0) diff += 24 * 60;
    const diffH = Math.floor(diff / 60);
    const diffM = diff % 60;
    return diffH > 0 ? `${diffH} sa ${diffM} dk kaldı` : `${diffM} dk kaldı`;
  }, [prayerData]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
      >
        {/* ── 1. ÜST BAR: Selamlama, Hava Durumu, Bildirim, Profil ───────── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>
              {greeting()}{firstName ? `, ${firstName}` : ''}
            </Text>
            <View style={styles.weatherRow}>
              {weather ? (
                <Text style={styles.weatherText}>
                  ☀ {weather.tempC}°C · {weather.conditionTr || weather.conditionText}
                </Text>
              ) : (
                <Text style={styles.weatherText}>📍 Elazığ</Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/notifications' as any)}
            accessibilityLabel="Bildirimler"
          >
            <Ionicons name="notifications-outline" size={20} color={C.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => setProfileModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarText}>
              {(profile?.displayName || obsName || 'M').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 2. "BENİM DURAĞIM" / YAKINIMDAKİ DURAK (G5 geri sayım, G7) ──── */}
        {(() => {
          const nearest = !favoriteStop && nearDepartures.length > 0 ? nearDepartures[0] : null;
          const title = favoriteStop
            ? `Benim Durağım · ${favoriteStop.name}`
            : nearest
            ? `Yakınımdaki Durak · ${nearest.stop.name}`
            : 'Benim Durağım';
          const rows = favoriteStop
            ? favoriteStopBuses.slice(0, 2).map((bus) => ({
                key: `${bus.busLineCode}_${bus.busPlate || bus.busLineNo}`,
                line: bus.busLineNo || bus.busLineCode,
                name: bus.busLineLongName || bus.busLineCode,
                secs: stopCountdowns[`${bus.busLineCode}_${bus.busPlate || bus.busLineNo}`],
              }))
            : nearest
            ? nearest.departures.slice(0, 2).map((d, i) => ({
                key: `${d.busLineCode}_${i}`,
                line: d.busLineNo || d.busLineCode,
                name: d.busLineLongName || d.busLineCode,
                secs: (d.remainingTimeCurr || 0) * 60,
              }))
            : [];
          return (
            <Card style={styles.favStopCard}>
              <View style={styles.favStopHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <LiveBadge state={rows.length > 0 ? 'live' : 'off'} text="canlı" />
                  <Text style={styles.favStopTitle} numberOfLines={1}>{title}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/transit')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                >
                  <Text style={styles.favStopLink}>Harita</Text>
                  <Ionicons name="chevron-forward" size={13} color={C.primary} />
                </TouchableOpacity>
              </View>

              {rows.length > 0 ? (
                <View style={{ gap: 6 }}>
                  {rows.map((r) => (
                    <View key={r.key} style={styles.favBusItem}>
                      <View style={styles.favBusBadge}>
                        <Text style={styles.favBusBadgeText}>HAT {r.line}</Text>
                      </View>
                      <Text style={styles.favBusName} numberOfLines={1}>{r.name}</Text>
                      <Countdown seconds={r.secs} compact />
                    </View>
                  ))}
                </View>
              ) : favoriteStop && favoriteStopLoading ? (
                <View style={styles.favLoadingRow}>
                  <ActivityIndicator size="small" color={Theme.colors.live} />
                  <Text style={styles.favLoadingText}>Yaklaşan otobüsler sorgulanıyor...</Text>
                </View>
              ) : favoriteStop ? (
                <Text style={styles.favEmptyText}>Şu an durağa yaklaşan otobüs görünmüyor.</Text>
              ) : (
                <TouchableOpacity
                  style={styles.setFavStopBox}
                  onPress={() => router.push('/(tabs)/transit')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="star-outline" size={18} color={C.textMuted} />
                  <Text style={styles.setFavStopText}>
                    Haritadan durağınızı yıldızlayın, yaklaşan otobüsleri burada canlı izleyin.
                  </Text>
                </TouchableOpacity>
              )}
            </Card>
          );
        })()}

        {/* ── 3. YAN YANA İKİ KART: ELAZIĞKART & NAMAZ ────────────────────── */}
        <View style={styles.sideBySideRow}>
          <TouchableOpacity
            style={[styles.smallCard, { flex: 1 }]}
            onPress={() => setCardModal(true)}
            activeOpacity={0.88}
          >
            <View style={styles.smallCardHeader}>
              <MaterialCommunityIcons name="credit-card-chip-outline" size={18} color={C.primary} />
              <Text style={styles.smallCardLabel}>ElazığKart</Text>
            </View>
            <Text style={styles.cardBalanceText}>
              {cardInfo?.bakiye !== undefined ? `₺${cardInfo.bakiye.toFixed(2)}` : '₺ —'}
            </Text>
            <Text style={styles.smallCardFooter} numberOfLines={1}>
              {cardBusy ? 'Sorgulanıyor...' : cardNo ? `Kart: ${cardNo.slice(-4)}` : 'Kart sorgula'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.smallCard, { flex: 1 }]}
            onPress={() => router.push('/(tabs)/services')}
            activeOpacity={0.88}
          >
            <View style={styles.smallCardHeader}>
              <MaterialCommunityIcons name="mosque" size={18} color={Theme.colors.accentDark} />
              <Text style={styles.smallCardLabel} numberOfLines={1}>
                {prayerData?.nextPrayer ? `Namaz · ${prayerData.nextPrayer.nameTr}` : 'Namaz Vakti'}
              </Text>
            </View>
            <Text style={styles.prayerTimeText}>{prayerData?.nextPrayer?.time || '—:—'}</Text>
            <Text style={styles.smallCardFooter} numberOfLines={1}>{prayerCountdown || 'Elazığ'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. FIRAT OBS ÖĞRENCİ KARTI ───────────────────────────────────── */}
        {(() => {
          if (!obsLoggedIn) {
            return (
              <TouchableOpacity
                style={styles.obsPromo}
                onPress={() => router.push('/obs' as any)}
                activeOpacity={0.85}
              >
                <View style={[styles.todayIconCircle, { backgroundColor: C.uniRedSoft }]}>
                  <Ionicons name="school" size={16} color={C.uniRed} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayRowTitle}>Fırat OBS · Öğrenci modu</Text>
                  <Text style={styles.todayRowSub} numberOfLines={1}>
                    Notlar, ders programı ve mezuniyet durumu için giriş yapın
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
              </TouchableOpacity>
            );
          }
          const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          const upcoming = todayLessons.filter((l) => (l.endTime || l.startTime || '99:99') >= nowStr);
          const nextLesson = upcoming[0] || null;
          const aktsCrit = obsGrad?.criteria.find((c) => c.key === 'akts');
          const agnoText = obsGrad?.agno != null ? obsGrad.agno.toFixed(2).replace('.', ',') : '—';
          const termText = obsGrad ? `${obsGrad.periodsStudied}/${obsGrad.maxDuration}` : '—';
          const aktsText = aktsCrit?.value ? `${aktsCrit.value}/${aktsCrit.target || 240}` : '—';
          return (
            <TouchableOpacity
              style={styles.obsCard}
              onPress={() => router.push('/obs' as any)}
              activeOpacity={0.88}
            >
              <View style={styles.obsCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="school" size={15} color={C.uniRed} />
                  <Text style={styles.obsCardTitle} numberOfLines={1}>
                    Fırat OBS{obsDept ? ` · ${obsDept}` : ''}
                  </Text>
                </View>
                {unseenGradeCount > 0 ? (
                  <Pill label={`${unseenGradeCount} YENİ NOT`} color={C.uniRed} bg={C.uniRedSoft} />
                ) : (
                  <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
                )}
              </View>
              <View style={styles.obsStatsRow}>
                <View style={styles.obsStat}>
                  <Text style={styles.obsStatValue}>{agnoText}</Text>
                  <Text style={styles.obsStatLabel}>AGNO</Text>
                </View>
                <View style={styles.obsStatDivider} />
                <View style={styles.obsStat}>
                  <Text style={styles.obsStatValue}>{termText}</Text>
                  <Text style={styles.obsStatLabel}>DÖNEM</Text>
                </View>
                <View style={styles.obsStatDivider} />
                <View style={styles.obsStat}>
                  <Text style={styles.obsStatValue}>{aktsText}</Text>
                  <Text style={styles.obsStatLabel}>AKTS</Text>
                </View>
              </View>
              <View style={styles.obsLessonRow}>
                <Ionicons name="time-outline" size={13} color={nextLesson ? C.uniRed : C.textMuted} />
                <Text style={styles.obsLessonText} numberOfLines={1}>
                  {nextLesson
                    ? `${nextLesson.startTime} ${nextLesson.courseName}${nextLesson.room ? ` · ${nextLesson.room}` : ''}`
                    : todayLessons.length > 0
                    ? `Bugünkü ${todayLessons.length} ders tamamlandı`
                    : obsGrad
                    ? 'Bugün ders yok'
                    : 'Özet için OBS ekranını bir kez açın'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* ── 5. "BUGÜN": ECZANE + KESİNTİ ────────────────────────────────── */}
        <View style={styles.todaySection}>
          <Text style={styles.sectionHeaderTitle}>Bugün</Text>
          <Card style={styles.todayCard}>
            {pharmacies.length > 0 && (
              <TouchableOpacity style={styles.todayRow} onPress={() => router.push('/(tabs)/services')}>
                <View style={[styles.todayIconCircle, { backgroundColor: C.dangerBg }]}>
                  <MaterialCommunityIcons name="medical-bag" size={16} color={C.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayRowTitle} numberOfLines={1}>Nöbetçi: {pharmacies[0].name}</Text>
                  <Text style={styles.todayRowSub} numberOfLines={1}>{pharmacies[0].address}</Text>
                </View>
                <Pill label="24 SAAT" color={C.danger} bg={C.dangerBg} />
              </TouchableOpacity>
            )}

            {outages.length > 0 ? (
              <TouchableOpacity style={styles.todayRow} onPress={() => router.push('/(tabs)/services')}>
                <View style={[styles.todayIconCircle, { backgroundColor: C.warningBg }]}>
                  <MaterialCommunityIcons name="flash-alert" size={16} color={C.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayRowTitle} numberOfLines={1}>{outages[0].title}</Text>
                  <Text style={styles.todayRowSub}>{outages[0].startTime} – {outages[0].endTime}</Text>
                </View>
                <Pill label="KESİNTİ" color={C.warning} bg={C.warningBg} />
              </TouchableOpacity>
            ) : (
              <View style={styles.todayRow}>
                <View style={[styles.todayIconCircle, { backgroundColor: C.successBg }]}>
                  <MaterialCommunityIcons name="flash-outline" size={16} color={C.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayRowTitle}>Planlı kesinti yok</Text>
                  <Text style={styles.todayRowSub} numberOfLines={1}>Fırat EDAŞ · Elazığ merkez</Text>
                </View>
              </View>
            )}
          </Card>
        </View>

        {/* ── 6. HIZLI ERİŞİM ──────────────────────────────────────────────── */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionHeaderTitle}>Hızlı Erişim</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsScroll}
          >
            {quickActions.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.quickActionItem}
                onPress={() => router.push(a.route as any)}
                activeOpacity={0.85}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: a.bg }]}>
                  <MaterialCommunityIcons name={a.icon as any} size={20} color={a.color} />
                </View>
                <Text style={styles.quickActionLabel} numberOfLines={1}>{a.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Kart Sorgulama & Bakiye Modalı */}
      <CardQueryModal
        visible={cardModal}
        onClose={() => setCardModal(false)}
        initialCardNo={cardNo}
        onSuccess={handleCardResult}
      />

      {/* Kullanıcı Profil Modalı */}
      <AuthProfileModal
        visible={profileModal}
        onClose={() => setProfileModal(false)}
        onProfileUpdated={(p) => {
          setProfile(p);
          if (p?.elazigKartNo && p.elazigKartNo !== cardNo) {
            setCardNo(p.elazigKartNo);
            loadCard(p.elazigKartNo);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    content: { paddingBottom: 12, gap: 10, flexGrow: 1 },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Theme.spacing.lg,
      paddingTop: 8,
      gap: 10,
    },
    greet: { ...Theme.text.h1, color: C.textPrimary },
    weatherRow: { marginTop: 2 },
    weatherText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarBtn: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    // Benim durağım kartı
    favStopCard: {
      marginHorizontal: Theme.spacing.lg,
      gap: 10,
    },
    favStopHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    favStopTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.textPrimary,
      flexShrink: 1,
    },
    favStopLink: {
      fontSize: 12,
      fontWeight: '700',
      color: C.primary,
    },
    favLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    favLoadingText: { fontSize: 12, color: C.textMuted },
    favBusItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surfaceSubtle,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 8,
    },
    favBusBadge: {
      backgroundColor: C.primary,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    favBusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    favBusName: { flex: 1, fontSize: 12, fontWeight: '600', color: C.textPrimary },
    favEmptyText: { fontSize: 12, color: C.textMuted, paddingVertical: 4 },
    setFavStopBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    setFavStopText: { fontSize: 12, color: C.textMuted, flex: 1, lineHeight: 17 },

    // Yan yana küçük kartlar (ElazığKart & Namaz)
    sideBySideRow: {
      flexDirection: 'row',
      paddingHorizontal: Theme.spacing.lg,
      gap: 12,
    },
    smallCard: {
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
      gap: 4,
      ...Theme.shadows.sm,
    },
    smallCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    smallCardLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textMuted,
    },
    cardBalanceText: {
      fontSize: 22,
      fontWeight: '800',
      color: C.primary,
      fontVariant: ['tabular-nums'],
    },
    prayerTimeText: {
      fontSize: 22,
      fontWeight: '800',
      color: Theme.colors.accentDark,
      fontVariant: ['tabular-nums'],
    },
    smallCardFooter: {
      fontSize: 11,
      color: C.textMuted,
    },

    // Bugün Bölümü
    todaySection: {
      paddingHorizontal: Theme.spacing.lg,
      gap: 8,
    },
    sectionHeaderTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.textPrimary,
    },
    todayCard: {
      gap: 10,
    },
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    todayIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayRowTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textPrimary,
    },
    todayRowSub: {
      fontSize: 11,
      color: C.textMuted,
      marginTop: 2,
    },
    todayEmptyText: {
      fontSize: 12,
      color: C.textMuted,
      paddingVertical: 6,
    },

    // Hızlı Erişim Bölümü
    quickActionsSection: {
      gap: 6,
    },

    // Fırat OBS kartı
    obsPromo: {
      marginHorizontal: Theme.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingVertical: 10,
      paddingHorizontal: 12,
      ...Theme.shadows.sm,
    },
    obsCard: {
      marginHorizontal: Theme.spacing.lg,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      borderLeftWidth: 3,
      borderLeftColor: C.uniRed,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 8,
      ...Theme.shadows.sm,
    },
    obsCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    obsCardTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: C.textPrimary,
      flex: 1,
    },
    obsStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    obsStat: { flex: 1, alignItems: 'center', gap: 1 },
    obsStatValue: {
      fontSize: 17,
      fontWeight: '800',
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    obsStatLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.4 },
    obsStatDivider: { width: 1, height: 24, backgroundColor: C.divider },
    obsLessonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    obsLessonText: { flex: 1, fontSize: 12, color: C.textSecondary },

    quickActionsScroll: {
      paddingHorizontal: Theme.spacing.lg,
      gap: 10,
    },
    quickActionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.surface,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingVertical: 7,
      paddingLeft: 7,
      paddingRight: 14,
      ...Theme.shadows.sm,
    },
    quickActionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textPrimary,
    },

    // Yakınımdan Geçenler
    nearSection: {
      paddingHorizontal: Theme.spacing.lg,
      gap: 8,
    },
    nearStopHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: C.primary,
      marginBottom: 2,
    },
    nearDepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 3,
    },
    nearDepBadge: {
      backgroundColor: C.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    nearDepBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    nearDepDest: { flex: 1, fontSize: 12, color: C.textSecondary },

    // Son Haberler
    newsSection: {
      paddingHorizontal: Theme.spacing.lg,
      gap: 8,
    },
    newsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.primary,
    },
    newsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    newsRowTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textPrimary,
      lineHeight: 18,
    },
    newsRowDate: {
      fontSize: 11,
      color: C.textMuted,
    },
  })
);
