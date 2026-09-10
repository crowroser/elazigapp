import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { User } from 'firebase/auth';
import { Theme } from '../constants/Theme';
import { AuthService, UserProfile, describeFirestoreError } from '../services/authService';
import { ObsService } from '../services/obsService';
import { PrefsService } from '../services/prefsService';
import { Card, Chip, Notice, PrimaryButton, ScreenHeader, SectionTitle, IconCircle } from './ui';

const C = Theme.colors;

interface AuthProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onProfileUpdated?: (profile: UserProfile | null) => void;
}

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({ visible, onClose, onProfileUpdated }) => {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [elazigKartNo, setElazigKartNo] = useState('');
  const [obsStudentNo, setObsStudentNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'warning' | 'danger' | 'success'; text: string } | null>(null);
  const [recentStops, setRecentStops] = useState<string[]>([]);
  const [recentRoutes, setRecentRoutes] = useState<string[]>([]);

  useEffect(() => {
    const unsub = AuthService.onAuthChange(async (user) => {
      setCurrentUser(user);
      if (user) {
        const prof = await AuthService.getUserProfile(user.uid);
        setUserProfile(prof);
        setElazigKartNo(prof?.elazigKartNo || '');
        setDisplayName(prof?.displayName || '');
        onProfileUpdated?.(prof);
      } else {
        setUserProfile(null);
        onProfileUpdated?.(null);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    setNotice(null);
    ObsService.getCredentials().then((c) => setObsStudentNo(c?.studentNo || ''));
    PrefsService.getElazigKartNo().then((n) => {
      if (n && !elazigKartNo) setElazigKartNo(n);
    });
    PrefsService.getRecentStops().then(setRecentStops);
    PrefsService.getRecentRoutes().then(setRecentRoutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const authError = (e: any): string => {
    const map: Record<string, string> = {
      'auth/user-not-found': 'Bu e-posta ile kayıtlı hesap yok.',
      'auth/wrong-password': 'Şifre hatalı.',
      'auth/invalid-email': 'Geçersiz e-posta.',
      'auth/user-disabled': 'Hesap devre dışı.',
      'auth/too-many-requests': 'Çok fazla deneme; biraz bekleyin.',
      'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı, giriş yapın.',
      'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
      'auth/invalid-credential': 'E-posta veya şifre hatalı.',
      'auth/network-request-failed': 'İnternet bağlantısı yok.',
    };
    return map[e?.code] || e?.message || 'Bir hata oluştu.';
  };

  const handleLogin = async () => {
    if (!email || !password) return setNotice({ tone: 'warning', text: 'E-posta ve şifrenizi girin.' });
    setLoading(true);
    try {
      await AuthService.signIn(email.trim(), password);
      setNotice({ tone: 'success', text: 'Giriş yapıldı.' });
      setPassword('');
    } catch (e) {
      setNotice({ tone: 'danger', text: authError(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !displayName) return setNotice({ tone: 'warning', text: 'Ad soyad, e-posta ve şifre gerekli.' });
    setLoading(true);
    try {
      await AuthService.signUp(email.trim(), password, displayName.trim(), elazigKartNo.trim());
      setNotice({ tone: 'success', text: 'Hesabınız oluşturuldu.' });
      setPassword('');
    } catch (e) {
      setNotice({ tone: 'danger', text: authError(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCard = async () => {
    const no = elazigKartNo.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (no.length < 8 || no.length > 20) return setNotice({ tone: 'warning', text: 'Kart numarası 8-20 karakter olmalı (arka yüzdeki seri no).' });
    setLoading(true);
    try {
      await PrefsService.setElazigKartNo(no);
      const updated = { ...(userProfile || { uid: currentUser?.uid || '', email: currentUser?.email || '', displayName }), elazigKartNo: no, displayName: displayName || userProfile?.displayName || '' };
      setUserProfile(updated as UserProfile);
      onProfileUpdated?.(updated as UserProfile);
      if (currentUser) {
        await AuthService.updateUserProfile(currentUser.uid, { elazigKartNo: no, displayName: updated.displayName });
        setNotice({ tone: 'success', text: 'Kart numaranız kaydedildi ve hesabınızla eşitlendi.' });
      } else {
        setNotice({ tone: 'success', text: 'Kart numaranız bu cihaza kaydedildi. Hesap açarsanız cihazlar arası eşitlenir.' });
      }
    } catch (e) {
      setNotice({ tone: 'warning', text: describeFirestoreError(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await AuthService.signOutUser();
      setNotice({ tone: 'info', text: 'Oturum kapatıldı.' });
    } catch {
      setNotice({ tone: 'danger', text: 'Çıkış yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title={currentUser ? 'Hesabım' : mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'} onBack={onClose} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

          {/* Kart numarası — hesap olsun olmasın */}
          <Card style={{ gap: 10 }}>
            <View style={styles.rowHead}>
              <IconCircle name="credit-card-chip-outline" color={C.primary} bg={C.surfaceVariant} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>ElazığKart Numaram</Text>
                <Text style={styles.cardSub}>Ana sayfada bakiyeniz otomatik sorgulanır</Text>
              </View>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Kart arka yüzündeki seri no"
                placeholderTextColor={C.textFaint}
                value={elazigKartNo}
                onChangeText={setElazigKartNo}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
              />
              <PrimaryButton label="Kaydet" onPress={handleSaveCard} loading={loading} style={{ paddingHorizontal: 14 }} />
            </View>
          </Card>

          {currentUser ? (
            <>
              <Card style={{ alignItems: 'center', gap: 4 }}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(userProfile?.displayName || currentUser.displayName || 'K').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{userProfile?.displayName || currentUser.displayName || 'Kullanıcı'}</Text>
                <Text style={styles.cardSub}>{currentUser.email}</Text>
              </Card>

              <Card style={{ gap: 10 }}>
                <View style={styles.rowHead}>
                  <IconCircle name="school" color={C.uniRed} bg={C.uniRedSoft} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>OBS Hesabı</Text>
                    <Text style={styles.cardSub}>{obsStudentNo ? `Bağlı: ${obsStudentNo}` : 'Bağlı OBS hesabı yok'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton label={obsStudentNo ? 'OBS\'yi Aç' : 'OBS\'ye Bağlan'} icon="school-outline" tint={C.uniRed} onPress={() => { onClose(); router.push('/obs' as any); }} style={{ flex: 1 }} />
                  {obsStudentNo ? (
                    <PrimaryButton
                      label="Kaldır"
                      icon="trash-outline"
                      tint={C.danger}
                      variant="outline"
                      onPress={async () => {
                        await ObsService.clearCredentials();
                        setObsStudentNo('');
                        setNotice({ tone: 'info', text: 'OBS bilgileri cihazdan silindi.' });
                      }}
                    />
                  ) : null}
                </View>
              </Card>

              {(recentStops.length > 0 || recentRoutes.length > 0) ? (
                <Card style={{ gap: 10 }}>
                  <Text style={styles.cardTitle}>Son Aramalar</Text>
                  <View style={styles.tags}>
                    {recentStops.map((s) => <Chip key={`s-${s}`} label={s} icon="bus-stop" />)}
                    {recentRoutes.map((r) => <Chip key={`r-${r}`} label={r} icon="routes" />)}
                  </View>
                </Card>
              ) : null}

              <PrimaryButton label="Oturumu Kapat" icon="log-out-outline" variant="outline" tint={C.danger} onPress={handleSignOut} loading={loading} />
            </>
          ) : (
            <Card style={{ gap: 12 }}>
              <SectionTitle title={mode === 'login' ? 'Hesabınla giriş yap' : 'Yeni hesap oluştur'} subtitle="Kart ve aramaların cihazlar arasında eşitlenir" style={{ paddingHorizontal: 0, marginTop: 0, marginBottom: 0 }} />
              {mode === 'register' ? (
                <Field label="Ad Soyad">
                  <TextInput style={styles.input} placeholder="Adınız Soyadınız" placeholderTextColor={C.textFaint} value={displayName} onChangeText={setDisplayName} />
                </Field>
              ) : null}
              <Field label="E-posta">
                <TextInput style={styles.input} placeholder="ornek@email.com" placeholderTextColor={C.textFaint} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </Field>
              <Field label="Şifre">
                <TextInput style={styles.input} placeholder="En az 6 karakter" placeholderTextColor={C.textFaint} value={password} onChangeText={setPassword} secureTextEntry />
              </Field>
              <PrimaryButton label={mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'} onPress={mode === 'login' ? handleLogin : handleRegister} loading={loading} />
              <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
                <Text style={styles.switch}>{mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}</Text>
              </TouchableOpacity>
            </Card>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { ...Theme.text.h3, color: C.textPrimary },
  cardSub: { ...Theme.text.small, color: C.textMuted, marginTop: 1 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.surfaceSubtle, borderWidth: 1, borderColor: C.cardBorder, borderRadius: Theme.radius.md, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.textPrimary },
  label: { ...Theme.text.caption, color: C.textMuted, textTransform: 'uppercase' },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  name: { ...Theme.text.h2, color: C.textPrimary, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switch: { ...Theme.text.small, color: C.primaryLight, fontWeight: '700', textAlign: 'center' },
});
