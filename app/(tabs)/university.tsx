import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import { ApiService, DiningMenu, AcademicAnnouncement, AnnouncementDetailData } from '../../services/apiService';
import { ObsService, ObsStudentInfo } from '../../services/obsService';
import { PrefsService } from '../../services/prefsService';
import { formatLastUpdated } from '../../services/cacheService';
import { AnnouncementDetailModal } from '../../components/AnnouncementDetailModal';
import { Card, Chip, SectionTitle, EmptyState, LoadingState, ListRow, Pill, Notice } from '../../components/ui';

const C = Theme.colors;
const RED = C.uniRed;

const DINING_ICON: Record<string, string> = {
  soup: 'bowl-mix',
  'bowl-mix': 'bowl-mix',
  'food-turkey': 'food-drumstick',
  'food-drumstick': 'food-drumstick',
  rice: 'food-variant',
  'food-variant': 'food-variant',
  cupcake: 'cake-variant',
  'cake-variant': 'cake-variant',
  'silverware-fork-knife': 'silverware-fork-knife',
  food: 'food',
};

const UNITS = ['Tümü', 'Mühendislik', 'Teknoloji', 'Tıp', 'İİBF', 'Eğitim', 'İletişim'];

export default function UniversityScreen() {
  useAppTheme();
  const router = useRouter();
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [diningStale, setDiningStale] = useState(false);
  const [diningAt, setDiningAt] = useState(0);
  const [announcements, setAnnouncements] = useState<AcademicAnnouncement[]>([]);
  const [events, setEvents] = useState<AcademicAnnouncement[]>([]);
  const [unit, setUnit] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [annLoading, setAnnLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detail, setDetail] = useState<AnnouncementDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [obsStudent, setObsStudent] = useState<ObsStudentInfo | null>(null);
  const [obsSaved, setObsSaved] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  const load = useCallback(async (force = false) => {
    const [mRes, a, e] = await Promise.all([
      ApiService.getDiningMenuWithCache(force).catch(() => ({
        data: { date: '', lunch: [], dinner: [], priceStudent: '', priceStaff: '' },
        stale: true,
        at: 0,
      })),
      ApiService.getAcademicAnnouncements(),
      ApiService.getAcademicEvents(),
    ]);
    setMenu(mRes.data);
    setDiningStale(mRes.stale);
    setDiningAt(mRes.at);
    setAnnouncements(a);
    setEvents(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setObsStudent(ObsService.getCachedStudent());
      ObsService.getCredentials().then((c) => setObsSaved(!!c));
      PrefsService.getUnseenGrades().then((unseen) => setUnseenCount(unseen.length));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const filterUnit = async (u: string) => {
    setUnit(u);
    setAnnLoading(true);
    setAnnouncements(await ApiService.getAcademicAnnouncements(u === 'Tümü' ? undefined : u));
    setAnnLoading(false);
  };

  const openDetail = async (item: AcademicAnnouncement) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await ApiService.getAnnouncementDetail(item.link, item.title, item.unit, item.date));
    } catch (e) {
      console.log('Duyuru detay hatası:', e);
    }
    setDetailLoading(false);
  };

  const meals = menu?.lunch?.length ? menu.lunch : menu?.dinner || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={RED} />
      {/* Kırmızı hero */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>FIRAT ÜNİVERSİTESİ</Text>
          <Text style={styles.heroTitle}>Kampüs</Text>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="school" size={22} color={RED} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[RED]} tintColor={RED} />}
      >
        {/* OBS girişi */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/obs' as any)} style={styles.obsCard}>
          <View style={styles.obsIcon}>
            <MaterialCommunityIcons name="school" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.obsTitle}>Öğrenci Bilgi Sistemi</Text>
              {unseenCount > 0 ? (
                <Pill label={`${unseenCount} YENİ`} color={C.accentDark} bg={C.accentBg} />
              ) : null}
            </View>
            <Text style={styles.obsSub} numberOfLines={2}>
              {obsStudent
                ? `${obsStudent.fullName} · ${obsStudent.department || obsStudent.faculty}`
                : obsSaved
                ? 'Kayıtlı hesabınla otomatik giriş yapılır'
                : 'Notlar, ders programı, devamsızlık, sınav takvimi ve daha fazlası'}
            </Text>
          </View>
          <View style={styles.obsArrow}>
            <Ionicons name="arrow-forward" size={18} color={RED} />
          </View>
        </TouchableOpacity>

        {/* Hızlı bağlantılar */}
        <View style={styles.quickRow}>
          {[
            { t: 'İlan Panosu', i: 'bulletin-board', go: () => router.push('/classifieds' as any) },
            { t: 'Yemekhane', i: 'silverware-fork-knife', go: () => {} },
            { t: 'Kütüphane', i: 'library', go: () => Linking.openURL('https://kutuphane.firat.edu.tr') },
            { t: 'FÜ Web', i: 'web', go: () => Linking.openURL('https://www.firat.edu.tr') },
          ].map((q) => (
            <TouchableOpacity key={q.t} style={styles.quick} onPress={q.go} activeOpacity={0.8}>
              <View style={styles.quickIcon}>
                <MaterialCommunityIcons name={q.i as any} size={22} color={RED} />
              </View>
              <Text style={styles.quickText}>{q.t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Yemek menüsü */}
        <SectionTitle
          title="Günün Menüsü"
          subtitle={
            menu?.date
              ? `${menu.date}${diningAt ? ` · ${formatLastUpdated(diningAt)}` : ''}`
              : 'Fırat Üniversitesi yemekhanesi'
          }
        />
        {diningStale && (
          <View style={{ marginBottom: 8 }}>
            <Notice tone="info" text={`Çevrimdışı — son güncelleme ${formatLastUpdated(diningAt)}`} />
          </View>
        )}
        <Card style={styles.pad}>
          {loading ? (
            <LoadingState label="Menü alınıyor..." tint={RED} />
          ) : meals.length === 0 ? (
            <EmptyState icon="food-off-outline" title="Bugün için menü yayınlanmadı" tint={RED} />
          ) : (
            meals.map((d, i) => (
              <ListRow
                key={i}
                icon={DINING_ICON[d.icon] || 'food'}
                iconColor={RED}
                iconBg={C.uniRedSoft}
                title={d.name}
                subtitle={d.category}
                right={d.calories ? <Pill label={`${d.calories} kcal`} color={RED} bg={C.uniRedSoft} /> : undefined}
                last={i === meals.length - 1}
              />
            ))
          )}
        </Card>

        {/* Duyurular */}
        <SectionTitle title="Akademik Duyurular" subtitle="Ana portal ve birim duyuruları" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {UNITS.map((u) => (
            <Chip key={u} label={u} active={unit === u} tint={RED} onPress={() => filterUnit(u)} />
          ))}
        </ScrollView>
        <View style={styles.pad}>
          {annLoading || loading ? (
            <LoadingState label="Duyurular yükleniyor..." tint={RED} />
          ) : announcements.length === 0 ? (
            <Card>
              <EmptyState icon="bell-off-outline" title="Duyuru bulunamadı" description="Seçilen birime ait güncel duyuru yok." tint={RED} />
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {announcements.map((a) => (
                <Card key={a.id} onPress={() => openDetail(a)}>
                  <View style={styles.annTop}>
                    <Pill label={a.unit} color={RED} bg={C.uniRedSoft} style={{ maxWidth: '70%' }} />
                    <Text style={styles.annDate}>{a.date}</Text>
                  </View>
                  <Text style={styles.annTitle}>{a.title}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Etkinlikler */}
        {events.length > 0 ? (
          <>
            <SectionTitle title="Kampüs Etkinlikleri" subtitle="FÜ resmî etkinlik akışı" />
            <View style={[styles.pad, { gap: 10 }]}>
              {events.slice(0, 6).map((e) => (
                <Card key={e.id} onPress={() => openDetail(e)}>
                  <View style={styles.annTop}>
                    <Pill label={e.unit || 'Etkinlik'} color={C.info} bg={C.infoBg} style={{ maxWidth: '70%' }} />
                    <Text style={styles.annDate}>{e.date}</Text>
                  </View>
                  <Text style={styles.annTitle}>{e.title}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {/* Rehber */}
        <SectionTitle title="Kampüs Rehberi" />
        <Card style={[styles.pad, { paddingHorizontal: 14 }]} padded={false}>
          <ListRow icon="library" iconColor={RED} iconBg={C.uniRedSoft} title="Merkez Kütüphane" subtitle="08:00 – 23:00" />
          <ListRow icon="phone" iconColor={RED} iconBg={C.uniRedSoft} title="Öğrenci İşleri" subtitle="0424 237 00 00" onPress={() => Linking.openURL('tel:04242370000')} />
          <ListRow icon="hospital-building" iconColor={RED} iconBg={C.uniRedSoft} title="FÜ Hastanesi" subtitle="0424 233 35 55" onPress={() => Linking.openURL('tel:04242333555')} last />
        </Card>
        <View style={{ height: 24 }} />
      </ScrollView>

      <AnnouncementDetailModal visible={detailVisible} onClose={() => setDetailVisible(false)} detail={detail} loading={detailLoading} />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  hero: { backgroundColor: RED, paddingHorizontal: Theme.spacing.lg, paddingTop: 10, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroKicker: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#fff', ...Theme.text.display },
  heroBadge: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 16 },
  pad: { marginHorizontal: Theme.spacing.lg },
  obsCard: { margin: Theme.spacing.lg, marginBottom: 8, backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.uniBorder, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...Theme.shadows.md },
  obsIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  obsTitle: { ...Theme.text.h3, color: C.textPrimary },
  obsSub: { ...Theme.text.small, color: C.uniMuted, marginTop: 2 },
  obsArrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.uniRedSoft, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', paddingHorizontal: Theme.spacing.lg, gap: 10 },
  quick: { flex: 1, alignItems: 'center', gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.uniBorder, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 11, fontWeight: '700', color: C.textSecondary },
  chips: { paddingHorizontal: Theme.spacing.lg, gap: 8, paddingBottom: 12 },
  annTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  annDate: { ...Theme.text.small, color: C.textMuted },
  annTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700', lineHeight: 20 },
}));
