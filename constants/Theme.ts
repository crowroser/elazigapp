/**
 * Elazığ Şehir — tasarım sistemi
 * Lacivert (şehir) + amber vurgu + Fırat kırmızısı (üniversite).
 * Eski token adları geriye dönük uyumluluk için korunur.
 *
 * Tema: `Theme.colors` CANLI bir nesnedir — tema değişince alanları yerinde güncellenir, böylece
 * modül başında `const C = Theme.colors` alan tüm dosyalar render anında güncel rengi okur.
 * Modül düzeyindeki `StyleSheet.create` sonuçları ise `themedStyles(() => …)` ile sarılır:
 * stil nesnesi ilk erişimde kurulur, tema değişince bir sonraki erişimde yeniden kurulur.
 */
import { useSyncExternalStore } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const palette = {
  navy900: '#0A1B33',
  navy800: '#0F2A4A',
  navy700: '#163A66',
  navy600: '#1F4E86',
  navy100: '#DCE6F5',
  navy50: '#EEF3FA',

  amber600: '#C2410C',
  amber500: '#E8792B',
  amber100: '#FFE7D1',

  teal600: '#0F766E',
  teal100: '#CCF4EF',

  red700: '#9B1B2E',
  red600: '#B91C1C',
  red100: '#FEE2E2',
  red50: '#FFF5F6',

  green600: '#15803D',
  green100: '#DCFCE7',

  gold600: '#B7791F',
  gold100: '#FEF3C7',

  slate900: '#0F172A',
  slate700: '#334155',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
};

const lightColors = {
  // Tema bilgisi
  isDark: false,
  statusBar: 'dark-content' as 'dark-content' | 'light-content',

  // Marka
  primary: palette.navy800,
  primaryDark: palette.navy900,
  primaryLight: palette.navy600,
  primaryContainer: palette.navy700,
  onPrimaryContainer: palette.navy100,
  accent: palette.amber500,
  accentDark: palette.amber600,
  accentBg: palette.amber100,
  secondary: palette.navy600,
  secondaryLight: '#66AFFE',
  secondaryBg: palette.navy100,

  // Yüzeyler
  background: '#F3F5F9',
  surface: palette.white,
  surfaceSubtle: palette.slate50,
  surfaceVariant: palette.navy50,
  cardBorder: palette.slate200,
  divider: palette.slate100,

  // Metin
  textPrimary: palette.slate900,
  textSecondary: palette.slate700,
  textMuted: palette.slate500,
  textFaint: palette.slate400,
  textWhite: palette.white,

  // Durum
  success: palette.green600,
  successBg: palette.green100,
  successGreen: palette.green600,
  warning: palette.amber600,
  warningBg: palette.amber100,
  warningOrange: palette.amber600,
  danger: palette.red600,
  dangerBg: palette.red100,
  pharmacyRed: palette.red600,
  pharmacyBg: palette.red100,
  info: palette.teal600,
  infoBg: palette.teal100,
  transitBlue: palette.navy600,
  prayerGold: palette.gold600,
  prayerBg: palette.gold100,

  // Üniversite (Fırat)
  uniRed: palette.red700,
  uniRedDark: '#7A1524',
  uniRedSoft: '#FCE8EB',
  uniRedWash: palette.red50,
  uniBorder: '#F0D4D8',
  uniMuted: '#6B4A52',
};

export type ThemeColors = typeof lightColors;

/** Koyu tema: aynı token adları, gece için ayarlanmış kontrast */
const darkColors: ThemeColors = {
  isDark: true,
  statusBar: 'light-content',

  primary: '#2F62A8',
  primaryDark: '#163A66',
  primaryLight: '#4A7FC4',
  primaryContainer: '#1F4E86',
  onPrimaryContainer: '#DCE6F5',
  accent: '#F59E0B',
  accentDark: '#FB923C',
  accentBg: '#3B2A14',
  secondary: '#66AFFE',
  secondaryLight: '#93C5FD',
  secondaryBg: '#1A2E4D',

  background: '#0B1220',
  surface: '#121B2E',
  surfaceSubtle: '#182238',
  surfaceVariant: '#1B2A47',
  cardBorder: '#26344F',
  divider: '#1E2B44',

  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textFaint: '#64748B',
  textWhite: '#FFFFFF',

  success: '#4ADE80',
  successBg: '#14331F',
  successGreen: '#4ADE80',
  warning: '#FB923C',
  warningBg: '#3B2A14',
  warningOrange: '#FB923C',
  danger: '#F87171',
  dangerBg: '#3B1A1A',
  pharmacyRed: '#F87171',
  pharmacyBg: '#3B1A1A',
  info: '#2DD4BF',
  infoBg: '#123B37',
  transitBlue: '#66AFFE',
  prayerGold: '#FBBF24',
  prayerBg: '#3B3013',

  uniRed: '#C9455A',
  uniRedDark: '#9B1B2E',
  uniRedSoft: '#3A1A20',
  uniRedWash: '#2A1418',
  uniBorder: '#4A2530',
  uniMuted: '#C9A0A8',
};

