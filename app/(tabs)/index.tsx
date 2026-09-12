import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import { ApiService, WeatherData, CardBalanceResult, NewsItem, Pharmacy, StationBusInfo } from '../../services/apiService';
import { AuthService, UserProfile } from '../../services/authService';
import { PrefsService, FavoriteStop } from '../../services/prefsService';
import { cached } from '../../services/cacheService';
import { ObsService, ObsTimetableEntry } from '../../services/obsService';
import { WeatherWidget } from '../../components/WeatherWidget';
import { ElazigKartCard } from '../../components/ElazigKartCard';
import { PrayerCard } from '../../components/PrayerCard';
import { CardQueryModal } from '../../components/CardQueryModal';
import { AuthProfileModal } from '../../components/AuthProfileModal';
import { HomeCustomizerModal } from '../../components/HomeCustomizerModal';
import { Card, SectionTitle, ListRow, Pill } from '../../components/ui';
import { DEFAULT_HOME_LAYOUT } from '../../services/prefsService';

const C = Theme.colors;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

interface QuickAction {
  id: string;
  title: string;
  icon: string;
  color: string;
  bg: string;
  onPress: () => void;
}

export default function HomeScreen() {
  useAppTheme();
  const router = useRouter();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cardNo, setCardNo] = useState('');
  const [cardInfo, setCardInfo] = useState<CardBalanceResult | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardUpdated, setCardUpdated] = useState('');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [obsName, setObsName] = useState('');
  const [obsLoggedIn, setObsLoggedIn] = useState(false);
  const [todayLessons, setTodayLessons] = useState<ObsTimetableEntry[]>([]);
  const [homeLayout, setHomeLayout] = useState<string[]>(DEFAULT_HOME_LAYOUT);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [customizerModal, setCustomizerModal] = useState(false);
  const [favoriteStop, setFavoriteStop] = useState<FavoriteStop | null>(null);
  const [favoriteStopBuses, setFavoriteStopBuses] = useState<StationBusInfo[]>([]);
  const [favoriteStopLoading, setFavoriteStopLoading] = useState(false);
  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>([]);
  const [favoriteRouteLiveCount, setFavoriteRouteLiveCount] = useState<number | null>(null);

  const loadCard = useCallback(async (no: string, silent = false) => {
    if (!no) return;
    if (!silent) setCardBusy(true);
    const res = await ApiService.queryCardBalance(no);
    if (res.success) {
      setCardInfo(res);
      const now = new Date();
      setCardUpdated(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
      await PrefsService.setLastBalance({
        cardNo: no,
        balance: res.bakiye ?? 0,
        pending: res.bekleyenBakiye ?? 0,
        validity: res.gecerlilik || '',
        fetchedAt: now.toISOString(),
      });
    }
    setCardBusy(false);
  }, []);

  const loadAll = useCallback(async () => {
    const [w, n, p] = await Promise.all([ApiService.getWeather(), ApiService.getNews(), ApiService.getPharmacies()]);
    setWeather(w);
    setNews(n.slice(0, 3));
    setPharmacies(p.slice(0, 2));
  }, []);

  const refreshFavorites = useCallback(async () => {
    const [favStop, favRoutes] = await Promise.all([
      PrefsService.getFavoriteStop(),
      PrefsService.getFavoriteRoutes(),
    ]);
    setFavoriteStop(favStop);
    setFavoriteRoutes(favRoutes);

    if (favStop) {
      setFavoriteStopLoading(true);
      try {
        const buses = await ApiService.getStationRemainingTime(favStop.id);
        setFavoriteStopBuses(buses);
      } catch (e) {
        console.log('Favori durak canlı veri hatası:', e);
      } finally {
        setFavoriteStopLoading(false);
      }
    } else {
      setFavoriteStopBuses([]);
    }

    if (favRoutes.length > 0) {
      try {
        const live = await ApiService.getRealtimeBusData(favRoutes[0]);
        setFavoriteRouteLiveCount(live.length);
      } catch {
        setFavoriteRouteLiveCount(null);
      }
    } else {
      setFavoriteRouteLiveCount(null);
    }
  }, []);

  useEffect(() => {
    loadAll();
    (async () => {
      // Kayıtlı kart: önce yerel, sonra son bilinen bakiye, sonra canlı sorgu
      const saved = await PrefsService.getElazigKartNo();
      if (saved) {
        setCardNo(saved);
        const last = await PrefsService.getLastBalance();
        if (last && last.cardNo === saved) {
          setCardInfo({ success: true, bakiye: last.balance, bekleyenBakiye: last.pending, gecerlilik: last.validity });
          setCardUpdated(new Date(last.fetchedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
        }
        loadCard(saved, true);
      }
    })();
  }, [loadAll, loadCard]);

  useFocusEffect(
    useCallback(() => {
      const s = ObsService.getCachedStudent();
      if (s) {
        setObsName(s.fullName);
        setObsLoggedIn(true);
      } else {
        ObsService.getCredentials().then((c) => {
          setObsName(c ? c.studentNo : '');
          setObsLoggedIn(!!c);
        });
      }

      PrefsService.getHomeLayout().then(setHomeLayout);
      PrefsService.getHiddenCards().then(setHiddenCards);

      ObsService.getCredentials().then(async (cred) => {
        if (cred) {
          try {
            // Her sekme odağında OBS'ye gitmemek için ders programı 6 saat önbellekte tutulur
            const { data: tt } = await cached('obs_timetable_home', 6 * 60 * 60 * 1000, () => ObsService.getTimetable());
            if (tt && tt.entries) {
              const todayIdx = (new Date().getDay() + 6) % 7;
              const today = tt.entries.filter((e) => e.dayIndex === todayIdx);
              setTodayLessons(today);
            }
          } catch {}
        }
      });

      refreshFavorites();
      const interval = setInterval(refreshFavorites, 30000);
      return () => clearInterval(interval);
    }, [refreshFavorites])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadAll(),
      cardNo ? loadCard(cardNo) : Promise.resolve(),
      refreshFavorites(),
      PrefsService.getHomeLayout().then(setHomeLayout),
      PrefsService.getHiddenCards().then(setHiddenCards),
    ]);
    setRefreshing(false);
  };

  const handleProfileUpdated = async (prof: UserProfile | null) => {
    setProfile(prof);
    if (prof?.elazigKartNo && prof.elazigKartNo !== cardNo) {
      setCardNo(prof.elazigKartNo);
      loadCard(prof.elazigKartNo);
    }
  };

  const handleCardResult = async (res: CardBalanceResult, queriedNo: string) => {
    if (!res.success) return;
    setCardInfo(res);
    setCardNo(queriedNo);
    setCardUpdated(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
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

  const handleSaveLayout = async (layout: string[], hidden: string[]) => {
    setHomeLayout(layout);
    setHiddenCards(hidden);
    await PrefsService.setHomeLayout(layout);
    await PrefsService.setHiddenCards(hidden);
  };

  const firstName = (profile?.displayName || obsName || '').split(' ')[0];

  const actions: QuickAction[] = [
    { id: 'transit', title: 'Otobüsüm Nerede', icon: 'bus-marker', color: C.primary, bg: C.surfaceVariant, onPress: () => router.push('/(tabs)/transit') },
    { id: 'howtogo', title: 'Nasıl Giderim', icon: 'routes', color: C.success, bg: C.successBg, onPress: () => router.push('/trip_planner' as any) },
    { id: 'obs', title: 'OBS Notlarım', icon: 'school', color: C.uniRed, bg: C.uniRedSoft, onPress: () => router.push('/obs' as any) },
    { id: 'dining', title: 'Yemekhane', icon: 'silverware-fork-knife', color: C.accentDark, bg: C.accentBg, onPress: () => router.push('/(tabs)/university') },
    { id: 'pharmacy', title: 'Nöbetçi Eczane', icon: 'medical-bag', color: C.danger, bg: C.dangerBg, onPress: () => router.push('/(tabs)/services') },
    { id: 'outage', title: 'Kesintiler', icon: 'flash-alert', color: C.warning, bg: C.warningBg, onPress: () => router.push('/(tabs)/services') },
    { id: 'events', title: 'Etkinlikler', icon: 'ticket-confirmation-outline', color: C.info, bg: C.infoBg, onPress: () => router.push('/(tabs)/news') },
    { id: 'classifieds', title: 'İlan Panosu', icon: 'bulletin-board', color: C.uniRed, bg: C.uniRedSoft, onPress: () => router.push('/classifieds' as any) },
    { id: 'assistant', title: 'Gakgoş Asistan', icon: 'robot-happy-outline', color: C.primaryLight, bg: C.surfaceVariant, onPress: () => router.push('/assistant' as any) },
  ];

  const renderSection = (id: string) => {
    if (hiddenCards.includes(id)) return null;

    switch (id) {
      case 'student': {
        if (!obsLoggedIn && todayLessons.length === 0) {
          return (
            <TouchableOpacity
              key="student"
              style={styles.studentPromoCard}
              onPress={() => router.push('/obs' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.studentPromoLeft}>
                <Ionicons name="school" size={22} color={C.uniRed} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentPromoTitle}>Fırat OBS • Öğrenci Modu</Text>
                  <Text style={styles.studentPromoSub}>Ders programınızı ve notlarınızı ana sayfada görmek için giriş yapın</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </TouchableOpacity>
          );
        }

        const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const upcoming = todayLessons.filter((l) => (l.startTime || '99:99') >= nowStr);
        const nextLesson = upcoming[0] || todayLessons[0];

        return (
          <TouchableOpacity
            key="student"
            style={styles.studentCard}
            onPress={() => router.push('/obs' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.studentCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="school" size={16} color={C.uniRed} />
                <Text style={styles.studentCardTitle}>Fırat OBS • Ders Takibi</Text>
              </View>
              <View style={styles.studentBadge}>
                <Text style={styles.studentBadgeText}>ÖĞRENCİ</Text>
              </View>
            </View>
            {todayLessons.length > 0 && nextLesson ? (
              <View style={styles.studentLessonContent}>
                <Text style={styles.studentLessonNext}>
                  {upcoming.length > 0 ? 'Sıradaki Ders' : 'Bugünkü Dersler'}
                </Text>
                <Text style={styles.studentLessonName} numberOfLines={1}>{nextLesson.courseName}</Text>
                <View style={styles.studentLessonMetaRow}>
                  <View style={styles.studentMetaChip}>
                    <Ionicons name="time-outline" size={12} color={C.primary} />
                    <Text style={styles.studentMetaText}>{nextLesson.startTime} - {nextLesson.endTime}</Text>
                  </View>
                  {nextLesson.room ? (
                    <View style={styles.studentMetaChip}>
                      <Ionicons name="location-outline" size={12} color={C.accent} />
                      <Text style={styles.studentMetaText}>{nextLesson.room}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.studentTotalCount}>Bugün: {todayLessons.length} ders</Text>
                </View>
              </View>
            ) : (
              <View style={styles.studentEmptyRow}>
                <Ionicons name="calendar-outline" size={18} color="#16a34a" />
                <Text style={styles.studentEmptyText}>Bugün dersiniz bulunmuyor 🎉</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      }

      case 'card':
        return (
          <ElazigKartCard
            key="card"
            balance={cardInfo?.success ? cardInfo.bakiye : undefined}
            pending={cardInfo?.bekleyenBakiye}
            validity={cardInfo?.gecerlilik}
            cardNo={cardNo}
            cardHolder={profile?.displayName || obsName || undefined}
            loading={cardBusy}
            updatedAt={cardUpdated}
            onQueryPress={() => setCardModal(true)}
            onTopUpPress={() => setCardModal(true)}
          />
        );

      case 'favoriteStop':
        if (!favoriteStop) return null;
        return (
          <View key="favoriteStop" style={styles.favStopCard}>
            <View style={styles.favStopHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name="star" size={16} color="#f59e0b" />
                <Text style={styles.favStopSectionTitle}>Benim Durağım</Text>
                <View style={styles.liveTagSmall}>
                  <View style={styles.liveDotSmall} />
                  <Text style={styles.liveTextSmall}>CANLI</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/transit')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                activeOpacity={0.7}
              >
                <Text style={styles.favStopLink}>Haritada Gör</Text>
                <Ionicons name="chevron-forward" size={13} color={C.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.favStopName} numberOfLines={1}>{favoriteStop.name}</Text>

            {favoriteStopLoading && favoriteStopBuses.length === 0 ? (
              <View style={styles.favStopLoadingRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.favStopLoadingText}>Yaklaşan otobüsler yükleniyor...</Text>
              </View>
            ) : favoriteStopBuses.length > 0 ? (
              <View style={styles.favBusesList}>
                {favoriteStopBuses.slice(0, 3).map((bus, idx) => (
                  <View key={`${bus.busLineCode}-${idx}`} style={styles.favBusRow}>
                    <View style={styles.favBusLineBadge}>
                      <Text style={styles.favBusLineBadgeText}>
                        HAT {bus.busLineNo || bus.busLineCode || '—'}
                      </Text>
                    </View>
                    <Text style={styles.favBusDest} numberOfLines={1}>
                      {bus.busLineLongName || bus.busLineCode || '—'}
                    </Text>
                    <View style={styles.favBusMinsBadge}>
                      <Text style={styles.favBusMinsText}>
                        {bus.remainingTimeCurr != null ? `${bus.remainingTimeCurr} dk` : '—'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.favStopEmpty}>
                Şu an bu durağa yaklaşan aktif otobüs bulunmuyor.
              </Text>
            )}
          </View>
        );

      case 'quickActions':
        return (
          <View key="quickActions">
            <View style={styles.sectionHeaderRow}>
              <SectionTitle title="Hızlı Erişim" />
              {favoriteRoutes.length > 0 && favoriteRouteLiveCount !== null && (
                <TouchableOpacity
                  style={styles.favRouteLiveBadge}
                  onPress={() => router.push('/(tabs)/transit')}
                  activeOpacity={0.8}
                >
                  <View style={styles.liveDotSmall} />
                  <Text style={styles.favRouteLiveText}>
                    Hat {favoriteRoutes[0]}: {favoriteRouteLiveCount} Canlı Araç
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.grid}>
              {actions.map((a) => (
                <TouchableOpacity key={a.id} style={styles.gridItem} onPress={a.onPress} activeOpacity={0.8}>
                  <View style={[styles.gridIcon, { backgroundColor: a.bg }]}>
                    <MaterialCommunityIcons name={a.icon as any} size={24} color={a.color} />
                  </View>
                  <Text style={styles.gridLabel} numberOfLines={2}>
                    {a.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/(tabs)/transit')} style={styles.transitBanner}>
              <View style={{ flex: 1 }}>
                <View style={styles.liveTag}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>CANLI</Text>
                </View>
                <Text style={styles.bannerTitle}>Otobüsler haritada</Text>
                <Text style={styles.bannerSub}>Yaklaşan otobüsler, sefer saatleri ve güzergahlar</Text>
              </View>
              <MaterialCommunityIcons name="map-marker-radius" size={44} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        );

      case 'weather':
        return (
          <View key="weather" style={styles.rowPad}>
            <WeatherWidget weather={weather} />
          </View>
        );

      case 'prayer':
        return <PrayerCard key="prayer" compact />;

      case 'pharmacies':
        if (pharmacies.length === 0) return null;
        return (
          <View key="pharmacies">
            <SectionTitle title="Bugün Nöbetçi" subtitle="Elazığ merkez eczaneleri" action="Tümü" onAction={() => router.push('/(tabs)/services')} />
            <View style={styles.rowPad}>
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {pharmacies.map((p, i) => (
                  <ListRow
                    key={p.id}
                    icon="medical-bag"
                    iconColor={C.danger}
                    iconBg={C.dangerBg}
                    title={p.name}
                    subtitle={p.address}
                    last={i === pharmacies.length - 1}
                    onPress={() => router.push('/(tabs)/services')}
                  />
                ))}
              </Card>
            </View>
          </View>
        );

      case 'news':
        if (news.length === 0) return null;
        return (
          <View key="news">
            <SectionTitle title="Son Haberler" action="Tümü" onAction={() => router.push('/(tabs)/news')} />
            <View style={styles.rowPad}>
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {news.map((n, i) => (
                  <ListRow key={n.id} icon="newspaper-variant-outline" iconColor={C.info} iconBg={C.infoBg} title={n.title} subtitle={n.date} last={i === news.length - 1} onPress={() => router.push('/(tabs)/news')} />
                ))}
              </Card>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={C.background} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}
      >
        {/* Üst bar */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
            <View style={styles.cityRow}>
              <Ionicons name="location" size={13} color={C.accent} />
              <Text style={styles.city}>Elazığ</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setCustomizerModal(true)} accessibilityLabel="Düzeni Özelleştir">
            <Ionicons name="options-outline" size={20} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)} accessibilityLabel="Bildirimler">
            <Ionicons name="notifications-outline" size={20} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={() => setProfileModal(true)} activeOpacity={0.85}>
            <Text style={styles.avatarText}>{(profile?.displayName || obsName || 'M').charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Dinamik Kart Sıralaması */}
        {homeLayout.map((id) => renderSection(id))}

        <View style={{ height: 24 }} />
      </ScrollView>

      <CardQueryModal
        visible={cardModal}
        onClose={() => setCardModal(false)}
        initialCardNo={cardNo}
        onSuccess={handleCardResult}
      />
      <AuthProfileModal visible={profileModal} onClose={() => setProfileModal(false)} onProfileUpdated={handleProfileUpdated} />
      <HomeCustomizerModal
        visible={customizerModal}
        onClose={() => setCustomizerModal(false)}
        layout={homeLayout}
        hidden={hiddenCards}
        onSave={handleSaveLayout}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { paddingBottom: 16, gap: Theme.spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Theme.spacing.lg, paddingTop: 10, paddingBottom: 4 },
  greet: { ...Theme.text.h1, color: C.textPrimary },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  city: { ...Theme.text.small, color: C.textMuted, fontWeight: '700' },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  rowPad: { paddingHorizontal: Theme.spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Theme.spacing.lg, gap: 10 },
  gridItem: { width: '22.7%', alignItems: 'center', gap: 6 },
  gridIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 11, fontWeight: '700', color: C.textSecondary, textAlign: 'center', lineHeight: 14 },
  transitBanner: { marginHorizontal: Theme.spacing.lg, marginTop: 6, backgroundColor: C.primaryContainer, borderRadius: Theme.radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, ...Theme.shadows.md },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.14)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  bannerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  bannerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  favStopCard: {
    marginHorizontal: Theme.spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    ...Theme.shadows.sm,
  },
  favStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  favStopSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.primary,
  },
  liveTagSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  liveTextSmall: {
    color: '#16a34a',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  favStopLink: {
    fontSize: 12,
    fontWeight: '700',
    color: C.primary,
  },
  favStopName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 10,
  },
  favStopLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  favStopLoadingText: {
    fontSize: 12,
    color: C.textMuted,
  },
  favBusesList: {
    gap: 8,
  },
  favBusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surfaceSubtle,
    borderRadius: Theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  favBusLineBadge: {
    backgroundColor: C.primary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  favBusLineBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  favBusDest: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: C.textPrimary,
  },
  favBusMinsBadge: {
    backgroundColor: Theme.colors.prayerBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  favBusMinsText: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '800',
  },
  favStopEmpty: {
    fontSize: 12,
    color: C.textMuted,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Theme.spacing.lg,
  },
  favRouteLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.colors.successBg,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  favRouteLiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  studentPromoCard: {
    marginHorizontal: Theme.spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Theme.shadows.sm,
  },
  studentPromoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  studentPromoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.uniRed,
  },
  studentPromoSub: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },
  studentCard: {
    marginHorizontal: Theme.spacing.lg,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    ...Theme.shadows.sm,
  },
  studentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  studentCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.uniRed,
  },
  studentBadge: {
    backgroundColor: C.uniRedSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  studentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.uniRed,
    letterSpacing: 0.5,
  },
  studentLessonContent: {
    gap: 4,
  },
  studentLessonNext: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  studentLessonName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
  },
  studentLessonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  studentMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  studentMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },
  studentTotalCount: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    marginLeft: 'auto',
  },
  studentEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  studentEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
}));
