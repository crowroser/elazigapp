import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';

const C = Theme.colors;

// ─── Screen header ───────────────────────────────────────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  right,
  tint = C.primary,
  onBack,
  light = false,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  tint?: string;
  onBack?: () => void;
  light?: boolean;
}) {
  const fg = light ? C.textWhite : C.textPrimary;
  const sub = light ? 'rgba(255,255,255,0.75)' : C.textMuted;
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, light && styles.backBtnLight]} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={light ? C.textWhite : tint} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.headerSub, { color: sub }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

// ─── Cards & sections ────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
  padded = true,
  tone = 'surface',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  tone?: 'surface' | 'subtle' | 'primary' | 'uni';
}) {
  const toneStyle =
    tone === 'primary'
      ? styles.cardPrimary
      : tone === 'subtle'
      ? styles.cardSubtle
      : tone === 'uni'
      ? styles.cardUni
      : null;
  const content = (
    <View style={[styles.card, toneStyle, padded && styles.cardPadded, style]}>{children}</View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export function SectionTitle({
  title,
  subtitle,
  action,
  onAction,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

export function IconCircle({
  name,
  lib = 'mci',
  size = 40,
  color = C.primary,
  bg = C.surfaceVariant,
}: {
  name: string;
  lib?: 'mci' | 'ion';
  size?: number;
  color?: string;
  bg?: string;
}) {
  const Icon: any = lib === 'ion' ? Ionicons : MaterialCommunityIcons;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size * 0.52)} color={color} />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tint = C.primary,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tint?: string;
  icon?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, active && { backgroundColor: tint, borderColor: tint }]}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon as any} size={14} color={active ? C.textWhite : tint} />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Pill({
  label,
  color = C.primary,
  bg = C.surfaceVariant,
  style,
}: {
  label: string;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  hint,
  color = C.primary,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stat, style]}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.statHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor = C.primary,
  iconBg = C.surfaceVariant,
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  icon?: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      {icon ? <IconCircle name={icon} size={36} color={iconColor} bg={iconBg} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={C.textFaint} /> : null)}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  tint = C.primary,
  variant = 'solid',
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  tint?: string;
  variant?: 'solid' | 'outline' | 'ghost';
  style?: StyleProp<ViewStyle>;
}) {
  const solid = variant === 'solid';
  const fg = solid ? C.textWhite : tint;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        solid && { backgroundColor: tint },
        variant === 'outline' && { borderWidth: 1.5, borderColor: tint, backgroundColor: 'transparent' },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        (disabled || loading) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon as any} size={18} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function EmptyState({
  icon = 'inbox-outline',
  title,
  description,
  action,
  onAction,
  tint = C.primary,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
  tint?: string;
}) {
  return (
    <View style={styles.empty}>
      <IconCircle name={icon} size={56} color={tint} bg={C.surfaceSubtle} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDesc}>{description}</Text> : null}
      {action ? (
        <PrimaryButton label={action} onPress={onAction || (() => {})} variant="outline" tint={tint} style={{ marginTop: 8 }} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Yükleniyor...', tint = C.primary }: { label?: string; tint?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={tint} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function Notice({
  text,
  tone = 'info',
  icon,
  onPress,
}: {
  text: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  icon?: string;
  onPress?: () => void;
}) {
  const map = {
    info: { bg: C.infoBg, fg: C.info, icon: 'information-circle' },
    warning: { bg: C.warningBg, fg: C.warning, icon: 'alert-circle' },
    danger: { bg: C.dangerBg, fg: C.danger, icon: 'close-circle' },
    success: { bg: C.successBg, fg: C.success, icon: 'checkmark-circle' },
  }[tone];
  const body = (
    <View style={[styles.notice, { backgroundColor: map.bg }]}>
      <Ionicons name={(icon || map.icon) as any} size={18} color={map.fg} />
      <Text style={[styles.noticeText, { color: map.fg }]}>{text}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

export const textStyles: Record<string, TextStyle> = {
  title: { ...Theme.text.h2, color: C.textPrimary },
  body: { ...Theme.text.body, color: C.textSecondary },
  muted: { ...Theme.text.small, color: C.textMuted },
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnLight: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.25)' },
  headerTitle: { ...Theme.text.h1 },
  headerSub: { ...Theme.text.small, marginTop: 1 },

  card: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    ...Theme.shadows.sm,
  },
  cardPadded: { padding: Theme.spacing.lg },
  cardSubtle: { backgroundColor: C.surfaceSubtle, shadowOpacity: 0, elevation: 0 },
  cardPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  cardUni: { backgroundColor: C.uniRedWash, borderColor: C.uniBorder },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    marginTop: Theme.spacing.xl,
    marginBottom: Theme.spacing.md,
  },
  sectionTitle: { ...Theme.text.h2, color: C.textPrimary },
  sectionSub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },
  sectionAction: { ...Theme.text.small, color: C.primaryLight, fontWeight: '700' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipText: { ...Theme.text.small, color: C.textSecondary, fontWeight: '600' },
  chipTextActive: { color: C.textWhite },

  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: Theme.radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },

  stat: { flex: 1, backgroundColor: C.surfaceSubtle, borderRadius: Theme.radius.md, padding: 12, gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  statHint: { fontSize: 10, color: C.textFaint },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
  rowTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '600' },
  rowSub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: Theme.radius.md,
  },
  btnText: { fontSize: 15, fontWeight: '700' },

  empty: { alignItems: 'center', padding: 28, gap: 8 },
  emptyTitle: { ...Theme.text.h3, color: C.textPrimary, textAlign: 'center' },
  emptyDesc: { ...Theme.text.small, color: C.textMuted, textAlign: 'center', lineHeight: 18 },

  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadingText: { ...Theme.text.small, color: C.textMuted },

  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: Theme.radius.md },
  noticeText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
