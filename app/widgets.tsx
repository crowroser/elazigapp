import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { WidgetService, WidgetData } from '../services/widgetService';
import { ApiService } from '../services/apiService';
import { PrefsService } from '../services/prefsService';
import { Card, IconCircle, Notice, PrimaryButton } from '../components/ui';

const C = Theme.colors;

export default function WidgetsScreen() {
  useAppTheme();
  const [data, setData] = useState<WidgetData>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning' | 'success' | 'danger'; text: string } | null>(null);
  const nativeOk = WidgetService.isNativeAvailable();

  useEffect(() => {
    WidgetService.getWidgetData().then(setData);
  }, []);

  /** Tüm widget verilerini canlı kaynaklardan toplar; hiçbir alan uydurulmaz */
  const sync = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const [prayer, news, cardNo, notifRaw] = await Promise.all([
        ApiService.getPrayerTimesAsync(),
        ApiService.getNews(),
        PrefsService.getElazigKartNo(),
        AsyncStorage.getItem('@elazig_notification_preferences'),
      ]);
      const next: WidgetData = {};

      if (prayer?.nextPrayer) {
        next.prayer_name = prayer.nextPrayer.nameTr;
        next.prayer_time = prayer.nextPrayer.time;
        const [h, m] = prayer.nextPrayer.time.split(':').map(Number);
        const now = new Date();
        let diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
        if (diff < 0) diff += 24 * 60;
        next.prayer_countdown = `${Math.floor(diff / 60)} sa ${diff % 60} dk`;
      }

      if (news[0]) next.news_title = news[0].title;

      if (cardNo) {
        const bal = await ApiService.queryCardBalance(cardNo);
        if (bal.success) {
          next.elkart_balance = `${(bal.bakiye ?? 0).toFixed(2).replace('.', ',')} ₺`;
          next.elkart_type = 'ElazığKart';
        }
      }

      // Takip edilen hat + son seçilen durak (uyarılar ekranı / son aramalar)
      const prefs = notifRaw ? JSON.parse(notifRaw) : {};
      const routes = await ApiService.getAllRoutes();
      const route = routes.find((r) => r.kod === prefs.selectedRouteCode);
      if (route) next.bus_line_name = `Hat ${route.hatNo} · ${route.aciklama}`;
      const recentStops = await PrefsService.getRecentStops();
      if (recentStops[0]) {
        const stations = await ApiService.getBusStations();
        const st = stations.find((s) => s.name === recentStops[0]);
        if (st) {
          next.bus_stop_name = st.name;
          const approaching = await ApiService.getStationRemainingTime(st.id);
          const target = route ? approaching.find((a) => a.busLineCode === route.kod) : approaching[0];
          if (target) {
            next.bus_eta = target.remainingTimeCurr != null ? `${target.remainingTimeCurr} dk` : '—';
            if (!route) next.bus_line_name = `Hat ${target.busLineNo} · ${target.busLineLongName || target.busLineCode}`;
            const second = approaching.filter((a) => a.busLineCode === target.busLineCode)[1];
            next.bus_next_eta = second?.remainingTimeCurr != null ? `${second.remainingTimeCurr} dk` : '';
          }
        }
      }

      const pushed = await WidgetService.updateNativeWidgets(next);
      setData({ ...data, ...next });
      setNotice(
        pushed
          ? { tone: 'success', text: 'Canlı veriler ana ekran widget\'larına aktarıldı.' }
          : { tone: 'warning', text: 'Veriler kaydedildi; bu build\'de native widget modülü bulunmadığından ana ekran widget\'ı güncellenemedi.' }
      );
    } catch (e: any) {
      setNotice({ tone: 'danger', text: e?.message || 'Senkronizasyon başarısız.' });
    } finally {
      setBusy(false);
    }
  };

  const Preview = ({ icon, color, bg, title, lines }: { icon: string; color: string; bg: string; title: string; lines: (string | undefined)[] }) => (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconCircle name={icon} color={color} bg={bg} size={36} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {lines.filter(Boolean).length === 0 ? (
        <Text style={styles.empty}>Henüz veri yok — "Canlı verileri senkronla"ya dokun.</Text>
      ) : (
        lines.filter(Boolean).map((l, i) => (
          <Text key={i} style={i === 0 ? styles.big : styles.line}>
            {l}
          </Text>
        ))
      )}
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>Ana ekran widget'ları bu verileri gösterir. İçerik yalnızca canlı kaynaklardan (belediye API, OBS, namaz vakitleri, haber RSS) doldurulur.</Text>
        {!nativeOk ? <Notice tone="info" text="Native widget modülü bu build'e dahil değil (native-widgets klasörü). Önizleme ve veri kaydı çalışır." /> : null}
        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}
        <PrimaryButton label="Canlı verileri senkronla" icon="sync" onPress={sync} loading={busy} />

        <Preview icon="mosque" color={C.prayerGold} bg={C.prayerBg} title="Namaz Vakti" lines={[data.prayer_name && `${data.prayer_name} · ${data.prayer_time}`, data.prayer_countdown && `${data.prayer_countdown} kaldı`]} />
        <Preview icon="bus-clock" color={C.primary} bg={C.surfaceVariant} title="Otobüs" lines={[data.bus_line_name, data.bus_stop_name && `Durak: ${data.bus_stop_name}`, data.bus_eta && `Yaklaşan: ${data.bus_eta}${data.bus_next_eta ? ` · Sonraki: ${data.bus_next_eta}` : ''}`]} />
        <Preview icon="credit-card-chip-outline" color={C.accentDark} bg={C.accentBg} title="ElazığKart" lines={[data.elkart_balance, data.elkart_type]} />
        <Preview icon="newspaper-variant-outline" color={C.info} bg={C.infoBg} title="Son Haber" lines={[data.news_title]} />
        {data.updated_at ? <Text style={styles.updated}>Son senkron: {new Date(data.updated_at).toLocaleString('tr-TR')}</Text> : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  lead: { ...Theme.text.small, color: C.textMuted, lineHeight: 18 },
  title: { ...Theme.text.h3, color: C.textPrimary },
  big: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  line: { ...Theme.text.small, color: C.textSecondary },
  empty: { ...Theme.text.small, color: C.textFaint },
  updated: { ...Theme.text.small, color: C.textFaint, textAlign: 'center' },
}));
