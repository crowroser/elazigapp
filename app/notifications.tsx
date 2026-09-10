import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Vibration, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme } from '../constants/Theme';
import { ApiService, CardBalanceResult, DiningMenu, RouteLineItem } from '../services/apiService';
import { PrefsService } from '../services/prefsService';
import { Card, Chip, IconCircle, LoadingState, Notice, PrimaryButton, ScreenHeader, SectionTitle } from '../components/ui';

const C = Theme.colors;
const KEY = '@elazig_notification_preferences';

interface Settings {
  walletAlert: boolean;
  walletThreshold: number;
  busAlert: boolean;
  selectedRouteCode: string;
  diningAlert: boolean;
  diningTime: string;
}

const DEFAULTS: Settings = {
  walletAlert: true,
  walletThreshold: 20,
  busAlert: false,
  selectedRouteCode: '',
  diningAlert: false,
  diningTime: '11:30',
};

const THRESHOLDS = [10, 20, 30, 50, 100];
const TIMES = ['11:00', '11:30', '12:00', '12:30'];

export default function NotificationsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [cardNo, setCardNo] = useState('');
  const [card, setCard] = useState<CardBalanceResult | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [routes, setRoutes] = useState<RouteLineItem[]>([]);
  const [pickRoute, setPickRoute] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {}
      const no = await PrefsService.getElazigKartNo();
      setCardNo(no);
      const [m, r] = await Promise.all([ApiService.getDiningMenu(), ApiService.getAllRoutes()]);
      setMenu(m);
      setRoutes(r);
      if (no) checkBalance(no);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (next: Settings) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => save({ ...settings, [k]: v });

  const checkBalance = async (no: string) => {
    setCardBusy(true);
    const res = await ApiService.queryCardBalance(no);
    setCard(res);
    setCardBusy(false);
    if (res.success && settings.walletAlert && (res.bakiye ?? 0) < settings.walletThreshold) {
      Vibration.vibrate([0, 300, 100, 300]);
      Alert.alert('Düşük bakiye', `ElazığKart bakiyeniz ₺${(res.bakiye ?? 0).toFixed(2)}, eşiğiniz ₺${settings.walletThreshold}.`);
    }
  };

  const selectedRoute = routes.find((r) => r.kod === settings.selectedRouteCode);
  const lowBalance = card?.success && (card.bakiye ?? 0) < settings.walletThreshold;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Uyarılar" subtitle="Uygulama açıkken kontrol edilen hatırlatıcılar" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Notice tone="info" text="Bu uyarılar uygulama açıldığında ve yenilendiğinde kontrol edilir; arka plan push bildirimi göndermez." />

        {/* Bakiye */}
        <SectionTitle title="ElazığKart Bakiye Uyarısı" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="credit-card-chip-outline" color={C.primary} bg={C.surfaceVariant} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Bakiye eşiğin altına düşünce uyar</Text>
              <Text style={styles.sub}>{cardNo ? `Kart: •••• ${cardNo.slice(-4)}` : 'Kayıtlı kart yok — ana sayfadan kart ekleyin'}</Text>
            </View>
            <Switch value={settings.walletAlert} onValueChange={(v) => set('walletAlert', v)} trackColor={{ true: C.primaryLight }} />
          </View>
          <View style={styles.chips}>
            {THRESHOLDS.map((t) => (
              <Chip key={t} label={`₺${t}`} active={settings.walletThreshold === t} onPress={() => set('walletThreshold', t)} />
            ))}
          </View>
          {cardBusy ? (
            <LoadingState label="Bakiye sorgulanıyor..." />
          ) : card ? (
            card.success ? (
              <Notice tone={lowBalance ? 'warning' : 'success'} text={`Güncel bakiye ₺${(card.bakiye ?? 0).toFixed(2)}${lowBalance ? ' — eşiğin altında' : ''}`} />
            ) : (
              <Notice tone="danger" text={card.message || 'Bakiye alınamadı.'} />
            )
          ) : null}
          {cardNo ? <PrimaryButton label="Şimdi kontrol et" icon="refresh" variant="outline" onPress={() => checkBalance(cardNo)} loading={cardBusy} /> : null}
        </Card>

        {/* Hat */}
        <SectionTitle title="Takip Ettiğim Hat" style={styles.section} />
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <IconCircle name="bus-clock" color={C.accentDark} bg={C.accentBg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{selectedRoute ? `Hat ${selectedRoute.hatNo} · ${selectedRoute.aciklama}` : 'Hat seçilmedi'}</Text>
              <Text style={styles.sub}>Ulaşım sekmesinde bu hat öncelikli gösterilir</Text>
            </View>
            <Switch value={settings.busAlert} onValueChange={(v) => set('busAlert', v)} trackColor={{ true: C.primaryLight }} />
          </View>
          <PrimaryButton label={pickRoute ? 'Listeyi kapat' : 'Hat seç'} icon="list" variant="outline" onPress={() => setPickRoute((p) => !p)} />
          {pickRoute ? (
            <View style={styles.chips}>
              {routes.map((r) => (
                <Chip key={r.kod} label={`${r.hatNo} · ${r.aciklama}`} active={settings.selectedRouteCode === r.kod} onPress={() => { set('selectedRouteCode', r.kod); setPickRoute(false); }} />
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
            <Switch value={settings.diningAlert} onValueChange={(v) => set('diningAlert', v)} trackColor={{ true: C.primaryLight }} />
          </View>
          <View style={styles.chips}>
            {TIMES.map((t) => (
              <Chip key={t} label={t} active={settings.diningTime === t} onPress={() => set('diningTime', t)} tint={C.uniRed} />
            ))}
          </View>
          {menu && (menu.lunch?.length || menu.dinner?.length) ? (
            <Text style={styles.menuText}>{(menu.lunch?.length ? menu.lunch : menu.dinner).map((d) => d.name).join(' · ')}</Text>
          ) : null}
        </Card>

        <TouchableOpacity style={styles.test} onPress={() => { Vibration.vibrate(200); Alert.alert('Test', 'Uyarı ayarlarınız kaydedildi.'); }}>
          <Ionicons name="notifications-outline" size={16} color={C.primary} />
          <Text style={styles.testText}>Ayarları test et</Text>
        </TouchableOpacity>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  section: { paddingHorizontal: 0, marginTop: 8, marginBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  sub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuText: { ...Theme.text.small, color: C.textSecondary, lineHeight: 18 },
  test: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  testText: { ...Theme.text.small, color: C.primary, fontWeight: '700' },
});
