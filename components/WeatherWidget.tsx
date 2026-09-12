import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, themedStyles } from '../constants/Theme';
import { WeatherData } from '../services/apiService';

const C = Theme.colors;

function iconFor(cond: string) {
  const c = cond.toLowerCase();
  if (c.includes('güneş') || c.includes('sunny') || c.includes('clear')) return 'weather-sunny';
  if (c.includes('bulut') || c.includes('cloud') || c.includes('overcast')) return 'weather-partly-cloudy';
  if (c.includes('yağmur') || c.includes('rain') || c.includes('drizzle')) return 'weather-rainy';
  if (c.includes('kar') || c.includes('snow')) return 'weather-snowy';
  if (c.includes('sis') || c.includes('fog') || c.includes('mist')) return 'weather-fog';
  if (c.includes('fırtına') || c.includes('thunder')) return 'weather-lightning';
  return 'weather-partly-cloudy';
}

export const WeatherWidget: React.FC<{ weather: WeatherData | null; compact?: boolean }> = ({ weather, compact }) => {
  return (
    <View style={[styles.box, compact && styles.boxCompact]}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={weather ? (iconFor(weather.conditionTr) as any) : 'cloud-sync-outline'} size={26} color={C.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.temp}>{weather ? `${weather.tempC}°` : '—'}</Text>
        <Text style={styles.cond} numberOfLines={1}>
          {weather ? weather.conditionTr : 'Hava durumu alınıyor'}
        </Text>
      </View>
      {weather ? (
        <View style={styles.meta}>
          <Text style={styles.metaText}>💧 %{weather.humidity}</Text>
          <Text style={styles.metaText}>💨 {weather.windKph} km/s</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = themedStyles(() => StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    ...Theme.shadows.sm,
  },
  boxCompact: { padding: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentBg, alignItems: 'center', justifyContent: 'center' },
  temp: { fontSize: 22, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.5 },
  cond: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  meta: { alignItems: 'flex-end', gap: 2 },
  metaText: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
}));
