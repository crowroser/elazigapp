import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Share, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';
import { AnnouncementDetailData } from '../services/apiService';
import { Card, LoadingState, Pill, PrimaryButton, ScreenHeader } from './ui';

const C = Theme.colors;
const RED = C.uniRed;

interface Props {
  visible: boolean;
  onClose: () => void;
  detail: AnnouncementDetailData | null;
  loading: boolean;
}

const fileIcon = (type?: string) => {
  const t = (type || '').toUpperCase();
  if (t === 'LINK') return 'open-in-new';
  if (t === 'PDF') return 'file-pdf-box';
  if (/DOC/.test(t)) return 'file-word-box';
  if (/XLS/.test(t)) return 'file-excel-box';
  if (/JPG|PNG|IMG/.test(t)) return 'file-image';
  return 'file-download-outline';
};

export const AnnouncementDetailModal: React.FC<Props> = ({ visible, onClose, detail, loading }) => {
  const share = async () => {
    if (!detail) return;
    try {
      await Share.share({ title: detail.title, message: `${detail.title}\n\n${detail.link}` });
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.top}>
          <ScreenHeader
            title="Duyuru"
            subtitle={detail?.unit || 'Fırat Üniversitesi'}
            light
            onBack={onClose}
            right={
              detail ? (
                <TouchableOpacity onPress={share} style={styles.shareBtn}>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
        {loading || !detail ? (
          <LoadingState label="Duyuru içeriği alınıyor..." tint={RED} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {detail.imageUrl ? <Image source={{ uri: detail.imageUrl }} style={styles.image} /> : null}
            <View style={styles.metaRow}>
              <Pill label={detail.unit || 'Duyuru'} color={RED} bg={C.uniRedSoft} style={{ maxWidth: '65%' }} />
              <Text style={styles.meta}>
                {detail.date}
                {detail.views ? ` · ${detail.views} görüntülenme` : ''}
              </Text>
            </View>
            <Text style={styles.title}>{detail.title}</Text>
            <View style={{ gap: 10 }}>
              {detail.paragraphs.map((p, i) => (
                <Text key={i} style={styles.para}>
                  {p}
                </Text>
              ))}
            </View>
            {detail.attachments.length > 0 ? (
              <Card style={{ gap: 4 }} padded={false}>
                <Text style={styles.attTitle}>Ekler ve dosyalar</Text>
                {detail.attachments.map((a, i) => (
                  <TouchableOpacity key={i} style={[styles.att, i < detail.attachments.length - 1 && styles.attBorder]} onPress={() => Linking.openURL(a.url)} activeOpacity={0.75}>
                    <MaterialCommunityIcons name={fileIcon(a.type) as any} size={22} color={RED} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attName} numberOfLines={2}>{a.name}</Text>
                      <Text style={styles.meta}>{[a.type, a.size].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Ionicons name="download-outline" size={18} color={C.textFaint} />
                  </TouchableOpacity>
                ))}
              </Card>
            ) : null}
            <PrimaryButton label="Üniversite sayfasında aç" icon="open-outline" tint={RED} variant="outline" onPress={() => Linking.openURL(detail.link)} />
            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  top: { backgroundColor: RED },
  shareBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: Theme.spacing.lg, gap: 14 },
  image: { width: '100%', height: 200, borderRadius: Theme.radius.lg, backgroundColor: C.surfaceSubtle },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  meta: { ...Theme.text.small, color: C.textMuted },
  title: { ...Theme.text.h1, color: C.textPrimary, lineHeight: 30 },
  para: { ...Theme.text.body, color: C.textSecondary, lineHeight: 22 },
  attTitle: { ...Theme.text.caption, color: C.textMuted, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  att: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  attBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
  attName: { ...Theme.text.body, color: C.textPrimary, fontWeight: '600' },
});
