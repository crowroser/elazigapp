import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Theme, themedStyles } from '../constants/Theme';

const C = Theme.colors;

interface ElazigKartCardProps {
  balance?: number;
  pending?: number;
  cardNo?: string;
  validity?: string;
  cardHolder?: string;
  loading?: boolean;
  updatedAt?: string;
  onQueryPress: () => void;
  onTopUpPress?: () => void;
}

export const ElazigKartCard: React.FC<ElazigKartCardProps> = ({
  balance,
  pending,
  cardNo,
  validity,
  cardHolder,
  loading,
  updatedAt,
  onQueryPress,
  onTopUpPress,
}) => {
  const linked = !!cardNo;
  const masked = cardNo ? `•••• ${cardNo.slice(-4).toUpperCase()}` : 'Kart bağlı değil';

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onQueryPress} style={styles.card}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={styles.topRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="credit-card-chip-outline" size={22} color="rgba(255,255,255,0.9)" />
          <Text style={styles.brand}>ElazığKart</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[styles.dot, { backgroundColor: linked ? '#4ADE80' : '#FBBF24' }]} />
          <Text style={styles.statusText}>{loading ? 'Sorgulanıyor' : linked ? 'Bağlı' : 'Bağlan'}</Text>
        </View>
      </View>

      <View style={styles.balanceBlock}>
        <Text style={styles.balanceLabel}>GÜNCEL BAKİYE</Text>
        <Text style={styles.balanceValue}>
          {balance != null ? `₺${balance.toFixed(2)}` : linked ? '—' : 'Sorgula'}
        </Text>
        {pending != null && pending > 0 ? (
          <Text style={styles.pendingText}>+ ₺{pending.toFixed(2)} bekleyen yükleme</Text>
        ) : validity ? (
          <Text style={styles.pendingText}>Geçerlilik: {validity}</Text>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.holder} numberOfLines={1}>
            {cardHolder || 'Elazığ Belediyesi Ulaşım Kartı'}
          </Text>
          <Text style={styles.cardNo}>{masked}</Text>
          {updatedAt ? <Text style={styles.updated}>Son sorgu {updatedAt}</Text> : null}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onQueryPress} activeOpacity={0.8}>
            <Ionicons name="search" size={16} color={C.primary} />
            <Text style={styles.actionText}>{linked ? 'Yenile' : 'Sorgula'}</Text>
          </TouchableOpacity>
          {onTopUpPress ? (
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGhost]} onPress={onTopUpPress} activeOpacity={0.8}>
              <Ionicons name="storefront-outline" size={16} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>Bayiler</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = themedStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Theme.spacing.lg,
    borderRadius: Theme.radius.xl,
    backgroundColor: C.primary,
    padding: 20,
    overflow: 'hidden',
    ...Theme.shadows.lg,
  },
  glowA: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(232,121,43,0.35)', top: -90, right: -60 },
  glowB: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -80, left: -40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  balanceBlock: { marginTop: 22, marginBottom: 18 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  pendingText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  holder: { color: '#fff', fontSize: 13, fontWeight: '700', maxWidth: 170 },
  cardNo: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 1.5, marginTop: 2 },
  updated: { color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  actionBtnGhost: { backgroundColor: 'rgba(255,255,255,0.16)' },
  actionText: { color: C.primary, fontSize: 12, fontWeight: '800' },
}));