export type ThemePreference = 'system' | 'light' | 'dark';
const THEME_PREF_KEY = '@prefs/theme_preference';

// Canlı renk nesnesi (kimliği hiç değişmez; alanları yerinde güncellenir)
const liveColors: ThemeColors = { ...lightColors };
let preference: ThemePreference = 'system';
let version = 0;
const listeners = new Set<() => void>();

function resolveScheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  return pref;
}

function applyScheme(scheme: 'light' | 'dark') {
  const next = scheme === 'dark' ? darkColors : lightColors;
  if (liveColors.isDark === next.isDark && version > 0) return;
  Object.assign(liveColors, next);
  version++;
  listeners.forEach((l) => l());
}

export const Theme = {
  colors: liveColors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  text: {
    display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
    h1: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
    h2: { fontSize: 18, fontWeight: '700' as const },
    h3: { fontSize: 15, fontWeight: '700' as const },
    body: { fontSize: 14, fontWeight: '500' as const },
    small: { fontSize: 12, fontWeight: '500' as const },
    caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  },
  shadows: {
    sm: {
      shadowColor: '#0A1B33',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: '#0A1B33',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    lg: {
      shadowColor: '#0A1B33',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 20,
      elevation: 8,
    },
  },
};

/** Tema tercihi (sistem / açık / koyu). Değişiklik anında uygulanır ve kalıcı olarak saklanır. */
export const ThemeService = {
  getPreference: (): ThemePreference => preference,
  isDark: (): boolean => liveColors.isDark,

  async setPreference(pref: ThemePreference): Promise<void> {
    preference = pref;
    applyScheme(resolveScheme(pref));
    try {
      await AsyncStorage.setItem(THEME_PREF_KEY, pref);
    } catch {
      // kalıcı kayıt başarısız olsa da oturum boyunca uygulanır
    }
  },

  /** Uygulama açılışında bir kez: kayıtlı tercihi yükler, sistem temasını dinler */
  async init(): Promise<void> {
    try {
      const saved = (await AsyncStorage.getItem(THEME_PREF_KEY)) as ThemePreference | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
    } catch {
      // varsayılan: sistem
    }
    applyScheme(resolveScheme(preference));
    Appearance.addChangeListener(() => {
      if (preference === 'system') applyScheme(resolveScheme('system'));
    });
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getVersion = () => version;

/**
 * Ekran bileşenlerinde çağrılır: tema değişince bileşeni yeniden render eder.
 * Renkler `Theme.colors` üzerinden okunur (canlı nesne), dönüş değeri de aynı nesnedir.
 */
export function useAppTheme(): ThemeColors {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return liveColors;
}

/**
 * Modül düzeyindeki stil tablolarını temaya duyarlı yapar:
 * `const styles = themedStyles(() => StyleSheet.create({ box: { backgroundColor: C.surface } }))`
 * Stil ilk erişimde oluşturulur; tema değiştiğinde ilk erişimde yeniden oluşturulur.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T): T {
  let built: T | null = null;
  let builtVersion = -1;
  const ensure = () => {
    if (!built || builtVersion !== version) {
      built = factory();
      builtVersion = version;
    }
    return built;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (ensure() as any)[key],
    has: (_t, key) => key in (ensure() as any),
    ownKeys: () => Reflect.ownKeys(ensure() as any),
    getOwnPropertyDescriptor: (_t, key) => Object.getOwnPropertyDescriptor(ensure(), key),
  });
}
