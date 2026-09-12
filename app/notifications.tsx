import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Vibration, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { ApiService, CardBalanceResult, DiningMenu, RouteLineItem } from '../services/apiService';
import { PrefsService } from '../services/prefsService';
import { NotificationService, NotifPreferences } from '../services/notificationService';
import { ObsService } from '../services/obsService';
import { Card, Chip, IconCircle, LoadingState, Notice, Pill, PrimaryButton, ScreenHeader, SectionTitle } from '../components/ui';

const C = Theme.colors;
const LEGACY_KEY = '@elazig_notification_preferences';

interface LegacySettings {
  walletAlert: boolean;
  walletThreshold: number;
  busAlert: boolean;
  selectedRouteCode: string;
  diningAlert: boolean;
  diningTime: string;
}

const LEGACY_DEFAULTS: LegacySettings = {
  walletAlert: true,
  walletThreshold: 20,
  busAlert: false,
  selectedRouteCode: '',
  diningAlert: false,
  diningTime: '11:30',
};

const THRESHOLDS = [10, 20, 30, 50, 100];
const TIMES = ['11:00', '11:30', '12:00', '12:30'];
const LESSON_MINS = [10, 15, 20, 30];
const PRAYER_MINS = [5, 10, 15, 20];

export default function NotificationsScreen() {
  useAppTheme();
  const router = useRouter();
  const [legacy, setLegacy] = useState<LegacySettings>(LEGACY_DEFAULTS);
  const [prefs, setPrefs] = useState<NotifPreferences>({
    lessonEnabled: false,
    lessonMinutesBefore: 15,
    examEnabled: false,
    prayerEnabled: false,
    prayerMinutesBefore: 10,
    balanceEnabled: true,
    balanceThreshold: 20,
    gradeEnabled: true,
  });

  const [hasPermission, setHasPermission] = useState(true);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [scheduledByCat, setScheduledByCat] = useState<Record<string, number>>({});
  const [hasObsAccount, setHasObsAccount] = useState(false);

  const [cardNo, setCardNo] = useState('');
  const [card, setCard] = useState<CardBalanceResult | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [routes, setRoutes] = useState<RouteLineItem[]>([]);
  const [pickRoute, setPickRoute] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // 1. İzin kontrolü
      const perm = await NotificationService.ensurePermission();
      setHasPermission(perm);

      // 2. Tercihleri yükle
      const p = await NotificationService.getPreferences();
      setPrefs(p);

      try {
        const raw = await AsyncStorage.getItem(LEGACY_KEY);
        if (raw) setLegacy({ ...LEGACY_DEFAULTS, ...JSON.parse(raw) });
      } catch {}

      // 3. OBS hesabı var mı?
      const creds = await ObsService.getCredentials();
      setHasObsAccount(Boolean(creds?.studentNo));

      // 4. Planlanmış bildirim sayısı
      const count = await NotificationService.getScheduledCount();
      setScheduledCount(count);
      const catCounts = await NotificationService.getScheduledCountByCategory();
      setScheduledByCat(catCounts);

      // 5. Diğer veriler
      const no = await PrefsService.getElazigKartNo();
      setCardNo(no);
      const [m, r] = await Promise.all([ApiService.getDiningMenu(), ApiService.getAllRoutes()]);
      setMenu(m);
      setRoutes(r);
      if (no) checkBalance(no);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrefs = async (next: NotifPreferences) => {
    setPrefs(next);
    await NotificationService.savePreferences(next);
  };

  const updatePref = async <K extends keyof NotifPreferences>(k: K, v: NotifPreferences[K]) => {
    const next = { ...prefs, [k]: v };
    await savePrefs(next);

    // Kategori kapatıldıysa planları iptal et
    if (k === 'lessonEnabled' && !v) {
      await NotificationService.cancelCategory('lesson');
    } else if (k === 'examEnabled' && !v) {
      await NotificationService.cancelCategory('exam');
    } else if (k === 'prayerEnabled' && !v) {
      await NotificationService.cancelCategory('prayer');
    }

    // Güncel plan sayısını yenile
    const count = await NotificationService.getScheduledCount();
    setScheduledCount(count);
    const catCounts = await NotificationService.getScheduledCountByCategory();
    setScheduledByCat(catCounts);
  };

  const saveLegacy = async (next: LegacySettings) => {
    setLegacy(next);
    try {
      await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(next));
    } catch {}
  };

  const updateLegacy = <K extends keyof LegacySettings>(k: K, v: LegacySettings[K]) => {
    saveLegacy({ ...legacy, [k]: v });
  };

  const checkBalance = async (no: string) => {
    setCardBusy(true);
    const res = await ApiService.queryCardBalance(no);
    setCard(res);
    setCardBusy(false);
    if (res.success && prefs.balanceEnabled && (res.bakiye ?? 0) < prefs.balanceThreshold) {
      Vibration.vibrate([0, 300, 100, 300]);
      Alert.alert('Düşük bakiye', `ElazığKart bakiyeniz ₺${(res.bakiye ?? 0).toFixed(2)}, eşiğiniz ₺${prefs.balanceThreshold}.`);
    }
  };

  const handleManualSync = async () => {
    setSyncBusy(true);
    try {
      await NotificationService.syncAllSchedules(true);
      const count = await NotificationService.getScheduledCount();
      setScheduledCount(count);
      const catCounts = await NotificationService.getScheduledCountByCategory();
      setScheduledByCat(catCounts);
      Alert.alert('Başarılı', `Bildirimler senkronize edildi. Toplam ${count} aktif yerel bildirim planlandı.`);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Senkronizasyon yapılamadı.');
    } finally {
      setSyncBusy(false);
    }
  };

  const handleTestNotification = async () => {
    Vibration.vibrate(200);
    await NotificationService.sendImmediate(
      '🔔 Test Bildirimi',
      'Elazığ Şehir yerel bildirim altyapısı sorunsuz çalışıyor!',
      '/notifications',
      'grade'
    );
    Alert.alert('Test', 'Test bildirimi cihazınıza iletildi.');
  };

  const selectedRoute = routes.find((r) => r.kod === legacy.selectedRouteCode);
  const lowBalance = card?.success && (card.bakiye ?? 0) < prefs.balanceThreshold;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Bildirimler & Uyarılar"
        subtitle="Yerel zamanlayıcılar ve bildirim tercihleri"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!hasPermission && (
          <Notice
            tone="warning"
            text="Bildirim izni kapalı. Planlanan ders, sınav ve namaz bildirimlerini alabilmek için buraya dokunarak bildirim izni verin."
            onPress={async () => {
              const ok = await NotificationService.ensurePermission();
              setHasPermission(ok);
            }}
          />
        )}

        {/* Özet Rozet */}
        <Card style={styles.summaryCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text style={styles.summaryTitle}>Cihazda Planlanmış Bildirimler</Text>
              <Text style={styles.summarySub}>
                {scheduledCount > 0
                  ? `${scheduledCount} bildirim cihazınızda zamanlanmış durumda`
                  : 'Henüz planlanmış yerel bildirim yok'}
              </Text>
            </View>
            <Pill
              label={`${scheduledCount} Aktif`}
              color={scheduledCount > 0 ? C.success : C.textMuted}
              bg={scheduledCount > 0 ? C.successBg : C.surfaceSubtle}
            />
          </View>
          {scheduledCount > 0 && (
            <View style={styles.chips}>
              {scheduledByCat.lesson ? <Pill label={`📚 Ders: ${scheduledByCat.lesson}`} color={C.primary} bg={C.surfaceVariant} /> : null}
              {scheduledByCat.exam ? <Pill label={`📝 Sınav: ${scheduledByCat.exam}`} color={C.uniRed} bg={C.uniRedSoft} /> : null}
              {scheduledByCat.prayer ? <Pill label={`🕌 Namaz: ${scheduledByCat.prayer}`} color={C.accentDark} bg={C.accentBg} /> : null}
            </View>
          )}
        </Card>

        {/* F7: Üniversite & OBS Bildirimleri */}
        <SectionTitle title="Fırat Üniversitesi & OBS" style={styles.section} />

        {/* Ders Bildirimi */}
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="book-clock-outline" color={C.uniRed} bg={C.uniRedSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Ders Başlama Hatırlatıcısı</Text>
              <Text style={styles.sub}>
                {hasObsAccount
                  ? 'OBS ders programınızdaki dersler başlamadan önce bildirir'
                  : 'OBS hesabınız bağlı değil — üniversite sekmesinden giriş yapın'}
              </Text>
            </View>
            <Switch
              value={prefs.lessonEnabled}
              onValueChange={(v) => updatePref('lessonEnabled', v)}
              trackColor={{ true: C.uniRed }}
            />
          </View>
          {prefs.lessonEnabled && (
            <>
              <Text style={styles.chipHeader}>Kaç dakika önce bildirilsin?</Text>
              <View style={styles.chips}>
                {LESSON_MINS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m} dk önce`}
                    active={prefs.lessonMinutesBefore === m}
                    onPress={() => updatePref('lessonMinutesBefore', m)}
                    tint={C.uniRed}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        {/* Sınav Bildirimi */}
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="calendar-alert" color={C.uniRed} bg={C.uniRedSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Sınav Hatırlatıcısı</Text>
              <Text style={styles.sub}>Sınavdan 1 gün önce sabah 09:00'da ve sınavdan 1 saat önce bildirir</Text>
            </View>
            <Switch
              value={prefs.examEnabled}
              onValueChange={(v) => updatePref('examEnabled', v)}
              trackColor={{ true: C.uniRed }}
            />
          </View>
        </Card>

        {/* F8: Yeni Not Bildirimi */}
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="clipboard-check-outline" color={C.accentDark} bg={C.accentBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Yeni Not / Sınav Sonucu Bildirimi</Text>
              <Text style={styles.sub}>OBS'ye yeni harf notu veya vize/final sonucu girildiğinde anında bildirir</Text>
            </View>
            <Switch
              value={prefs.gradeEnabled}
              onValueChange={(v) => updatePref('gradeEnabled', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
        </Card>

        {/* F7: Şehir & Namaz Vakitleri */}
        <SectionTitle title="Namaz Vakitleri" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="mosque" color={C.prayerGold || C.accentDark} bg={C.accentBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Vakit Hatırlatıcısı</Text>
              <Text style={styles.sub}>Günün her vakti öncesinde cihazda yerel bildirim çalar</Text>
            </View>
            <Switch
              value={prefs.prayerEnabled}
              onValueChange={(v) => updatePref('prayerEnabled', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          {prefs.prayerEnabled && (
            <>
              <Text style={styles.chipHeader}>Kaç dakika önce bildirilsin?</Text>
              <View style={styles.chips}>
                {PRAYER_MINS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m} dk önce`}
                    active={prefs.prayerMinutesBefore === m}
                    onPress={() => updatePref('prayerMinutesBefore', m)}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        {/* Bakiye */}
        <SectionTitle title="ElazığKart Bakiye Uyarısı" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="credit-card-chip-outline" color={C.primary} bg={C.surfaceVariant} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Bakiye eşiğin altına düşünce uyar</Text>
              <Text style={styles.sub}>
                {cardNo ? `Kart: •••• ${cardNo.slice(-4)}` : 'Kayıtlı kart yok — ana sayfadan kart ekleyin'}
              </Text>
            </View>
            <Switch
              value={prefs.balanceEnabled}
              onValueChange={(v) => updatePref('balanceEnabled', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          <View style={styles.chips}>
            {THRESHOLDS.map((t) => (
              <Chip
                key={t}
                label={`₺${t}`}
                active={prefs.balanceThreshold === t}
                onPress={() => updatePref('balanceThreshold', t)}
              />
            ))}
          </View>
          {cardBusy ? (
            <LoadingState label="Bakiye sorgulanıyor..." />
          ) : card ? (
            card.success ? (
              <Notice
                tone={lowBalance ? 'warning' : 'success'}
                text={`Güncel bakiye ₺${(card.bakiye ?? 0).toFixed(2)}${lowBalance ? ' — eşiğin altında' : ''}`}
              />
            ) : (
              <Notice tone="danger" text={card.message || 'Bakiye alınamadı.'} />
            )
          ) : null}
          {cardNo ? (
            <PrimaryButton
              label="Şimdi bakiye kontrol et"
              icon="refresh"
              variant="outline"
              onPress={() => checkBalance(cardNo)}
              loading={cardBusy}
            />
          ) : null}
        </Card>

        {/* Hat */}
        <SectionTitle title="Takip Ettiğim Hat" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="bus-clock" color={C.accentDark} bg={C.accentBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {selectedRoute ? `Hat ${selectedRoute.hatNo} · ${selectedRoute.aciklama}` : 'Hat seçilmedi'}
              </Text>
              <Text style={styles.sub}>Ulaşım sekmesinde bu hat öncelikli gösterilir</Text>
            </View>
            <Switch
              value={legacy.busAlert}
              onValueChange={(v) => updateLegacy('busAlert', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          <PrimaryButton
            label={pickRoute ? 'Listeyi kapat' : 'Hat seç'}
            icon="list"
            variant="outline"
            onPress={() => setPickRoute((p) => !p)}
          />
          {pickRoute ? (
            <View style={styles.chips}>
              {routes.map((r) => (
                <Chip
                  key={r.kod}
                  label={`${r.hatNo} · ${r.aciklama}`}
                  active={legacy.selectedRouteCode === r.kod}
                  onPress={() => {
                    updateLegacy('selectedRouteCode', r.kod);
                    setPickRoute(false);
                  }}
                />
              ))}
            </View>
          ) : null}
        </Card>

        {/* Yemekhane */}
        <SectionTitle title="Yemekhane Hatırlatıcısı" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="silverware-fork-knife" color={C.uniRed} bg={C.uniRedSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Günün menüsünü hatırlat</Text>
              <Text style={styles.sub}>{menu?.date || 'Fırat Üniversitesi yemekhanesi'}</Text>
            </View>
            <Switch
              value={legacy.diningAlert}
              onValueChange={(v) => updateLegacy('diningAlert', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          <View style={styles.chips}>
            {TIMES.map((t) => (
              <Chip
                key={t}
                label={t}
                active={legacy.diningTime === t}
                onPress={() => updateLegacy('diningTime', t)}
                tint={C.uniRed}
              />
            ))}
          </View>
          {menu && (menu.lunch?.length || menu.dinner?.length) ? (
            <Text style={styles.menuText}>
              {(menu.lunch?.length ? menu.lunch : menu.dinner).map((d) => d.name).join(' · ')}
            </Text>
          ) : null}
        </Card>

        {/* Android Pil Uyarısı (F7) */}
        {Platform.OS === 'android' && (
          <Notice
            tone="info"
            icon="battery-charging-outline"
            text="Samsung, Xiaomi vb. bazı Android cihazlarda planlanan ders ve namaz bildirimlerinin vaktinde çalması için Ayarlar > Uygulamalar > Elazığ Şehir > Pil ayarını 'Kısıtlamasız' yapmanız önerilir."
          />
        )}

        {/* İşlem Düğmeleri */}
        <PrimaryButton
          label="Tüm Bildirimleri Şimdi Senkronize Et"
          icon="sync"
          onPress={handleManualSync}
          loading={syncBusy}
        />

        <TouchableOpacity style={styles.test} onPress={handleTestNotification}>
          <Ionicons name="notifications-outline" size={16} color={C.primary} />
          <Text style={styles.testText}>Test Bildirimi Gönder</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  section: { paddingHorizontal: 0, marginTop: 8, marginBottom: 0 },
  summaryCard: { gap: 10, backgroundColor: C.surfaceSubtle },
  summaryTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  summarySub: { ...Theme.text.small, color: C.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  sub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },
  chipHeader: { ...Theme.text.caption, color: C.textSecondary, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuText: { ...Theme.text.small, color: C.textSecondary, lineHeight: 18 },
  test: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  testText: { ...Theme.text.small, color: C.primary, fontWeight: '700' },
}));
