import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Theme } from '../../constants/Theme';
import { ApiService, Pharmacy, OutageItem } from '../../services/apiService';
import { PrayerCard } from '../../components/PrayerCard';
import { Card, EmptyState, IconCircle, LoadingState, Notice, Pill, PrimaryButton, ScreenHeader, SectionTitle } from '../../components/ui';

const C = Theme.colors;
type TabKey = 'pharmacy' | 'outages' | 'directory';

const DIRECTORY = [
  { name: 'Elazığ Belediyesi', sub: 'Çağrı merkezi', phone: '153', icon: 'office-building', color: C.primary, bg: C.surfaceVariant },
  { name: 'Acil Çağrı', sub: 'Ambulans · Polis · İtfaiye', phone: '112', icon: 'phone-alert', color: C.danger, bg: C.dangerBg },
  { name: 'Aksa Elektrik', sub: 'Arıza bildirimi', phone: '186', icon: 'flash', color: C.warning, bg: C.warningBg },
  { name: 'Su ve Kanalizasyon', sub: 'Arıza bildirimi', phone: '185', icon: 'water-pump', color: C.info, bg: C.infoBg },
  { name: 'Elazığ Valiliği', sub: 'Açık Kapı', phone: '0424 237 10 00', icon: 'shield-account', color: C.primary, bg: C.surfaceVariant },
  { name: 'FÜ Hastanesi', sub: 'Santral', phone: '0424 233 35 55', icon: 'hospital-building', color: C.uniRed, bg: C.uniRedSoft },
];

