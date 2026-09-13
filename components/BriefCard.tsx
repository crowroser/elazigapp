import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { BriefItem, BriefTone, DailyBrief } from '../services/briefService';

const C = Theme.colors;

/** Özet satırlarının ton → renk eşlemesi (ana sayfa kartı ve /brief ekranı ortak) */
export function briefToneColors(tone: BriefTone): { fg: string; bg: string } {
  switch (tone) {
    case 'success':
      return { fg: C.success, bg: C.successBg };
    case 'warning':
      return { fg: C.warning, bg: C.warningBg };
    case 'danger':
      return { fg: C.danger, bg: C.dangerBg };
    case 'gold':
      return { fg: C.prayerGold, bg: C.prayerBg };
    case 'info':
      return { fg: C.info, bg: C.infoBg };
    case 'uni':
      return { fg: C.uniRed, bg: C.uniRedSoft };
    default:
      return { fg: C.primary, bg: C.surfaceVariant };
  }
}

/**
 * Ana sayfa "Günün Özeti" kartı (L2) — Now Brief tarzı kompakt görünüm.
 * En önemli 3 satırı gösterir; dokununca /brief ekranı açılır.
 */
export function BriefCard({
  brief,
  loading,
  onPress,
  onItemPress,
}: {
  brief: DailyBrief | null;
  loading?: boolean;
  onPress: () => void;
  onItemPress?: (item: BriefItem) => void;
}) {
  useAppTheme();
  const items = brief?.items.slice(0, 3) ?? [];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88} accessibilityLabel="Günün özeti">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="star-four-points" size={16} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {brief ? brief.greeting : 'Günün Özeti'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {brief ? `${brief.horizon === 'tomorrow' ? 'Yarın · ' : ''}${brief.dateText}` : loading ? 'Hazırlanıyor…' : 'Dokunarak oluştur'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
      </View>

      {items.length > 0 ? (
        <View style={styles.rows}>
          {items.map((it) => {
            const t = briefToneColors(it.tone);
            return (
              <TouchableOpacity
                key={it.id}
                style={styles.row}
                onPress={() => (onItemPress ? onItemPress(it) : onPress())}
                activeOpacity={0.75}
              >
                <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
                  <MaterialCommunityIcons name={it.icon as any} size={15} color={t.fg} />
                </View>
                <Text style={styles.rowText} numberOfLines={1}>
                  {it.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>
          {loading ? 'Hava, namaz, dersler ve bakiye toplanıyor…' : 'Henüz özet yok — dokunarak oluşturun.'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
      gap: 10,
      ...Theme.shadows.sm,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: C.accentBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { ...Theme.text.h3, color: C.textPrimary },
    sub: { ...Theme.text.small, color: C.textMuted, marginTop: 1 },
    rows: { gap: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
    rowIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    rowText: { ...Theme.text.body, color: C.textSecondary, flex: 1 },
    empty: { ...Theme.text.small, color: C.textMuted },
  })
);
