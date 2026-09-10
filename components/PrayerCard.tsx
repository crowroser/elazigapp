import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';
import { ApiService, PrayerTime } from '../services/apiService';
import { Card, LoadingState } from './ui';

const C = Theme.colors;

export const PrayerCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [times, setTimes] = useState<PrayerTime[]>([]);
  const [nextPrayer, setNextPrayer] = useState<PrayerTime | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await ApiService.getPrayerTimesAsync();
      if (res?.times) {
        setTimes(res.times);
        if (res.nextPrayer) {
          setNextPrayer(res.nextPrayer);
          const now = new Date();
          const cur = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
          const [h, m] = res.nextPrayer.time.split(':').map(Number);
          let target = h * 3600 + m * 60;
          if (target < cur) target += 24 * 3600;
          setSecondsLeft(target - cur);
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (secondsLeft === null) return;
    const t = setInterval(() => setSecondsLeft((p) => (p && p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft !== null]);

  const fmt = (s: number | null) => {
    if (s === null) return '--:--';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} sa ${m} dk` : `${m} dk ${s % 60} sn`;
  };

  if (loading) {
    return (
      <Card style={styles.card}>
        <LoadingState label="Namaz vakitleri alınıyor..." tint={C.prayerGold} />
      </Card>
    );
  }
  if (times.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="mosque" size={20} color={C.prayerGold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>SONRAKİ VAKİT</Text>
          <Text style={styles.next}>{nextPrayer ? nextPrayer.nameTr : '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.countdown}>{fmt(secondsLeft)}</Text>
          <Text style={styles.countdownSub}>kaldı</Text>
        </View>
      </View>
      {!compact ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {times.map((t) => (
            <View key={t.name} style={[styles.time, t.isNext && styles.timeActive]}>
              <Text style={[styles.timeName, t.isNext && styles.timeNameActive]}>{t.nameTr}</Text>
              <Text style={[styles.timeValue, t.isNext && styles.timeValueActive]}>{t.time}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: Theme.spacing.lg, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.prayerBg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.6 },
  next: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
  countdown: { fontSize: 16, fontWeight: '800', color: C.prayerGold },
  countdownSub: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
  strip: { gap: 8 },
  time: { backgroundColor: C.surfaceSubtle, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', minWidth: 64 },
  timeActive: { backgroundColor: C.prayerGold },
  timeName: { fontSize: 10, fontWeight: '700', color: C.textMuted },
  timeNameActive: { color: 'rgba(255,255,255,0.85)' },
  timeValue: { fontSize: 13, fontWeight: '800', color: C.textPrimary, marginTop: 2 },
  timeValueActive: { color: '#fff' },
});