export default function ServicesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('pharmacy');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [outages, setOutages] = useState<OutageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([ApiService.getPharmacies(), ApiService.getOutages()]);
    setPharmacies(p);
    setOutages(o);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  const navigate = (p: Pharmacy) =>
    Linking.openURL(p.lat && p.lng ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : `https://maps.google.com/?q=${encodeURIComponent(`${p.name} ${p.address} Elazığ`)}`);

  const TABS: { key: TabKey; label: string; icon: string; count?: number }[] = [
    { key: 'pharmacy', label: 'Eczane', icon: 'medical-bag', count: pharmacies.length || undefined },
    { key: 'outages', label: 'Kesinti', icon: 'flash-alert', count: outages.length || undefined },
    { key: 'directory', label: 'Numaralar', icon: 'phone-classic' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
      <ScreenHeader
        title="Hizmetler"
        subtitle="Nöbetçi eczane, kesintiler, önemli numaralar"
        right={
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)}>
            <Ionicons name="notifications-outline" size={20} color={C.primary} />
          </TouchableOpacity>
        }
      />

      <View style={styles.segment}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setTab(t.key)} activeOpacity={0.85}>
              <MaterialCommunityIcons name={t.icon as any} size={16} color={active ? '#fff' : C.textMuted} />
              <Text style={[styles.segText, active && styles.segTextActive]}>
                {t.label}
                {t.count ? ` (${t.count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}>
        {tab === 'pharmacy' ? (
          <View style={styles.section}>
            <SectionTitle title="Bugün Nöbetçi Eczaneler" subtitle="Elazığ Belediyesi listesi" style={styles.sectionTitle} />
            {loading ? (
              <LoadingState label="Eczaneler alınıyor..." />
            ) : pharmacies.length === 0 ? (
              <Card>
                <EmptyState icon="medical-bag" title="Liste alınamadı" description="Nöbet listesi güncellenirken sorun oluştu; aşağı çekerek yenileyin." />
              </Card>
            ) : (
              pharmacies.map((p) => (
                <Card key={p.id} style={{ gap: 10 }}>
                  <View style={styles.row}>
                    <IconCircle name="plus-thick" color={C.danger} bg={C.dangerBg} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{p.name}</Text>
                      <Text style={styles.sub}>{[p.district, p.dutyHours].filter(Boolean).join(' · ') || 'Elazığ'}</Text>
                    </View>
                    <Pill label="24 SAAT" color={C.danger} bg={C.dangerBg} />
                  </View>
                  <View style={styles.row}>
                    <Ionicons name="location-outline" size={15} color={C.textMuted} />
                    <Text style={[styles.sub, { flex: 1 }]}>{p.address}</Text>
                  </View>
                  <View style={styles.btnRow}>
                    {p.phone ? <PrimaryButton label="Ara" icon="call" onPress={() => call(p.phone)} style={{ flex: 1 }} /> : null}
                    <PrimaryButton label="Yol Tarifi" icon="navigate-outline" variant="outline" onPress={() => navigate(p)} style={{ flex: 1 }} />
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : null}

        {tab === 'outages' ? (
          <View style={styles.section}>
            <SectionTitle title="Elektrik & Su Kesintileri" subtitle="Planlı çalışmalar" style={styles.sectionTitle} />
            {loading ? (
              <LoadingState label="Kesintiler alınıyor..." />
            ) : outages.length === 0 ? (
              <Card>
                <EmptyState icon="check-circle-outline" title="Aktif kesinti yok" description="Elazığ genelinde planlı elektrik/su kesintisi bildirisi bulunmuyor." tint={C.success} />
              </Card>
            ) : (
              outages.map((o) => (
                <Card key={o.id} style={{ gap: 8 }}>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Pill label={o.type === 'electric' ? '⚡ Elektrik' : '💧 Su'} color={o.type === 'electric' ? C.warning : C.info} bg={o.type === 'electric' ? C.warningBg : C.infoBg} />
                    <Text style={styles.sub}>
                      {o.startTime} – {o.endTime}
                    </Text>
                  </View>
                  <Text style={styles.title}>{o.title}</Text>
                  {o.region ? <Text style={styles.sub}>📍 {o.region}</Text> : null}
                  {o.description ? <Text style={styles.desc}>{o.description}</Text> : null}
                </Card>
              ))
            )}
          </View>
        ) : null}

        {tab === 'directory' ? (
          <View style={styles.section}>
            <SectionTitle title="Önemli Numaralar" subtitle="Dokunarak ara" style={styles.sectionTitle} />
            <View style={styles.dirGrid}>
              {DIRECTORY.map((d) => (
                <TouchableOpacity key={d.phone} style={styles.dirCard} onPress={() => call(d.phone)} activeOpacity={0.85}>
                  <IconCircle name={d.icon} color={d.color} bg={d.bg} size={44} />
                  <Text style={styles.dirName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.dirSub} numberOfLines={1}>{d.sub}</Text>
                  <Text style={styles.dirPhone}>{d.phone}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Notice tone="info" text="Acil durumlarda 112 tek numaradan ambulans, polis ve itfaiyeye ulaşırsınız." />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle title="Namaz Vakitleri" subtitle="Elazığ" style={styles.sectionTitle} />
          <PrayerCard />
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', marginHorizontal: Theme.spacing.lg, backgroundColor: C.surface, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.cardBorder, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  segBtnActive: { backgroundColor: C.primary },
  segText: { fontSize: 12, color: C.textMuted, fontWeight: '700' },
  segTextActive: { color: '#fff' },
  content: { paddingBottom: 16 },
  section: { paddingHorizontal: Theme.spacing.lg, gap: 10 },
  sectionTitle: { paddingHorizontal: 0, marginTop: 14, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { ...Theme.text.h3, color: C.textPrimary },
  sub: { ...Theme.text.small, color: C.textMuted, lineHeight: 17 },
  desc: { ...Theme.text.small, color: C.textSecondary, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: 8 },
  dirGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dirCard: { width: '48%', flexGrow: 1, backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.cardBorder, padding: 14, gap: 4, ...Theme.shadows.sm },
  dirName: { ...Theme.text.h3, color: C.textPrimary, marginTop: 6 },
  dirSub: { fontSize: 11, color: C.textMuted },
  dirPhone: { fontSize: 14, fontWeight: '800', color: C.primary, marginTop: 2 },
});
