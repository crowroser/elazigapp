import { useFonts } from 'expo-font';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Theme } from '@/constants/Theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const AppNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Theme.colors.primary,
    background: Theme.colors.background,
    card: Theme.colors.surface,
    text: Theme.colors.textPrimary,
    border: Theme.colors.cardBorder,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={AppNavTheme}>
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
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
