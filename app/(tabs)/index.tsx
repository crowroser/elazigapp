import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Theme } from '../../constants/Theme';
import { ApiService, WeatherData, CardBalanceResult, NewsItem, Pharmacy } from '../../services/apiService';
import { AuthService, UserProfile } from '../../services/authService';
import { PrefsService } from '../../services/prefsService';
import { ObsService } from '../../services/obsService';
import { WeatherWidget } from '../../components/WeatherWidget';
import { ElazigKartCard } from '../../components/ElazigKartCard';
import { PrayerCard } from '../../components/PrayerCard';
import { CardQueryModal } from '../../components/CardQueryModal';
import { AuthProfileModal } from '../../components/AuthProfileModal';
import { Card, SectionTitle, ListRow } from '../../components/ui';

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
      if (s) setObsName(s.fullName);
      else ObsService.getCredentials().then((c) => setObsName(c ? c.studentNo : ''));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAll(), cardNo ? loadCard(cardNo) : Promise.resolve()]);
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

  const firstName = (profile?.displayName || obsName || '').split(' ')[0];

  const actions: QuickAction[] = [
    { id: 'transit', title: 'Otobüsüm Nerede', icon: 'bus-marker', color: C.primary, bg: C.surfaceVariant, onPress: () => router.push('/(tabs)/transit') },
    { id: 'obs', title: 'OBS Notlarım', icon: 'school', color: C.uniRed, bg: C.uniRedSoft, onPress: () => router.push('/obs' as any) },
    { id: 'dining', title: 'Yemekhane', icon: 'silverware-fork-knife', color: C.accentDark, bg: C.accentBg, onPress: () => router.push('/(tabs)/university') },
    { id: 'pharmacy', title: 'Nöbetçi Eczane', icon: 'medical-bag', color: C.danger, bg: C.dangerBg, onPress: () => router.push('/(tabs)/services') },
    { id: 'outage', title: 'Kesintiler', icon: 'flash-alert', color: C.warning, bg: C.warningBg, onPress: () => router.push('/(tabs)/services') },
    { id: 'events', title: 'Etkinlikler', icon: 'ticket-confirmation-outline', color: C.info, bg: C.infoBg, onPress: () => router.push('/(tabs)/news') },
    { id: 'classifieds', title: 'İlan Panosu', icon: 'bulletin-board', color: C.uniRed, bg: C.uniRedSoft, onPress: () => router.push('/classifieds' as any) },
    { id: 'assistant', title: 'Gakgoş Asistan', icon: 'robot-happy-outline', color: C.primaryLight, bg: C.surfaceVariant, onPress: () => router.push('/assistant' as any) },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
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
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)}>
            <Ionicons name="notifications-outline" size={20} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={() => setProfileModal(true)} activeOpacity={0.85}>
            <Text style={styles.avatarText}>{(profile?.displayName || obsName || 'M').charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Kart */}
        <ElazigKartCard
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

        {/* Hava + namaz */}
        <View style={styles.rowPad}>
          <WeatherWidget weather={weather} />
        </View>
        <PrayerCard compact />

        {/* Hızlı erişim */}
        <SectionTitle title="Hızlı Erişim" />
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

        {/* Canlı ulaşım bandı */}
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

        {/* Nöbetçi eczane */}
        {pharmacies.length > 0 ? (
          <>
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
          </>
        ) : null}

        {/* Haberler */}
        {news.length > 0 ? (
          <>
            <SectionTitle title="Son Haberler" action="Tümü" onAction={() => router.push('/(tabs)/news')} />
            <View style={styles.rowPad}>
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {news.map((n, i) => (
                  <ListRow key={n.id} icon="newspaper-variant-outline" iconColor={C.info} iconBg={C.infoBg} title={n.title} subtitle={n.date} last={i === news.length - 1} onPress={() => router.push('/(tabs)/news')} />
                ))}
              </Card>
            </View>
          </>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      <CardQueryModal
        visible={cardModal}
        onClose={() => setCardModal(false)}
        initialCardNo={cardNo}
        onSuccess={handleCardResult}
      />
      <AuthProfileModal visible={profileModal} onClose={() => setProfileModal(false)} onProfileUpdated={handleProfileUpdated} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
