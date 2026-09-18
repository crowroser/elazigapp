import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Vibration, Alert, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { ApiService, CardBalanceResult, DiningMenu, RouteLineItem } from '../services/apiService';
import { PrefsService } from '../services/prefsService';
import { NotificationService, NotifPreferences } from '../services/notificationService';
import { LiveNotificationService, LiveCapabilities, LOCKSCREEN_HINT_KEY } from '../services/liveNotificationService';
import { ObsService } from '../services/obsService';
import { WidgetService } from '../services/widgetService';
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
const MORNING_TIMES = ['06:30', '07:00', '07:30', '08:00', '08:30'];
const EVENING_TIMES = ['20:00', '21:00', '22:00'];

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
    briefMorningEnabled: false,
    briefMorningTime: '07:30',
    briefEveningEnabled: false,
    briefEveningTime: '21:00',
    prayerLiveEnabled: false,
    lessonLiveEnabled: false,
  });
  const [liveCaps, setLiveCaps] = useState<LiveCapabilities | null>(null);
  const [lockHintDone, setLockHintDone] = useState(true);

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
      syncLive().catch(() => {});
      AsyncStorage.getItem(LOCKSCREEN_HINT_KEY).then((v) => setLockHintDone(v === '1')).catch(() => {});

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
    // Sistem ayarlarından (Canlı güncellemeler / Alarmlar izni) ya da kilit ekranındaki "Kapat"tan dönüşte tazele
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncLive().catch(() => {});
    });
    return () => appStateSub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Yetenekleri okur ve JS tercihlerini native durumla eşitler: bildirimdeki "Kapat" düğmesi native tercihi
   * kapatır, uygulama tekrar öne gelince anahtar da kapalıya düşmeli.
   */
  async function syncLive() {
    const [p, caps] = await Promise.all([NotificationService.getPreferences(), LiveNotificationService.getCapabilities()]);
    setLiveCaps(caps);
    if (caps && ((p.prayerLiveEnabled && !caps.prayerLiveEnabled) || (p.lessonLiveEnabled && !caps.lessonLiveEnabled))) {
      const synced = {
        ...p,
        prayerLiveEnabled: p.prayerLiveEnabled && caps.prayerLiveEnabled,
        lessonLiveEnabled: p.lessonLiveEnabled && caps.lessonLiveEnabled,
      };
      setPrefs(synced);
      await NotificationService.savePreferences(synced);
    }
  }

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
    } else if (k === 'briefMorningEnabled' || k === 'briefEveningEnabled' || k === 'briefMorningTime' || k === 'briefEveningTime') {
      // L2: Özet bildirimi anında yeniden planlanır (6 saatlik senkron bekletmesine takılmasın)
      if (next.briefMorningEnabled || next.briefEveningEnabled) await NotificationService.scheduleBrief(next);
      else await NotificationService.cancelCategory('brief');
    } else if (k === 'prayerLiveEnabled') {
      // L1: Native AlarmManager'lı geri sayım bildirimi
      const ok = await LiveNotificationService.setPrayerLiveEnabled(Boolean(v));
      if (!ok && v) Alert.alert('Desteklenmiyor', "Bu build'de canlı bildirim modülü yok (Android native build gerekir).");
    } else if (k === 'lessonLiveEnabled') {
      // B6: Ders zili — önce güncel program native tarafa yazılır, sonra alarm kurulur
      const ok = await LiveNotificationService.setLessonLiveEnabled(Boolean(v));
      if (!ok && v) Alert.alert('Desteklenmiyor', "Bu build'de canlı bildirim modülü yok (Android native build gerekir).");
      else if (v) WidgetService.syncTimetableForLive().catch(() => {});
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
              {scheduledByCat.brief ? <Pill label={`✨ Özet: ${scheduledByCat.brief}`} color={C.success} bg={C.successBg} /> : null}
            </View>
          )}
        </Card>

        {/* L2: Günün Özeti (Now Brief tarzı) */}
        <SectionTitle title="Günün Özeti" action="Önizle" onAction={() => router.push('/brief' as any)} style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="weather-sunset-up" color={C.accentDark} bg={C.accentBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Sabah Özeti</Text>
              <Text style={styles.sub}>Bugünün dersleri, sınav, ElazığKart bakiyesi, namaz vakti ve hava tek bildirimde</Text>
            </View>
            <Switch
              value={prefs.briefMorningEnabled}
              onValueChange={(v) => updatePref('briefMorningEnabled', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          {prefs.briefMorningEnabled && (
            <>
              <Text style={styles.chipHeader}>Saat</Text>
              <View style={styles.chips}>
                {MORNING_TIMES.map((t) => (
                  <Chip key={t} label={t} active={prefs.briefMorningTime === t} onPress={() => updatePref('briefMorningTime', t)} />
                ))}
              </View>
            </>
          )}
        </Card>
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="weather-night" color={C.secondary} bg={C.secondaryBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Akşam Özeti</Text>
              <Text style={styles.sub}>Yarının ilk dersi, sınavı ve kesintileri — uyumadan önce hazırlık</Text>
            </View>
            <Switch
              value={prefs.briefEveningEnabled}
              onValueChange={(v) => updatePref('briefEveningEnabled', v)}
              trackColor={{ true: C.primaryLight }}
            />
          </View>
          {prefs.briefEveningEnabled && (
            <>
              <Text style={styles.chipHeader}>Saat</Text>
              <View style={styles.chips}>
                {EVENING_TIMES.map((t) => (
                  <Chip key={t} label={t} active={prefs.briefEveningTime === t} onPress={() => updatePref('briefEveningTime', t)} />
                ))}
              </View>
            </>
          )}
        </Card>

        {/* L1: Canlı bildirimler (Android 16 Live Updates / Samsung Now Bar) */}
        {Platform.OS === 'android' && (
          <>
            <SectionTitle title="Canlı Bildirimler (Now Bar)" style={styles.section} />
            <Card style={{ gap: 12 }}>
              <View style={styles.row}>
                <IconCircle name="mosque" color={C.prayerGold || C.accentDark} bg={C.prayerBg || C.accentBg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Namaz Vaktine Geri Sayım</Text>
                  <Text style={styles.sub}>
                    {!LiveNotificationService.isAvailable()
                      ? "Bu build'de canlı bildirim modülü yok"
                      : liveCaps?.promoted
                      ? "Kilit ekranı, durum çubuğu çipi ve Samsung Now Bar'da sürekli akan sayaç"
                      : 'Bildirim panelinde sürekli güncellenen sayaç (Now Bar için Android 16 / One UI 8)'}
                  </Text>
                </View>
                <Switch
                  value={prefs.prayerLiveEnabled}
                  onValueChange={(v) => updatePref('prayerLiveEnabled', v)}
                  trackColor={{ true: C.prayerGold || C.accentDark }}
                  disabled={!LiveNotificationService.isAvailable()}
                />
              </View>
              <View style={styles.row}>
                <IconCircle name="school-outline" color={C.uniRed} bg={C.uniRedSoft} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Ders Zili — Şu Anki / Sıradaki Ders</Text>
                  <Text style={styles.sub}>
                    {!hasObsAccount
                      ? 'OBS hesabı bağlayınca kullanılabilir'
                      : 'Ders başlamadan 45 dk önce geri sayım, ders boyunca bitişe kadar sayaç; günün son dersinden sonra kapanır'}
                  </Text>
                </View>
                <Switch
                  value={prefs.lessonLiveEnabled}
                  onValueChange={(v) => updatePref('lessonLiveEnabled', v)}
                  trackColor={{ true: C.uniRed }}
                  disabled={!LiveNotificationService.isAvailable() || !hasObsAccount}
                />
              </View>
              {liveCaps?.promoted && !liveCaps.canPostPromoted ? (
                <Notice tone="info" text="Ayarlar > Bildirimler > Canlı güncellemeler altında Elazığ Şehir'e izin verin; aksi halde sayaç yalnızca bildirim panelinde görünür." />
              ) : null}
              {liveCaps?.lockscreenContentHidden && !lockHintDone && (prefs.lessonLiveEnabled || prefs.prayerLiveEnabled) ? (
                <Notice
                  tone="info"
                  icon="lock-closed-outline"
                  text="Samsung kilit ekranında Now Bar yalnızca 'Elazığ Şehir' gösteriyor. Dokun → 'Kilitliyken içeriği göster veya gizle' → Her zaman göster."
                  onPress={() => {
                    AsyncStorage.setItem(LOCKSCREEN_HINT_KEY, '1').catch(() => {});
                    setLockHintDone(true);
                    LiveNotificationService.openAppNotificationSettings();
                  }}
                />
              ) : null}
              {liveCaps && !liveCaps.exactAlarms && (prefs.lessonLiveEnabled || prefs.prayerLiveEnabled) ? (
                <Notice
                  tone="warning"
                  icon="alarm-outline"
                  text="Dakika hassasiyeti için 'Alarmlar ve hatırlatıcılar' iznini açın — aksi halde ders/vakit geçişleri 10 dk'ya kadar gecikebilir. Dokunup izin verin."
                  onPress={() => LiveNotificationService.requestExactAlarms()}
                />
              ) : null}
              <Text style={styles.sub}>
                Otobüs canlı takibi ayrı bir ayar gerektirmez: Ulaşım ekranında "Haber ver"e dokunduğunuz araç varana kadar Now Bar'da takip edilir.
              </Text>
            </Card>
          </>
        )}

        {/* F7: Üniversite & OBS Bildirimleri */}
        <SectionTitle title="Fırat Üniversitesi & OBS" style={styles.section} />

        {/* Birim Duyuru Bildirimleri (uzaktan / anlık push) */}
        <Card style={{ gap: 12 }} onPress={() => router.push('/firat-units' as any)}>
          <View style={styles.row}>
            <IconCircle name="bullhorn-outline" color={C.uniRed} bg={C.uniRedSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Birim Duyuru Bildirimleri</Text>
              <Text style={styles.sub}>
                Seçtiğin fakülte, bölüm veya birimlerin yeni duyuruları anlık bildirim olarak gelsin
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
          </View>
        </Card>

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
  content: { padding: Theme.spacing.lg, paddingBottom: 32, gap: Theme.spacing.md },
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
