import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';
import { ClassifiedsService, ClassifiedItem } from '../services/classifiedsService';
import { AuthService, UserProfile } from '../services/authService';
import { Card, Chip, EmptyState, LoadingState, Notice, Pill, PrimaryButton, ScreenHeader } from '../components/ui';

const C = Theme.colors;
const RED = C.uniRed;
type Cat = 'Kitap' | 'Ev Arkadaşı' | 'Etkinlik';
const CATS: { id: 'Hepsi' | Cat; icon: string }[] = [
  { id: 'Hepsi', icon: 'view-grid-outline' },
  { id: 'Kitap', icon: 'book-open-page-variant-outline' },
  { id: 'Ev Arkadaşı', icon: 'home-account' },
  { id: 'Etkinlik', icon: 'calendar-star' },
];
const catIcon = (c: string) => CATS.find((x) => x.id === c)?.icon || 'tag-outline';

export default function ClassifiedsScreen() {
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<'Hepsi' | Cat>('Hepsi');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [newCat, setNewCat] = useState<Cat>('Kitap');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setItems(await ClassifiedsService.getClassifieds());
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = AuthService.onAuthChange(async (u) => setProfile(u ? await AuthService.getUserProfile(u.uid) : null));
    return () => unsub();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (cat === 'Hepsi' || i.category === cat) && (!q || i.title.toLowerCase().includes(q) || i.location.toLowerCase().includes(q)));
  }, [items, cat, query]);

  const toggleFav = async (id: string) => {
    const fav = await ClassifiedsService.toggleFavorite(id);
    setItems((p) => p.map((i) => (i.id === id ? { ...i, isFavorite: fav } : i)));
  };

  const create = async () => {
    if (!title.trim()) return Alert.alert('Eksik alan', 'İlan başlığı gerekli.');
    setSubmitting(true);
    try {
      const created = await ClassifiedsService.createClassified(title.trim(), newCat, price.trim(), location.trim(), profile?.displayName || 'Öğrenci');
      setItems((p) => [created, ...p]);
      setAddVisible(false);
      setTitle('');
      setPrice('');
      setLocation('');
    } catch {
      Alert.alert('Hata', 'İlan kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[RED]} tintColor={RED} />}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={C.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Kampüste ne arıyorsun?" placeholderTextColor={C.textFaint} value={query} onChangeText={setQuery} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATS.map((c) => (
            <Chip key={c.id} label={c.id} icon={c.icon} active={cat === c.id} tint={RED} onPress={() => setCat(c.id)} />
          ))}
        </ScrollView>

        {loading ? (
          <LoadingState label="İlanlar yükleniyor..." tint={RED} />
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState icon="bulletin-board" title="İlan yok" description="Henüz ilan eklenmemiş ya da filtreye uyan ilan bulunamadı. İlk ilanı sen ver!" tint={RED} action="İlan ver" onAction={() => setAddVisible(true)} />
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((i) => (
              <Card key={i.id} padded={false} style={styles.item}>
                <View style={styles.itemIcon}>
                  <MaterialCommunityIcons name={catIcon(i.category) as any} size={26} color={RED} />
                </View>
                <View style={{ flex: 1, padding: 12, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Pill label={i.category} color={RED} bg={C.uniRedSoft} />
                    <TouchableOpacity onPress={() => toggleFav(i.id)} hitSlop={8}>
                      <Ionicons name={i.isFavorite ? 'heart' : 'heart-outline'} size={20} color={i.isFavorite ? C.danger : C.textFaint} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={2}>{i.title}</Text>
                  <Text style={styles.itemMeta}>
                    {i.price} · {i.location}
                  </Text>
                  <Text style={styles.itemAuthor}>{i.author} · {new Date(i.createdAt).toLocaleDateString('tr-TR')}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
        <View style={{ height: 90 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={addVisible} animationType="slide" onRequestClose={() => setAddVisible(false)}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScreenHeader title="Yeni İlan" subtitle="Kampüs ilan panosu" onBack={() => setAddVisible(false)} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!profile ? <Notice tone="info" text="Giriş yapmadan verilen ilanlar yalnızca bu cihazda saklanır. Hesap açarsan herkes görür." /> : null}
            <Card style={{ gap: 12 }}>
              <View style={styles.chipsWrap}>
                {CATS.filter((c) => c.id !== 'Hepsi').map((c) => (
                  <Chip key={c.id} label={c.id} icon={c.icon} active={newCat === c.id} tint={RED} onPress={() => setNewCat(c.id as Cat)} />
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Başlık (ör. Calculus 2 kitabı)" placeholderTextColor={C.textFaint} value={title} onChangeText={setTitle} />
              <TextInput style={styles.input} placeholder="Fiyat (boşsa: Görüşülür)" placeholderTextColor={C.textFaint} value={price} onChangeText={setPrice} />
              <TextInput style={styles.input} placeholder="Konum (boşsa: Fırat Üniversitesi)" placeholderTextColor={C.textFaint} value={location} onChangeText={setLocation} />
              <PrimaryButton label="Yayınla" icon="checkmark" tint={RED} onPress={create} loading={submitting} />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: C.textPrimary },
  chips: { gap: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', overflow: 'hidden' },
  itemIcon: { width: 64, backgroundColor: C.uniRedWash, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  itemMeta: { ...Theme.text.small, color: C.textSecondary },
  itemAuthor: { ...Theme.text.small, color: C.textFaint },
  input: { backgroundColor: C.surfaceSubtle, borderWidth: 1, borderColor: C.cardBorder, borderRadius: Theme.radius.md, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.textPrimary },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 18, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', ...Theme.shadows.lg },
});
