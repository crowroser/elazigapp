import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { BriefService, DailyBrief } from '../services/briefService';
import { NotificationService, NotifPreferences } from '../services/notificationService';
import { LiveNotificationService, LiveCapabilities } from '../services/liveNotificationService';
import { WidgetService } from '../services/widgetService';
import { Card, Notice, Pill, ScreenHeader, SectionTitle } from '../components/ui';
import { briefToneColors } from '../components/BriefCard';

const C = Theme.colors;

/**
 * "Günün Özeti" ekranı (L2) — Samsung Now Brief tarzı.
 * Bugün/yarın sekmesi, tüm özet satırları, sabah/akşam bildirimi ve Now Bar geri sayımı kısayolları.
 */
export default function BriefScreen() {
  useAppTheme();
  const router = useRouter();
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<'today' | 'tomorrow'>(new Date().getHours() >= 18 ? 'tomorrow' : 'today');
  const [prefs, setPrefs] = useState<NotifPreferences | null>(null);
  const [caps, setCaps] = useState<LiveCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (h: 'today' | 'tomorrow') => {
    setLoading(true);
    setError(null);
    try {
      const b = await BriefService.buildBrief({ horizon: h });
      setBrief(b);
      // Widget'ı da güncel tut (bugün için)
      if (h === 'today') WidgetService.updateNativeWidgets(BriefService.toWidgetData(b)).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Özet oluşturulamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(horizon);
  }, [horizon, load]);

  useEffect(() => {
    NotificationService.getPreferences().then(setPrefs);
    LiveNotificationService.getCapabilities().then(setCaps);
  }, []);

  const updatePref = async <K extends keyof NotifPreferences>(k: K, v: NotifPreferences[K]) => {
    if (!prefs) return;
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    await NotificationService.savePreferences(next);
    if (k === 'briefMorningEnabled' || k === 'briefEveningEnabled') {
      const ok = await NotificationService.ensurePermission();
      if (!ok && v) {
        Alert.alert('Bildirim izni yok', 'Ayarlardan bildirim iznini açınca özet bildirimleri gönderilebilir.');
        return;
      }
      if (next.briefMorningEnabled || next.briefEveningEnabled) await NotificationService.scheduleBrief(next);
      else await NotificationService.cancelCategory('brief');
    }
    if (k === 'prayerLiveEnabled') {
      const ok = await LiveNotificationService.setPrayerLiveEnabled(Boolean(v));
      if (!ok && v) Alert.alert('Desteklenmiyor', 'Bu build\'de canlı bildirim modülü yok (Android native build gerekir).');
    }
  };

  const goto = (route?: string) => {
    if (!route) return;
    try {
      router.push(route as any);
    } catch {}
  };

  const liveSupported = LiveNotificationService.isAvailable();
  const promoted = !!caps?.promoted;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title={brief?.greeting || 'Günün Özeti'}
        subtitle={brief ? brief.dateText : 'Hazırlanıyor…'}
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => load(horizon)} style={styles.refreshBtn} hitSlop={8} accessibilityLabel="Yenile">
            <Ionicons name="refresh" size={20} color={C.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(horizon)} colors={[C.primary]} tintColor={C.primary} />}
      >
        {/* Bugün / Yarın */}
        <View style={styles.tabs}>
          {(['today', 'tomorrow'] as const).map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.tab, horizon === h && styles.tabActive]}
              onPress={() => setHorizon(h)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, horizon === h && styles.tabTextActive]}>{h === 'today' ? 'Bugün' : 'Yarın'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Notice tone="danger" text={error} /> : null}
        {brief?.partial ? <Notice tone="warning" text="Bazı kaynaklar (OBS) önbellekten geldi; en fazla 12 saat eski olabilir." /> : null}

        {/* Özet satırları */}
        {brief && brief.items.length === 0 && !loading ? (
          <Card>
            <Text style={styles.empty}>
              Özetlenecek veri bulunamadı. OBS hesabı bağlayıp favori durak ve ElazığKart numaranızı ekledikçe özet zenginleşir.
            </Text>
          </Card>
        ) : null}

        {brief?.items.map((it) => {
          const t = briefToneColors(it.tone);
          return (
            <Card key={it.id} onPress={it.route ? () => goto(it.route) : undefined} style={styles.itemCard}>
              <View style={[styles.itemIcon, { backgroundColor: t.bg }]}>
                <MaterialCommunityIcons name={it.icon as any} size={22} color={t.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {it.title}
                </Text>
                {it.subtitle ? (
                  <Text style={styles.itemSub} numberOfLines={2}>
                    {it.subtitle}
                  </Text>
                ) : null}
              </View>
              {it.route ? <Ionicons name="chevron-forward" size={18} color={C.textFaint} /> : null}
            </Card>
          );
        })}

        {/* Bildirim & canlı kısayolları */}
        <SectionTitle title="Özet Bildirimleri" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <View style={[styles.itemIcon, { backgroundColor: C.accentBg }]}>
              <MaterialCommunityIcons name="weather-sunset-up" size={20} color={C.accentDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Sabah özeti</Text>
              <Text style={styles.itemSub}>Her sabah {prefs?.briefMorningTime || '07:30'} — dersler, sınav, bakiye, hava</Text>
            </View>
            <Switch
              value={!!prefs?.briefMorningEnabled}
              onValueChange={(v) => updatePref('briefMorningEnabled', v)}
              trackColor={{ true: C.primaryLight }}
              disabled={!prefs}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.itemIcon, { backgroundColor: C.secondaryBg }]}>
              <MaterialCommunityIcons name="weather-night" size={20} color={C.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Akşam özeti</Text>
              <Text style={styles.itemSub}>Her akşam {prefs?.briefEveningTime || '21:00'} — yarının ilk dersi ve sınavı</Text>
            </View>
            <Switch
              value={!!prefs?.briefEveningEnabled}
              onValueChange={(v) => updatePref('briefEveningEnabled', v)}
              trackColor={{ true: C.primaryLight }}
              disabled={!prefs}
            />
          </View>
          <TouchableOpacity style={styles.link} onPress={() => router.push('/notifications' as any)}>
            <Text style={styles.linkText}>Saatleri ve diğer bildirimleri düzenle</Text>
            <Ionicons name="chevron-forward" size={14} color={C.primary} />
          </TouchableOpacity>
        </Card>

        <SectionTitle title="Canlı Bildirim (Now Bar)" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <View style={[styles.itemIcon, { backgroundColor: C.prayerBg }]}>
              <MaterialCommunityIcons name="mosque" size={20} color={C.prayerGold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Namaz vaktine geri sayım</Text>
              <Text style={styles.itemSub}>
                {liveSupported
                  ? promoted
                    ? 'Kilit ekranı, durum çubuğu ve Samsung Now Bar\'da canlı sayaç'
                    : 'Bildirim panelinde sürekli güncellenen sayaç (Now Bar için Android 16 / One UI 8 gerekir)'
                  : 'Bu build\'de canlı bildirim modülü yok'}
              </Text>
            </View>
            <Switch
              value={!!prefs?.prayerLiveEnabled}
              onValueChange={(v) => updatePref('prayerLiveEnabled', v)}
              trackColor={{ true: C.prayerGold }}
              disabled={!prefs || !liveSupported}
            />
          </View>
          {caps ? (
            <View style={styles.capsRow}>
              <Pill label={`Android ${caps.sdk >= 36 ? '16+' : `API ${caps.sdk}`}`} color={C.textSecondary} bg={C.surfaceSubtle} />
              <Pill
                label={promoted ? (caps.canPostPromoted ? 'Live Updates açık' : 'Live Updates izni kapalı') : 'Klasik ongoing bildirim'}
                color={promoted && caps.canPostPromoted ? C.success : C.textMuted}
                bg={promoted && caps.canPostPromoted ? C.successBg : C.surfaceSubtle}
              />
            </View>
          ) : null}
          {promoted && caps && !caps.canPostPromoted ? (
            <Notice tone="info" text="Ayarlar > Bildirimler > Canlı güncellemeler bölümünden Elazığ Şehir için izni açın; aksi halde bildirim yalnızca panelde görünür." />
          ) : null}
          <Text style={styles.hint}>
            Otobüs canlı takibi: Ulaşım ekranında bir duraktaki araç için "Haber ver"e dokunun — varış süresi ve kalan duraklar Now Bar'da geri sayımla görünür.
          </Text>
        </Card>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    content: { padding: Theme.spacing.lg, paddingBottom: 32, gap: Theme.spacing.sm },
    refreshBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    tabs: { flexDirection: 'row', backgroundColor: C.surfaceSubtle, borderRadius: Theme.radius.pill, padding: 4, marginBottom: 4 },
    tab: { flex: 1, paddingVertical: 8, borderRadius: Theme.radius.pill, alignItems: 'center' },
    tabActive: { backgroundColor: C.surface, ...Theme.shadows.sm },
    tabText: { ...Theme.text.small, color: C.textMuted, fontWeight: '700' },
    tabTextActive: { color: C.primary },
    section: { paddingHorizontal: 0, marginTop: 12, marginBottom: 0 },
    itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    itemTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
    itemSub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
    linkText: { ...Theme.text.small, color: C.primary, fontWeight: '700' },
    capsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    hint: { ...Theme.text.small, color: C.textMuted, lineHeight: 18 },
    empty: { ...Theme.text.body, color: C.textMuted, lineHeight: 20 },
  })
);
