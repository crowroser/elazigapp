import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import {
  ClassifiedsService,
  ClassifiedItem,
  ClassifiedCategory,
} from '../services/classifiedsService';
import { AuthService, UserProfile } from '../services/authService';
import { ObsService } from '../services/obsService';
import { auth } from '../config/firebase';
import {
  Card,
  Chip,
  EmptyState,
  LoadingState,
  Notice,
  Pill,
  PrimaryButton,
  ScreenHeader,
} from '../components/ui';

const C = Theme.colors;
const RED = C.uniRed;

const CATS: { id: 'Hepsi' | ClassifiedCategory; icon: string }[] = [
  { id: 'Hepsi', icon: 'view-grid-outline' },
  { id: 'Kitap', icon: 'book-open-page-variant-outline' },
  { id: 'Ev Arkadaşı', icon: 'home-account' },
  { id: 'Etkinlik', icon: 'calendar-star' },
  { id: 'Eşya', icon: 'chair-rolling' },
  { id: 'Diğer', icon: 'dots-horizontal-circle-outline' },
];

const catIcon = (c: string) => CATS.find((x) => x.id === c)?.icon || 'tag-outline';

export default function ClassifiedsScreen() {
  useAppTheme();
  const [items, setItems] = useState<ClassifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<'Hepsi' | ClassifiedCategory>('Hepsi');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isObsStudent, setIsObsStudent] = useState(false);

  // Modal State
  const [addVisible, setAddVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<ClassifiedCategory>('Kitap');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const list = await ClassifiedsService.getClassifieds();
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = AuthService.onAuthChange(async (u) => {
      setProfile(u ? await AuthService.getUserProfile(u.uid) : null);
    });

    // Check OBS verification
    ObsService.getCredentials().then((c) => {
      setIsObsStudent(Boolean(c));
    });

    return () => unsub();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (cat === 'Hepsi' || i.category === cat) &&
        (!q ||
          i.title.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)))
    );
  }, [items, cat, query]);

  const toggleFav = async (id: string) => {
    const fav = await ClassifiedsService.toggleFavorite(id);
    setItems((p) => p.map((i) => (i.id === id ? { ...i, isFavorite: fav } : i)));
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Fotoğraf seçebilmek için galeri izni gereklidir.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Yerel file:// yolu başka cihazlarda açılmaz; Firebase Storage kullanılmadığından görsel
        // küçültülüp (720px, %60 JPEG ≈ 60-120 KB) data URI olarak ilan belgesine gömülür (1 MB belge sınırı)
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 720 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (manipulated.base64 && manipulated.base64.length < 700_000) {
          setSelectedImage(`data:image/jpeg;base64,${manipulated.base64}`);
        } else {
          Alert.alert('Görsel çok büyük', 'Lütfen daha küçük bir fotoğraf seçin.');
        }
      }
    } catch (e) {
      console.log('Resim seçme hatası:', e);
      Alert.alert('Hata', 'Fotoğraf işlenemedi.');
    }
  };

  const handleDelete = (item: ClassifiedItem) => {
    Alert.alert('İlanı Sil', 'Bu ilanı yayından kaldırmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await ClassifiedsService.deleteClassified(item.id);
          setItems((p) => p.filter((i) => i.id !== item.id));
        },
      },
    ]);
  };

  const handleReport = (item: ClassifiedItem) => {
    Alert.alert('İlanı Bildir', 'Bu ilanı uygunsuz içerik nedeniyle şikayet etmek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Bildir',
        style: 'destructive',
        onPress: async () => {
          const res = await ClassifiedsService.reportClassified(item.id);
          if (res.ok) {
            Alert.alert('Bildirim Alındı', res.alreadyReported ? 'Bu ilanı zaten bildirmiştiniz.' : 'İlan moderasyon ekibine iletildi. Teşekkürler.');
          } else {
            Alert.alert('Bildirilemedi', res.error || 'Şikayet gönderilemedi.');
          }
        },
      },
    ]);
  };

  const handleContact = (phone?: string) => {
    if (!phone) return;
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  const create = async () => {
    if (!title.trim()) return Alert.alert('Eksik alan', 'İlan başlığı gerekli.');
    setSubmitting(true);
    try {
      const created = await ClassifiedsService.createClassified({
        title: title.trim(),
        description: description.trim(),
        category: newCat,
        price: price.trim(),
        location: location.trim(),
        contactPhone: contactPhone.trim(),
        authorName: profile?.displayName || (isObsStudent ? 'Fırat Öğrencisi' : 'Öğrenci'),
        imageUri: selectedImage || '',
        verifiedStudent: isObsStudent,
      });

      setItems((p) => [created, ...p]);
      setAddVisible(false);
      setTitle('');
      setDescription('');
      setPrice('');
      setLocation('');
      setContactPhone('');
      setSelectedImage(null);
      Alert.alert('Başarılı', 'İlanınız başarıyla yayınlandı!');
    } catch (e: any) {
      const msg = String(e?.message || '');
      const code = String(e?.code || '');
      Alert.alert(
        'İlan yayınlanamadı',
        msg.includes('giriş') ? msg : code.includes('permission-denied') ? 'Yetki hatası: lütfen giriş yapıp tekrar deneyin.' : 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const currentUid = auth.currentUser?.uid;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[RED]} tintColor={RED} />}
      >
        {/* Arama Kutusu */}
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Kampüste ne arıyorsun?"
            placeholderTextColor={C.textFaint}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Kategori Çipleri */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATS.map((c) => (
            <Chip key={c.id} label={c.id} icon={c.icon} active={cat === c.id} tint={RED} onPress={() => setCat(c.id)} />
          ))}
        </ScrollView>

        {loading ? (
          <LoadingState label="İlanlar yükleniyor..." tint={RED} />
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon="bulletin-board"
              title="İlan yok"
              description="Henüz ilan eklenmemiş ya da filtreye uyan ilan bulunamadı. İlk ilanı sen ver!"
              tint={RED}
              action="İlan ver"
              onAction={() => setAddVisible(true)}
            />
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((i) => {
              const isOwner = Boolean(currentUid && i.ownerId === currentUid);

              return (
                <Card key={i.id} padded={false} style={styles.itemCard}>
                  {/* Sol Küçük Görsel veya Kategori İkonu */}
                  {i.imageUri ? (
                    <Image source={{ uri: i.imageUri }} style={styles.itemImage} />
                  ) : (
                    <View style={styles.itemIcon}>
                      <MaterialCommunityIcons name={catIcon(i.category) as any} size={28} color={RED} />
                    </View>
                  )}

                  <View style={{ flex: 1, padding: 12, gap: 5 }}>
                    {/* Üst Kategori ve Rozet Satırı */}
                    <View style={styles.itemTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Pill label={i.category} color={RED} bg={C.uniRedSoft} />
                        {i.verifiedStudent && (
                          <View style={styles.verifiedBadge}>
                            <Ionicons name="school" size={11} color="#047857" />
                            <Text style={styles.verifiedText}>Öğrenci</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity onPress={() => toggleFav(i.id)} hitSlop={8}>
                          <Ionicons
                            name={i.isFavorite ? 'heart' : 'heart-outline'}
                            size={20}
                            color={i.isFavorite ? C.danger : C.textFaint}
                          />
                        </TouchableOpacity>

                        {isOwner ? (
                          <TouchableOpacity onPress={() => handleDelete(i)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color={C.danger} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => handleReport(i)} hitSlop={8}>
                            <Ionicons name="flag-outline" size={16} color={C.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Başlık ve Açıklama */}
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {i.title}
                    </Text>
                    {i.description ? (
                      <Text style={styles.itemDesc} numberOfLines={2}>
                        {i.description}
                      </Text>
                    ) : null}

                    {/* Fiyat ve Konum */}
                    <View style={styles.itemMetaRow}>
                      <Text style={styles.itemPrice}>{i.price}</Text>
                      <Text style={styles.itemLocation}>• {i.location}</Text>
                    </View>

                    {/* Yazar ve İletişim */}
                    <View style={styles.itemFooter}>
                      <Text style={styles.itemAuthor} numberOfLines={1}>
                        {i.author} • {new Date(i.createdAt).toLocaleDateString('tr-TR')}
                      </Text>

                      {i.contactPhone ? (
                        <TouchableOpacity
                          style={styles.contactBtn}
                          onPress={() => handleContact(i.contactPhone)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="call" size={12} color="#fff" />
                          <Text style={styles.contactBtnText}>İletişim</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* FAB: İlan Ekle */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* İlan Ekle Modal */}
      <Modal visible={addVisible} animationType="slide" onRequestClose={() => setAddVisible(false)}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScreenHeader title="Yeni İlan" subtitle="Kampüs ve öğrenci panosu" onBack={() => setAddVisible(false)} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {isObsStudent ? (
              <Notice
                tone="info"
                text="🎓 Fırat OBS doğrulaması aktif: İlanınız 'Doğrulanmış Öğrenci' rozetiyle yayınlanacaktır."
              />
            ) : null}

            <Card style={{ gap: 12 }}>
              <Text style={styles.fieldLabel}>Kategori Seçin</Text>
              <View style={styles.chipsWrap}>
                {CATS.filter((c) => c.id !== 'Hepsi').map((c) => (
                  <Chip
                    key={c.id}
                    label={c.id}
                    icon={c.icon}
                    active={newCat === c.id}
                    tint={RED}
                    onPress={() => setNewCat(c.id as ClassifiedCategory)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>İlan Detayları</Text>
              <TextInput
                style={styles.input}
                placeholder="Başlık (Örn: Calculus 2 Kitabı / 2. Sınıf Notları)"
                placeholderTextColor={C.textFaint}
                value={title}
                onChangeText={setTitle}
              />

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Açıklama (Opsiyonel)"
                placeholderTextColor={C.textFaint}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Fiyat (Boşsa: Görüşülür)"
                  placeholderTextColor={C.textFaint}
                  value={price}
                  onChangeText={setPrice}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Konum (Örn: Mühendislik)"
                  placeholderTextColor={C.textFaint}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="İletişim Telefonu (Opsiyonel: 05xx...)"
                placeholderTextColor={C.textFaint}
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />

              {/* Fotoğraf Seçimi */}
              <Text style={styles.fieldLabel}>Fotoğraf (Opsiyonel)</Text>
              {selectedImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
                    <Ionicons name="close-circle" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoPickerBtn} onPress={pickImage} activeOpacity={0.8}>
                  <Ionicons name="camera-outline" size={22} color={C.primary} />
                  <Text style={styles.photoPickerText}>Fotoğraf Seç</Text>
                </TouchableOpacity>
              )}

              <PrimaryButton
                label="İlanı Yayınla"
                icon="checkmark"
                tint={RED}
                onPress={create}
                loading={submitting}
              />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.textPrimary },
  chips: { gap: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary, marginTop: 4 },
  itemCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: Theme.radius.lg,
  },
  itemIcon: {
    width: 80,
    backgroundColor: C.uniRedWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: 80,
    height: '100%',
    resizeMode: 'cover',
    backgroundColor: C.surfaceSubtle,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  itemTitle: {
    fontSize: 14,
    color: C.textPrimary,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemDesc: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 16,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: RED,
  },
  itemLocation: {
    fontSize: 12,
    color: C.textMuted,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingTop: 6,
  },
  itemAuthor: {
    fontSize: 11,
    color: C.textMuted,
    flex: 1,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  contactBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    backgroundColor: C.surfaceSubtle,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: Theme.radius.md,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: C.textPrimary,
  },
  textArea: {
    height: 74,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  photoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.primary,
    borderRadius: Theme.radius.md,
    paddingVertical: 14,
    backgroundColor: C.surfaceSubtle,
  },
  photoPickerText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  imagePreviewContainer: {
    position: 'relative',
    height: 140,
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.lg,
  },
}));
