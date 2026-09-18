import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useAppTheme } from '../constants/Theme';
import { ScreenHeader, Notice, Chip } from '../components/ui';
import {
  FIRAT_UNITS,
  FIRAT_UNIT_CATEGORY_LABELS,
  FiratUnit,
  FiratUnitCategory,
} from '../config/firatUnits';
import { FiratUnitsService } from '../services/firatUnitsService';

const C = Theme.colors;

// Seçicide kategori sırası (akademik birimler üstte, topluluk/diğer altta)
const CATEGORY_ORDER: FiratUnitCategory[] = [
  'fakulte',
  'bolum',
  'enstitu',
  'yuksekokul',
  'myo',
  'daire',
  'idari',
  'koordinatorluk',
  'merkez',
  'topluluk',
  'diger',
];

// Varsayılan görünürde: geçici/etkinlik ve topluluklar aramayla bulunur ama listeyi boğmasın.
const HIDDEN_BY_DEFAULT: FiratUnitCategory[] = ['topluluk', 'diger'];

/** ALL CAPS adları okunur biçime çevirir (Türkçe locale). */
function prettyName(name: string): string {
  const letters = name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  const upper = letters === letters.toLocaleUpperCase('tr-TR');
  if (!upper || letters.length < 3) return name;
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/(^|\s|\/|\()([a-zçğıöşü])/g, (_m, p1, p2) => p1 + p2.toLocaleUpperCase('tr-TR'));
}

export default function FiratUnitsScreen() {
  useAppTheme();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const sel = await FiratUnitsService.getSelected();
      setSelected(new Set(sel));
      const { status } = await import('expo-notifications').then((m) => m.getPermissionsAsync());
      setPermission(status === 'granted');
      setLoading(false);
    })();
  }, []);

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const groups: Record<string, FiratUnit[]> = {};
    for (const u of FIRAT_UNITS) {
      const hidden = HIDDEN_BY_DEFAULT.includes(u.category);
      // Arama yoksa ve "tümünü göster" kapalıysa gizli kategorileri atla (seçili olanlar hariç)
      if (!q && !showAll && hidden && !selected.has(u.topic)) continue;
      if (q) {
        const hay = (u.name + ' ' + (u.nameEn || '') + ' ' + u.sub).toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) continue;
      }
      (groups[u.category] ||= []).push(u);
    }
    return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({
      key: c,
      title: FIRAT_UNIT_CATEGORY_LABELS[c],
      data: groups[c],
    }));
  }, [query, showAll, selected]);

  const toggle = (topic: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    const result = await FiratUnitsService.setSelected(Array.from(selected));
    setSaving(false);
    if (result === 'synced') {
      Alert.alert('Kaydedildi', 'Seçtiğiniz birimlerin duyuruları için bildirim aboneliğiniz güncellendi.');
      router.back();
    } else if (result === 'no-permission') {
      Alert.alert(
        'Bildirim izni gerekli',
        'Birim duyurularını alabilmek için bildirim iznine izin vermelisiniz. Seçiminiz kaydedildi; izin verdiğinizde otomatik eşitlenecek.'
      );
    } else {
      Alert.alert(
        'Kaydedildi',
        'Seçiminiz cihaza kaydedildi. Bildirim servisi bağlandığında otomatik olarak eşitlenecek.'
      );
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Birim Duyuruları"
        subtitle={selected.size ? `${selected.size} birim seçili` : 'Bildirim almak istediğin birimleri seç'}
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => setShowAll((v) => !v)} hitSlop={8}>
            <Ionicons name={showAll ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.primary} />
          </TouchableOpacity>
        }
      />

      {permission === false ? (
        <View style={styles.noticeWrap}>
          <Notice
            text="Bildirim izni kapalı. Seçiminiz kaydedilir ancak izin verene kadar duyuru gelmez."
            tone="warning"
            icon="notifications-off-outline"
          />
        </View>
      ) : null}
      {!FiratUnitsService.isBackendConfigured() ? (
        <View style={styles.noticeWrap}>
          <Notice
            text="Duyuru servisi henüz bağlanmadı. Seçimin kaydedilir; servis aktif olunca otomatik eşitlenir."
            tone="info"
            icon="cloud-offline-outline"
          />
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Fakülte, bölüm veya birim ara…"
          placeholderTextColor={C.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.topic}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const on = selected.has(item.topic);
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item.topic)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={2}>
                    {prettyName(item.name)}
                  </Text>
                  <Text style={styles.rowSub}>{item.sub}.firat.edu.tr</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Ionicons name="checkmark" size={16} color={C.textWhite} /> : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Eşleşen birim yok.</Text>
          }
          ListHeaderComponent={
            !query && !showAll ? (
              <View style={styles.hintRow}>
                <Chip label="Toplulukları ve etkinlikleri göster" onPress={() => setShowAll(true)} icon="plus" />
              </View>
            ) : null
          }
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={C.textWhite} />
          ) : (
            <>
              <Ionicons name="notifications" size={18} color={C.textWhite} />
              <Text style={styles.saveText}>
                {selected.size ? `Kaydet (${selected.size})` : 'Kaydet'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  noticeWrap: { paddingHorizontal: 16, paddingTop: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceVariant,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  searchInput: { flex: 1, color: C.textPrimary, fontSize: 15, padding: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionCount: { fontSize: 12, color: C.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.cardBorder,
  },
  rowName: { fontSize: 15, color: C.textPrimary, fontWeight: '500' },
  rowSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  hintRow: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-start' },
  empty: { textAlign: 'center', color: C.textMuted, marginTop: 40 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.cardBorder,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    height: 50,
    borderRadius: 14,
  },
  saveText: { color: C.textWhite, fontSize: 16, fontWeight: '700' },
});
