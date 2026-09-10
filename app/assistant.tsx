import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../constants/Theme';
import { GakgosAiService, GakgosMessage } from '../services/gakgosAiService';
import { Chip } from '../components/ui';

const C = Theme.colors;

const SUGGESTIONS = ['Nöbetçi eczaneler', 'Hava durumu', 'Bugünkü yemek menüsü', 'Notlarım', 'Bugünkü ders programım', 'Kesinti var mı?', 'Harput'];

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
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<GakgosMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Selam gakgoş! Elazığ hakkında canlı bilgi verebilirim: nöbetçi eczane, hava, otobüs, yemekhane, kesintiler, duyurular ve OBS notların. Ne öğrenmek istersin?',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const scrollRef = useRef<ScrollView>(null);
  const scrollDown = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const send = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || thinking) return;
    const ts = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setMessages((m) => [...m, { id: `u-${Date.now()}`, sender: 'user', text: q, timestamp: ts() }]);
    setInput('');
    scrollDown();
    setThinking(true);
    try {
      const a = await GakgosAiService.askGakgos(q);
      setMessages((m) => [...m, { id: `b-${Date.now()}`, sender: 'bot', text: a, timestamp: ts() }]);
    } catch {
      setMessages((m) => [...m, { id: `b-${Date.now()}`, sender: 'bot', text: 'Bir anlık bağlantı sorunu oldu gakgoş, tekrar dener misin?', timestamp: ts() }]);
    } finally {
      setThinking(false);
      scrollDown();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chat} showsVerticalScrollIndicator={false} onContentSizeChange={scrollDown}>
          {messages.map((m) => (
            <View key={m.id} style={[styles.bubbleRow, m.sender === 'user' && styles.bubbleRowUser]}>
              {m.sender === 'bot' ? (
                <View style={styles.avatar}>
                  <MaterialCommunityIcons name="robot-happy-outline" size={18} color="#fff" />
                </View>
              ) : null}
              <View style={[styles.bubble, m.sender === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
                <Text style={[styles.bubbleText, m.sender === 'user' && { color: '#fff' }]}>{renderRich(m.text)}</Text>
                <Text style={[styles.time, m.sender === 'user' && { color: 'rgba(255,255,255,0.7)' }]}>{m.timestamp}</Text>
              </View>
            </View>
          ))}
          {thinking ? (
            <View style={styles.bubbleRow}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="robot-happy-outline" size={18} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleBot, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.bubbleText}>Canlı verilere bakıyorum…</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions} keyboardShouldPersistTaps="handled">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} label={s} onPress={() => send(s)} />
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Gakgoş'a sor…"
            placeholderTextColor={C.textFaint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || thinking) && { opacity: 0.5 }]} onPress={() => send()} disabled={!input.trim() || thinking}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  chat: { padding: Theme.spacing.lg, gap: 12, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' },
  bubbleRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { padding: 12, borderRadius: 18, gap: 4, flexShrink: 1 },
  bubbleBot: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, borderBottomLeftRadius: 6 },
  bubbleUser: { backgroundColor: C.primary, borderBottomRightRadius: 6 },
  bubbleText: { ...Theme.text.body, color: C.textPrimary, lineHeight: 20 },
  time: { fontSize: 10, color: C.textFaint, alignSelf: 'flex-end' },
  suggestions: { paddingHorizontal: Theme.spacing.lg, gap: 8, paddingVertical: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Theme.spacing.lg, paddingBottom: 12, paddingTop: 4 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, borderRadius: Theme.radius.pill, paddingHorizontal: 16, height: 48, fontSize: 15, color: C.textPrimary },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
