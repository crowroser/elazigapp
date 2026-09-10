import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View, Text, Linking } from 'react-native';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';
import { Card, ListRow } from '@/components/ui';

const C = Theme.colors;

export default function ModalScreen() {
  const version = Constants.expoConfig?.version || '1.0.0';
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <MaterialCommunityIcons name="city-variant-outline" size={40} color="#fff" />
      </View>
      <Text style={styles.title}>Elazığ Şehir</Text>
      <Text style={styles.subtitle}>Canlı ulaşım, ElazığKart, Fırat Üniversitesi OBS ve şehir hizmetleri tek uygulamada.</Text>
      <Card padded={false} style={{ width: '100%', paddingHorizontal: 14, marginTop: 20 }}>
        <ListRow icon="bus" title="Ulaşım verisi" subtitle="Elazığ Belediyesi ElazığKart açık API" onPress={() => Linking.openURL('https://elazigkart.elazig.bel.tr')} />
        <ListRow icon="school" iconColor={C.uniRed} iconBg={C.uniRedSoft} title="OBS" subtitle="obs.firat.edu.tr — bilgiler cihazda kalır" onPress={() => Linking.openURL('https://obs.firat.edu.tr')} />
        <ListRow icon="information-outline" title={`Sürüm ${version}`} subtitle="Bağımsız geliştirici uygulaması; resmî kurum uygulaması değildir" last />
      </Card>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 24, backgroundColor: C.background },
  logo: { width: 84, height: 84, borderRadius: 26, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12, ...Theme.shadows.md },
  title: { ...Theme.text.display, color: C.textPrimary, marginTop: 14 },
  subtitle: { ...Theme.text.small, color: C.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 6, paddingHorizontal: 12 },
});
