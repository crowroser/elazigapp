/**
 * Elazığ Şehir — tasarım sistemi
 * Lacivert (şehir) + amber vurgu + Fırat kırmızısı (üniversite).
 * Eski token adları geriye dönük uyumluluk için korunur.
 */
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

export const Theme = {
  colors: {
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
  },
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

export type ThemeColors = typeof Theme.colors;
