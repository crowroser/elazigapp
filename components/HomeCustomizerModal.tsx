import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, ThemeService, ThemePreference, themedStyles, useAppTheme } from '../constants/Theme';
import { Card, PrimaryButton, ScreenHeader, Pill } from './ui';
import { DEFAULT_HOME_LAYOUT } from '../services/prefsService';

const C = Theme.colors;

const CARD_DEFINITIONS: Record<string, { label: string; icon: string }> = {
  student: { label: 'Öğrenci Dersi (OBS)', icon: 'school' },
  card: { label: 'ElazığKart Bakiyesi', icon: 'credit-card-chip-outline' },
  favoriteStop: { label: 'Benim Durağım (Canlı)', icon: 'star-outline' },
  quickActions: { label: 'Hızlı Erişim Butonları', icon: 'view-grid-outline' },
  weather: { label: 'Hava Durumu', icon: 'weather-partly-cloudy' },
  prayer: { label: 'Namaz Vakitleri', icon: 'clock-outline' },
  pharmacies: { label: 'Nöbetçi Eczaneler', icon: 'medical-bag' },
  news: { label: 'Şehir Haberleri', icon: 'newspaper-variant-outline' },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  layout: string[];
  hidden: string[];
  onSave: (layout: string[], hidden: string[]) => void;
}

export function HomeCustomizerModal({ visible, onClose, layout: initialLayout, hidden: initialHidden, onSave }: Props) {
  useAppTheme();
  const [themePref, setThemePref] = useState<ThemePreference>(ThemeService.getPreference());
  const [currentLayout, setCurrentLayout] = useState<string[]>(initialLayout || DEFAULT_HOME_LAYOUT);
  const [currentHidden, setCurrentHidden] = useState<string[]>(initialHidden || []);

  // Modal her açıldığında kaydedilmiş düzenden başla: ana sayfa tercihleri asenkron yüklenir ve
  // modal bileşeni açılmadan önce oluşturulur; ayrıca "vazgeç" sonrası taslak değişiklikler kalmasın
  useEffect(() => {
    if (visible) {
      setThemePref(ThemeService.getPreference());
      setCurrentLayout(initialLayout && initialLayout.length > 0 ? [...initialLayout] : [...DEFAULT_HOME_LAYOUT]);
      setCurrentHidden(initialHidden ? [...initialHidden] : []);
    }
  }, [visible, initialLayout, initialHidden]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...currentLayout];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setCurrentLayout(next);
  };

  const moveDown = (index: number) => {
    if (index === currentLayout.length - 1) return;
    const next = [...currentLayout];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setCurrentLayout(next);
  };

  const toggleHide = (id: string) => {
    setCurrentHidden((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleReset = () => {
    setCurrentLayout([...DEFAULT_HOME_LAYOUT]);
    setCurrentHidden([]);
  };

  const handleSave = () => {
    onSave(currentLayout, currentHidden);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle={C.statusBar} backgroundColor={C.background} />
        <ScreenHeader
          title="Ana Sayfayı Düzenle"
          subtitle="Bölüm sıralamasını ve görünürlüğünü özelleştirin"
          onBack={onClose}
          right={
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
              <Text style={styles.resetText}>Sıfırla</Text>
            </TouchableOpacity>
          }
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Görünüm: sistem / açık / koyu — anında uygulanır, kalıcı saklanır */}
          <Text style={styles.sectionTitle}>Görünüm</Text>
          <View style={styles.themeRow}>
            {(
              [
                { key: 'system', label: 'Sistem', icon: 'phone-portrait-outline' },
                { key: 'light', label: 'Açık', icon: 'sunny-outline' },
                { key: 'dark', label: 'Koyu', icon: 'moon-outline' },
              ] as const
            ).map((opt) => {
              const active = themePref === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeBtn, active && styles.themeBtnActive]}
                  onPress={() => {
                    setThemePref(opt.key);
                    ThemeService.setPreference(opt.key);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name={opt.icon as any} size={18} color={active ? C.textWhite : C.textSecondary} />
                  <Text style={[styles.themeBtnText, active && styles.themeBtnTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Ana Sayfa Kartları</Text>
          <Text style={styles.info}>
            Kartların yerini değiştirmek için yukarı/aşağı okları, gizlemek için göz simgesini kullanabilirsiniz.
          </Text>

          <View style={{ gap: 8 }}>
            {currentLayout.map((id, index) => {
              const def = CARD_DEFINITIONS[id] || { label: id, icon: 'card-outline' };
              const isHidden = currentHidden.includes(id);

              return (
                <Card
                  key={id}
                  style={[styles.itemCard, isHidden && { opacity: 0.55, backgroundColor: C.surfaceSubtle }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <MaterialCommunityIcons name={def.icon as any} size={22} color={isHidden ? C.textMuted : C.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemLabel, isHidden && { color: C.textMuted }]}>{def.label}</Text>
                      {isHidden ? <Pill label="Gizlendi" color={C.textMuted} bg={C.cardBorder} /> : null}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TouchableOpacity
                      onPress={() => moveUp(index)}
                      disabled={index === 0}
                      style={[styles.actionBtn, index === 0 && { opacity: 0.3 }]}
                    >
                      <Ionicons name="arrow-up" size={18} color={C.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveDown(index)}
                      disabled={index === currentLayout.length - 1}
                      style={[styles.actionBtn, index === currentLayout.length - 1 && { opacity: 0.3 }]}
                    >
                      <Ionicons name="arrow-down" size={18} color={C.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleHide(id)} style={styles.actionBtn}>
                      <Ionicons
                        name={isHidden ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={isHidden ? C.textMuted : C.primary}
                      />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>

          <PrimaryButton label="Değişiklikleri Kaydet" icon="checkmark-circle-outline" onPress={handleSave} style={{ marginTop: 12 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: 12 },
  info: { ...Theme.text.small, color: C.textMuted, lineHeight: 18 },
  sectionTitle: { ...Theme.text.h3, color: C.textPrimary, marginTop: 4 },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: Theme.radius.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder },
  themeBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  themeBtnText: { ...Theme.text.body, color: C.textSecondary, fontWeight: '700' },
  themeBtnTextActive: { color: C.textWhite },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceVariant },
  resetText: { ...Theme.text.small, color: C.primary, fontWeight: '700' },
  itemCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  itemLabel: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  actionBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surfaceSubtle, alignItems: 'center', justifyContent: 'center' },
}));
