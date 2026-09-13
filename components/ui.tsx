import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  Animated,
  Dimensions,
  PanResponder,
  Easing,
} from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, themedStyles, useAppTheme, useReducedMotion } from '../constants/Theme';

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
  useAppTheme();
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
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'live';
  icon?: string;
  onPress?: () => void;
}) {
  const map = {
    info: { bg: C.infoBg, fg: C.info, icon: 'information-circle' },
    warning: { bg: C.warningBg, fg: C.warning, icon: 'alert-circle' },
    danger: { bg: C.dangerBg, fg: C.danger, icon: 'close-circle' },
    success: { bg: C.successBg, fg: C.success, icon: 'checkmark-circle' },
    live: { bg: C.liveBg, fg: C.live, icon: 'radio-button-on' },
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

// ─── Canlı Ulaşım & OBS Yeni Bileşenleri (v2) ────────────────────────────────

export function LiveBadge({
  text = 'Canlı',
  state = 'live',
  count,
  style,
}: {
  text?: string;
  state?: 'live' | 'stale' | 'off';
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  useAppTheme();
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state !== 'live' || reducedMotion) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, anim, reducedMotion]);

  const dotColor = state === 'live' ? Theme.colors.live : state === 'stale' ? Theme.colors.warning : Theme.colors.textFaint;
  const bgColor = state === 'live' ? Theme.colors.liveBg : Theme.colors.surfaceSubtle;
  const textColor = state === 'live' ? Theme.colors.live : Theme.colors.textMuted;

  return (
    <View style={[styles.liveBadge, { backgroundColor: bgColor }, style]}>
      <Animated.View style={[styles.liveDot, { backgroundColor: dotColor, opacity: anim }]} />
      <Text style={[styles.liveBadgeText, { color: textColor }]}>
        {text}
        {count != null ? ` · ${count}` : ''}
      </Text>
    </View>
  );
}

