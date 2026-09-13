import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';
import { Home, Bus, GraduationCap, Compass } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';

export default function TabLayout() {
  useAppTheme();
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : 10;
  const C = Theme.colors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopWidth: 1,
          borderTopColor: C.cardBorder,
          height: 58 + bottom,
          paddingBottom: bottom,
          paddingTop: 6,
          ...Theme.shadows.lg,
        },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          tabBarLabel: ({ focused, color }) =>
            focused ? <Text style={[styles.tabLabel, { color }]}>Ana Sayfa</Text> : null,
          tabBarIcon: ({ color }) => <Home size={22} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="transit"
        options={{
          title: 'Ulaşım',
          tabBarActiveTintColor: Theme.colors.live,
          tabBarLabel: ({ focused, color }) =>
            focused ? <Text style={[styles.tabLabel, { color }]}>Ulaşım</Text> : null,
          tabBarIcon: ({ color }) => <Bus size={22} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="university"
        options={{
          title: 'Üniversite',
          tabBarActiveTintColor: C.uniRed,
          tabBarLabel: ({ focused, color }) =>
            focused ? <Text style={[styles.tabLabel, { color }]}>Üniversite</Text> : null,
          tabBarIcon: ({ color }) => <GraduationCap size={22} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Şehir',
          tabBarActiveTintColor: C.primary,
          tabBarLabel: ({ focused, color }) =>
            focused ? <Text style={[styles.tabLabel, { color }]}>Şehir</Text> : null,
          tabBarIcon: ({ color }) => <Compass size={22} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    tabLabel: {
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
  })
);

