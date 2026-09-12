import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { GakgosAiService, GakgosMessage } from '../services/gakgosAiService';
import { Chip } from '../components/ui';

const C = Theme.colors;

const SUGGESTIONS = [
  'Nöbetçi eczaneler',
  'Hava durumu',
  'Yemek menüsü',
  'Notlarım ve AGNO',
  'Bugünkü derslerim',
  'Kart bakiyem',
  'Etkinlikler',
  'Harput',
];

function renderRich(text: string) {
  // *kalın* işaretlerini vurgular
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*') ? (
      <Text key={i} style={{ fontWeight: '800' }}>
        {p.slice(1, -1)}
      </Text>
    ) : (
      <Text key={i}>{p}</Text>
    )
  );
}

export default function AssistantScreen() {
  useAppTheme();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<GakgosMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Selam gakgoş! Elazığ ve Fırat Üniversitesi hakkında canlı bilgi verebilirim: nöbetçi eczaneler, hava durumu, otobüs saatleri, yemekhane, etkinlikler ve OBS notların.\n\nSana nasıl yardımcı olabilirim gakgoş?',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const scrollRef = useRef<ScrollView>(null);
  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || streaming) return;

    const ts = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `u-${Date.now()}`;
    const botMsgId = `b-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: q, timestamp: ts() },
      { id: botMsgId, sender: 'bot', text: '...', timestamp: ts() },
    ]);

    setInput('');
    setStreaming(true);
    scrollDown();

    try {
      await GakgosAiService.askGakgosStream(q, (currentText, meta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  text: currentText,
                  actionRoute: meta?.actionRoute,
                  actionLabel: meta?.actionLabel,
                }
              : m
          )
        );
        scrollDown();
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                text: 'Gakgoş, canlı sistemle bağlantı kurulurken ufak bir aksaklık oldu. Tekrar dener misin?',
              }
            : m
        )
      );
    } finally {
      setStreaming(false);
      scrollDown();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Gizlilik Güvencesi Rozeti */}
      <View style={styles.privacyBanner}>
        <Ionicons name="shield-checkmark" size={13} color="#047857" />
        <Text style={styles.privacyText}>
          Gizlilik Garantisi: Not ve OBS verileriniz cihazınızdan asla dışarı çıkmaz.
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollDown}
        >
          {messages.map((m) => (
            <View key={m.id} style={[styles.bubbleRow, m.sender === 'user' && styles.bubbleRowUser]}>
              {m.sender === 'bot' ? (
                <View style={styles.avatar}>
                  <MaterialCommunityIcons name="robot-happy-outline" size={18} color="#fff" />
                </View>
              ) : null}

              <View style={[styles.bubble, m.sender === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={[styles.bubbleText, m.sender === 'user' && { color: '#fff' }]}>
                  {m.text === '...' ? (
                    <Text style={{ fontStyle: 'italic', color: C.textMuted }}>Gakgoş düşünüyor...</Text>
                  ) : (
                    renderRich(m.text)
                  )}
                </Text>

                {/* Butonlu Eylem Rozeti */}
                {m.actionRoute && m.actionLabel ? (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => router.push(m.actionRoute as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionBtnText}>{m.actionLabel} ➔</Text>
                  </TouchableOpacity>
                ) : null}

                <Text style={[styles.time, m.sender === 'user' && { color: 'rgba(255,255,255,0.7)' }]}>
                  {m.timestamp}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Hızlı Öneri Çipleri */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestions}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((s) => (
            <Chip key={s} label={s} onPress={() => send(s)} />
          ))}
        </ScrollView>

        {/* Giriş Çubuğu */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Gakgoş'a sor…"
            placeholderTextColor={C.textFaint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!streaming}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || streaming) && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={!input.trim() || streaming}
          >
            {streaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Theme.colors.successBg,
    borderBottomWidth: 1,
    borderBottomColor: '#a7f3d0',
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  privacyText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  chat: { padding: Theme.spacing.lg, gap: 12, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' },
  bubbleRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { padding: 12, borderRadius: 18, gap: 6, flexShrink: 1 },
  bubbleBot: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderBottomLeftRadius: 6,
    ...Theme.shadows.sm,
  },
  bubbleUser: { backgroundColor: C.primary, borderBottomRightRadius: 6 },
  bubbleText: { ...Theme.text.body, color: C.textPrimary, lineHeight: 20 },
  actionBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: C.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  time: { fontSize: 10, color: C.textFaint, alignSelf: 'flex-end' },
  suggestions: { paddingHorizontal: Theme.spacing.lg, gap: 8, paddingVertical: 8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: 12,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: Theme.radius.pill,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
    color: C.textPrimary,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