export function Countdown({
  seconds,
  text,
  style,
  compact = false,
}: {
  seconds?: number | null;
  text?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  useAppTheme();
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  const isNear = seconds != null && seconds < 60 && seconds > 0;

  useEffect(() => {
    if (!isNear || reducedMotion) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.35, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 600, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isNear, anim, reducedMotion]);

  if (seconds == null && !text) return null;

  let display = text || '';
  let isAtStop = false;
  if (seconds != null) {
    if (seconds <= 0) {
      display = 'Durakta';
      isAtStop = true;
    } else if (seconds < 60) {
      display = 'Geliyor';
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      display = compact ? `${mins} dk` : `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }

  const isLive = isNear || isAtStop;
  const bg = isLive ? Theme.colors.liveBg : Theme.colors.surfaceVariant;
  const fg = isLive ? Theme.colors.live : Theme.colors.textPrimary;

  return (
    <View style={[styles.countdownBadge, { backgroundColor: bg }, style]}>
      {isNear ? <Animated.View style={[styles.liveDotSmall, { backgroundColor: fg, opacity: anim }]} /> : null}
      <Text style={[styles.countdownText, { color: fg, fontVariant: ['tabular-nums'] }]}>{display}</Text>
    </View>
  );
}

export function RouteChip({
  routeCode,
  activeBusCount,
  selected = false,
  dimmed = false,
  onPress,
  style,
}: {
  routeCode: string;
  activeBusCount?: number;
  selected?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  useAppTheme();
  let hash = 0;
  for (let i = 0; i < routeCode.length; i++) {
    hash = (hash + routeCode.charCodeAt(i) * 17) % Theme.routePalette.length;
  }
  const color = Theme.routePalette[hash];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.routeChip,
        selected && { borderColor: color, borderWidth: 2, backgroundColor: Theme.colors.surfaceVariant },
        dimmed && { opacity: 0.35 },
        style,
      ]}
    >
      <View style={[styles.routeChipBadge, { backgroundColor: color }]}>
        <Text style={styles.routeChipCode}>{routeCode}</Text>
      </View>
      {activeBusCount != null && activeBusCount > 0 ? (
        <View style={[styles.routeChipCountBadge, { backgroundColor: Theme.colors.liveBg }]}>
          <Text style={[styles.routeChipCountText, { color: Theme.colors.live }]}>{activeBusCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function VehicleCard({
  plate,
  routeCode,
  speed,
  direction,
  lastGpsTime,
  nextStopName,
  nextStopEtaMinutes,
  isFollowed = false,
  onToggleFollow,
  hasAc,
  accessible,
  onClose,
  style,
}: {
  plate: string;
  routeCode: string;
  speed?: number | null;
  direction?: string | null;
  lastGpsTime?: string | null;
  nextStopName?: string | null;
  nextStopEtaMinutes?: number | null;
  isFollowed?: boolean;
  onToggleFollow?: () => void;
  hasAc?: boolean;
  accessible?: boolean;
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  useAppTheme();
  let hash = 0;
  for (let i = 0; i < routeCode.length; i++) {
    hash = (hash + routeCode.charCodeAt(i) * 17) % Theme.routePalette.length;
  }
  const routeColor = Theme.routePalette[hash];

  return (
    <Card style={[styles.vehicleCard, style]} padded={false}>
      <View style={styles.vehicleCardHeader}>
        <View style={[styles.routeChipBadgeLarge, { backgroundColor: routeColor }]}>
          <Text style={styles.routeChipCodeLarge}>{routeCode}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.vehiclePlate}>{plate || 'Belediye Otobüsü'}</Text>
            {direction ? (
              <Pill
                label={direction === 'G' ? 'Gidiş' : direction === 'D' ? 'Dönüş' : direction}
                color={Theme.colors.textMuted}
                bg={Theme.colors.surfaceVariant}
              />
            ) : null}
          </View>
          <Text style={styles.vehicleSub}>
            {lastGpsTime ? `GPS: ${lastGpsTime}` : 'Canlı Konum'}
          </Text>
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={20} color={Theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.vehicleCardStats}>
        <View style={styles.vehicleStat}>
          <Ionicons name="speedometer-outline" size={16} color={Theme.colors.live} />
          <Text style={[styles.vehicleStatVal, { color: Theme.colors.live }]}>
            {speed != null ? `${Math.round(speed)} km/s` : '—'}
          </Text>
          <Text style={styles.vehicleStatLabel}>
            {speed == null ? 'Hız (hat modunda)' : speed === 0 ? 'Durakta' : 'Hız'}
          </Text>
        </View>

        {nextStopName ? (
          <View style={[styles.vehicleStat, { flex: 2 }]}>
            <Ionicons name="navigate-circle-outline" size={16} color={Theme.colors.primaryLight} />
            <Text style={styles.vehicleStatVal} numberOfLines={1}>{nextStopName}</Text>
            <Text style={styles.vehicleStatLabel}>
              {nextStopEtaMinutes != null
                ? nextStopEtaMinutes <= 0
                  ? 'Durakta'
                  : `Durağa ~${nextStopEtaMinutes} dk`
                : 'Seçili durak'}
            </Text>
          </View>
        ) : null}

        <View style={styles.vehicleCardFeatures}>
          {hasAc ? (
            <View style={styles.featureBadge}>
              <Ionicons name="snow" size={13} color={Theme.colors.info} />
            </View>
          ) : null}
          {accessible ? (
            <View style={styles.featureBadge}>
              <MaterialCommunityIcons name="wheelchair-accessibility" size={14} color={Theme.colors.primaryLight} />
            </View>
          ) : null}
        </View>
      </View>

      {onToggleFollow ? (
        <View style={styles.vehicleCardActions}>
          <PrimaryButton
            label={isFollowed ? 'Takibi Bırak' : 'Otobüsü Takip Et'}
            icon={isFollowed ? 'eye-off-outline' : 'locate-outline'}
            variant={isFollowed ? 'outline' : 'solid'}
            tint={isFollowed ? Theme.colors.textMuted : Theme.colors.live}
            onPress={onToggleFollow}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </Card>
  );
}

export function BottomSheet({
  snapPoint = 'half',
  onSnapChange,
  children,
  header,
  style,
}: {
  snapPoint?: 'collapsed' | 'half' | 'full';
  onSnapChange?: (next: 'collapsed' | 'half' | 'full') => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  useAppTheme();
  type Snap = 'collapsed' | 'half' | 'full';
  const screenHeight = Dimensions.get('window').height;
  const COLLAPSED_HEIGHT = 72;
  const HALF_HEIGHT = Math.round(screenHeight * 0.46);
  const FULL_HEIGHT = Math.round(screenHeight * 0.9);

  const getTargetHeight = (sp: Snap) => {
    if (sp === 'collapsed') return COLLAPSED_HEIGHT;
    if (sp === 'full') return FULL_HEIGHT;
    return HALF_HEIGHT;
  };

  const heightAnim = useRef(new Animated.Value(getTargetHeight(snapPoint))).current;

  // PanResponder bir kez kurulur; güncel snapPoint/onSnapChange değerleri ref üzerinden okunur
  // (aksi hâlde ilk render'daki değerler kilitlenir ve panel bir kez açıldıktan sonra indirilemezdi).
  const snapRef = useRef<Snap>(snapPoint);
  const onSnapRef = useRef(onSnapChange);
  const startHeightRef = useRef(getTargetHeight(snapPoint));
  snapRef.current = snapPoint;
  onSnapRef.current = onSnapChange;

  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: getTargetHeight(snapPoint),
      damping: 24,
      stiffness: 220,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapPoint]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        heightAnim.stopAnimation((v) => {
          startHeightRef.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        // Parmağı takip et: yukarı çekince büyür, aşağı çekince küçülür
        const next = Math.max(COLLAPSED_HEIGHT, Math.min(FULL_HEIGHT, startHeightRef.current - g.dy));
        heightAnim.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const cb = onSnapRef.current;
        const current = snapRef.current;
        const released = Math.max(COLLAPSED_HEIGHT, Math.min(FULL_HEIGHT, startHeightRef.current - g.dy));
        // Hızlı fırlatma: yön belirler; yavaş bırakma: en yakın duruma yerleş
        let target: Snap;
        if (g.vy < -0.6) target = current === 'collapsed' ? 'half' : 'full';
        else if (g.vy > 0.6) target = current === 'full' ? 'half' : 'collapsed';
        else {
          const dC = Math.abs(released - COLLAPSED_HEIGHT);
          const dH = Math.abs(released - HALF_HEIGHT);
          const dF = Math.abs(released - FULL_HEIGHT);
          target = dC <= dH && dC <= dF ? 'collapsed' : dH <= dF ? 'half' : 'full';
        }
        if (cb && target !== current) cb(target);
        else {
          Animated.spring(heightAnim, {
            toValue: getTargetHeight(target),
            damping: 24,
            stiffness: 220,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Tutamaca dokunma: kapalı → yarım → tam → yarım; ok düğmesi her zaman bir kademe indirir
  const handleToggle = () => {
    const cb = onSnapRef.current;
    if (!cb) return;
    const current = snapRef.current;
    if (current === 'collapsed') cb('half');
    else if (current === 'half') cb('full');
    else cb('half');
  };
  const handleDown = () => {
    const cb = onSnapRef.current;
    if (!cb) return;
    cb(snapRef.current === 'full' ? 'half' : 'collapsed');
  };

  return (
    <Animated.View style={[styles.bottomSheet, { height: heightAnim }, style]}>
      <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
        <View style={styles.sheetHandleRow}>
          <View style={styles.sheetHandleSpacer} />
          <TouchableOpacity onPress={handleToggle} style={styles.sheetHandleTouch} hitSlop={12}>
            <View style={styles.sheetHandleBar} />
          </TouchableOpacity>
          {snapPoint !== 'collapsed' ? (
            <TouchableOpacity
              onPress={handleDown}
              style={styles.sheetDownBtn}
              hitSlop={10}
              accessibilityLabel="Paneli indir"
            >
              <MaterialCommunityIcons name="chevron-down" size={20} color={C.textMuted} />
            </TouchableOpacity>
          ) : (
            <View style={styles.sheetHandleSpacer} />
          )}
        </View>
        {header}
      </View>
      <View style={styles.sheetBody}>{children}</View>
    </Animated.View>
  );
}

export function ProgressRing({
  progress = 0,
  size = 110,
  strokeWidth = 9,
  color = Theme.colors.live,
  bgColor = Theme.colors.surfaceVariant,
  centerLabel,
  centerSub,
}: {
  progress?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  centerLabel?: string;
  centerSub?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeProgress = Math.max(0, Math.min(1, progress));
  const strokeDashoffset = circumference - safeProgress * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
        {centerLabel ? (
          <Text style={[styles.ringCenterLabel, { fontVariant: ['tabular-nums'] }]}>{centerLabel}</Text>
        ) : (
          <Text style={[styles.ringCenterLabel, { fontVariant: ['tabular-nums'] }]}>
            %{Math.round(safeProgress * 100)}
          </Text>
        )}
        {centerSub ? <Text style={styles.ringCenterSub}>{centerSub}</Text> : null}
      </View>
    </View>
  );
}

export function CriterionCard({
  title,
  value,
  target,
  percent,
  status = 'ok',
  warning = false,
  subtitle,
  style,
}: {
  title: string;
  value: string;
  target?: string;
  percent?: number | null;
  status?: 'ok' | 'warning' | 'fail';
  warning?: boolean;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  useAppTheme();
  const statusColor =
    status === 'ok' ? Theme.colors.live : status === 'warning' ? Theme.colors.prayerGold : Theme.colors.danger;

  return (
    <Card style={[styles.criterionCard, style]} padded={false}>
      <View style={[styles.criterionStatusStrip, { backgroundColor: statusColor }]} />
      <View style={styles.criterionBody}>
        <View style={styles.criterionHeader}>
          <Text style={styles.criterionTitle} numberOfLines={1}>{title}</Text>
          {warning ? (
            <Ionicons name="alert-circle" size={14} color={statusColor} />
          ) : status === 'ok' ? (
            <Ionicons name="checkmark-circle" size={14} color={statusColor} />
          ) : null}
        </View>

        {/* Uzun uyari metni (or. "Mezuniyet kurallari eksik oldugundan...") karti buyutmesin:
            kisa baslik + en fazla 2 satir aciklama */}
        {value.length > 28 ? (
          <View style={{ gap: 2 }}>
            <Text style={[styles.criterionVal, { color: statusColor, fontSize: 15 }]} numberOfLines={1}>
              Hesaplanamıyor
            </Text>
            <Text style={styles.criterionSub} numberOfLines={2}>{value}</Text>
          </View>
        ) : (
          <View style={styles.criterionValues}>
            <Text
              style={[styles.criterionVal, { color: statusColor, fontVariant: ['tabular-nums'] }]}
              numberOfLines={2}
            >
              {value}
            </Text>
            {target ? <Text style={styles.criterionTarget}>/ {target}</Text> : null}
          </View>
        )}

        {percent != null ? (
          <View style={styles.criterionBarBg}>
            <View
              style={[
                styles.criterionBarFill,
                { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: statusColor },
              ]}
            />
          </View>
        ) : null}

        {subtitle ? (
          <Text style={styles.criterionSub} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
    </Card>
  );
}

export const textStyles: Record<string, TextStyle> = {
  title: { ...Theme.text.h2, color: C.textPrimary },
  body: { ...Theme.text.body, color: C.textSecondary },
  muted: { ...Theme.text.small, color: C.textMuted },
};

const styles = themedStyles(() => StyleSheet.create({
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

  // LiveBadge
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Countdown
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Theme.radius.sm,
    alignSelf: 'flex-start',
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // RouteChip
  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    paddingRight: 6,
    borderRadius: Theme.radius.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
    gap: 5,
    ...Theme.shadows.sm,
  },
  routeChipBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
  },
  routeChipCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  routeChipCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Theme.radius.pill,
  },
  routeChipCountText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // VehicleCard
  vehicleCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    ...Theme.shadows.md,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeChipBadgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeChipCodeLarge: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  vehiclePlate: {
    ...Theme.text.h3,
    color: C.textPrimary,
  },
  vehicleSub: {
    ...Theme.text.small,
    color: C.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  vehicleCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.cardBorder,
  },
  vehicleStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  vehicleStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: C.textPrimary,
  },
  vehicleStatLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: '600',
  },
  vehicleCardFeatures: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  featureBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: C.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCardActions: {
    marginTop: 14,
  },

  // BottomSheet
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    ...Theme.shadows.lg,
    zIndex: 900,
    overflow: 'hidden',
  },
  sheetHandleArea: {
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: C.surface,
  },
  sheetHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  sheetHandleSpacer: { width: 28 },
  sheetHandleTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  sheetDownBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceSubtle,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.cardBorder,
  },
  sheetBody: {
    flex: 1,
  },

  // ProgressRing
  ringCenterLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
  },
  ringCenterSub: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 2,
  },

  // CriterionCard
  criterionCard: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  criterionStatusStrip: {
    width: 4,
  },
  criterionBody: {
    flex: 1,
    padding: 10,
    gap: 4,
  },
  criterionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  criterionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    flex: 1,
  },
  criterionValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  criterionVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  criterionTarget: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '600',
  },
  criterionBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceVariant,
    overflow: 'hidden',
    marginTop: 2,
  },
  criterionBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  criterionSub: {
    fontSize: 10,
    color: C.textFaint,
    marginTop: 2,
  },
}));
