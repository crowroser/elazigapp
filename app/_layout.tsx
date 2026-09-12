import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Theme, ThemeService, useAppTheme } from '@/constants/Theme';
import { NotificationService } from '@/services/notificationService';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

/** Navigasyon teması: canlı Theme.colors'tan her render'da üretilir (koyu/açık) */
function navTheme() {
  const base = Theme.colors.isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: Theme.colors.primary,
      background: Theme.colors.background,
      card: Theme.colors.surface,
      text: Theme.colors.textPrimary,
      border: Theme.colors.cardBorder,
    },
  };
}

export default function RootLayout() {
  useAppTheme();
  const router = useRouter();
  const [themeReady, setThemeReady] = useState(false);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    // Kayıtlı tema tercihi ilk kareden önce uygulanır (açık→koyu yanıp sönmesin)
    ThemeService.init().finally(() => setThemeReady(true));
  }, []);

  useEffect(() => {
    if (loaded && themeReady) SplashScreen.hideAsync();
  }, [loaded, themeReady]);

  useEffect(() => {
    // Initial sync
    NotificationService.syncAllSchedules().catch(() => {});

    // Periodic sync on app active
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        NotificationService.syncAllSchedules().catch(() => {});
      }
    });

    // Notification click navigation
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (route && typeof route === 'string') {
        try {
          router.push(route as any);
        } catch {}
      }
    });

    return () => {
      appStateSub.remove();
      notifSub.remove();
    };
  }, [router]);

  if (!loaded || !themeReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme()}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Theme.colors.surface },
            headerTitleStyle: { fontWeight: '700', color: Theme.colors.textPrimary },
            headerTintColor: Theme.colors.primary,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: Theme.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="obs" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Hakkında' }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="widgets" options={{ title: 'Widget Önizleme' }} />
          <Stack.Screen name="classifieds" options={{ title: 'İlan Panosu' }} />
          <Stack.Screen name="assistant" options={{ title: 'Gakgoş Asistan' }} />
          <Stack.Screen name="fillingcenters" options={{ headerShown: false }} />
          <Stack.Screen name="trip_planner" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
