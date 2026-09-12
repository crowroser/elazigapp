import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';

const C = Theme.colors;

function TabIcon({ focused, color, children }: { focused: boolean; color: string; children: React.ReactNode }) {
  return <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>{children}</View>;
}

export default function TabLayout() {
  useAppTheme();
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : 10;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopWidth: 0,
          height: 62 + bottom,
          paddingBottom: bottom,
          paddingTop: 8,
          ...Theme.shadows.lg,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="transit"
        options={{
          title: 'Ulaşım',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <MaterialCommunityIcons name={focused ? 'bus' : 'bus-side'} size={23} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="university"
        options={{
          title: 'Üniversite',
          tabBarActiveTintColor: C.uniRed,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Ionicons name={focused ? 'school' : 'school-outline'} size={22} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'Keşfet',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={22} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Hizmetler',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <MaterialCommunityIcons name={focused ? 'view-grid' : 'view-grid-outline'} size={22} color={color} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  iconWrap: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: C.surfaceVariant },
}));
