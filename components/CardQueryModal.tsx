import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { Theme, themedStyles } from '../constants/Theme';
import { ApiService, CardBalanceResult } from '../services/apiService';

interface CardQueryModalProps {
  visible: boolean;
  onClose: () => void;
  /** Kayıtlı kart numarası — açılışta alanı doldurur */
  initialCardNo?: string;
  onSuccess?: (result: CardBalanceResult, cardNo: string) => void;
}

export const CardQueryModal: React.FC<CardQueryModalProps> = ({
  visible,
  onClose,
  initialCardNo,
  onSuccess,
}) => {
  const router = useRouter();
  const [cardNumber, setCardNumber] = useState(initialCardNo || '');

  useEffect(() => {
    if (visible && initialCardNo && !cardNumber) setCardNumber(initialCardNo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCardNo]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardBalanceResult | null>(null);
  const [isNfcScanning, setIsNfcScanning] = useState(false);
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // NFC Desteği kontrolü
    NfcManager.isSupported()
      .then((supported) => setNfcSupported(!!supported))
      .catch(() => setNfcSupported(false));

    return () => {
      stopNfcScan();
    };
  }, []);

  const stopNfcScan = async () => {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {
      // Sessizce geç
    }
    setIsNfcScanning(false);
  };

  const handleStartNfcScan = async () => {
    try {
      // 1. Native module kontrolü (Expo Go vs Standalone APK)
      if (!NfcManager || typeof NfcManager.isSupported !== 'function') {
        Alert.alert(
          'NFC Modülü Yüklenemedi',
          'NFC özelliğinin çalışabilmesi için yeni oluşturulan APK dosyasının telefona yüklenmiş olması gerekir. (Expo Go uygulamasında yerel NFC desteği bulunmaz).'
        );
        return;
      }

      const supported = await NfcManager.isSupported().catch(() => false);
      if (!supported) {
        Alert.alert('NFC Desteklenmiyor', 'Cihazınızda NFC özelliği bulunmamaktadır veya aktif değildir.');
        return;
      }

      const enabled = await NfcManager.isEnabled().catch(() => false);
      if (!enabled) {
        Alert.alert(
          'NFC Kapalı',
          'NFC ile kart okuyabilmek için lütfen cihaz ayarlarınızdan NFC özelliğini açın.',
          [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Ayarları Aç',
              onPress: () => {
                if (Platform.OS === 'android') {
                  NfcManager.goToNfcSetting();
                }
              },
            },
          ]
        );
        return;
      }

      // Ekranda hemen tarama görselini göster
      setIsNfcScanning(true);
      await NfcManager.start();

      // NFC Kart Okuma teknolojisini başlat
      await NfcManager.requestTechnology([
        NfcTech.NfcA,
        NfcTech.Ndef,
        NfcTech.IsoDep,
      ]);
      const tag = await NfcManager.getTag();

      if (tag && tag.id) {
        // Tag ID temizle (Örn: AA:BB:CC:DD -> AABBCCDD)
        const cleanHex = tag.id.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        // Sunucu genellikle HEX formatı bekliyorsa, HEX formatını gönderiyoruz
        const scannedId = cleanHex;

        setCardNumber(scannedId);
        setIsNfcScanning(false);
        await NfcManager.cancelTechnologyRequest().catch(() => {});

        // Otomatik sorgu çalıştır
        handleQueryWithCard(scannedId);
      }
    } catch (ex: any) {
      console.log('NFC okuma hatası:', ex);
      if (ex?.message && !ex.message.includes('cancel')) {
        Alert.alert('NFC Hata', `Okuma başlatılamadı: ${ex.message}`);
      }
      stopNfcScan();
    }
  };

  const handleQueryWithCard = async (cardNum: string) => {
    if (!cardNum.trim()) return;
    setLoading(true);
    setResult(null);

    const res = await ApiService.queryCardBalance(cardNum);
    setLoading(false);
    setResult(res);

    if (res.success && onSuccess) {
      onSuccess(res, cardNum.replace(/[^0-9A-Za-z]/g, '').toUpperCase());
    }
  };

  const handleQuery = () => {
    handleQueryWithCard(cardNumber);
  };

  const handleReset = () => {
    setResult(null);
    setCardNumber('');
    stopNfcScan();
  };

  const handleClose = () => {
    stopNfcScan();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.headerRow}>
              <View style={styles.titleGroup}>
                <View style={styles.iconBox}>
                  <MaterialCommunityIcons name="credit-card-search-outline" size={22} color={Theme.colors.primary} />
                </View>
                <Text style={styles.modalTitle}>ElazığKart Bakiye Sorgulama</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={Theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {isNfcScanning ? (
              <View style={styles.nfcScanContainer}>
                <View style={styles.nfcRadarCircle}>
                  <MaterialCommunityIcons name="nfc" size={54} color={Theme.colors.primary} />
                </View>
                <Text style={styles.nfcTitle}>Kartınızı Yaklaştırın</Text>
                <Text style={styles.nfcSubtitle}>
                  ElazığKart'ınızı telefonunuzun arka kısmına temas ettirin...
                </Text>
                <ActivityIndicator color={Theme.colors.primary} size="small" style={{ marginTop: 12 }} />

                <TouchableOpacity style={styles.nfcCancelButton} onPress={stopNfcScan}>
                  <Text style={styles.nfcCancelText}>İptal</Text>
                </TouchableOpacity>
              </View>
            ) : !result ? (
              <View style={styles.formContent}>
                {/* NFC Tarama Butonu */}
                <TouchableOpacity
                  style={styles.nfcScanButton}
                  onPress={handleStartNfcScan}
                  activeOpacity={0.8}
                >
                  <View style={styles.nfcIconWrapper}>
                    <MaterialCommunityIcons name="nfc" size={24} color="#ffffff" />
                  </View>
                  <View style={styles.nfcButtonTextGroup}>
                    <Text style={styles.nfcButtonTitle}>NFC İle Kart Okut</Text>
                    <Text style={styles.nfcButtonSub}>Kartı telefonun arkasına dokundurun</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>veya kart numaranızı girin</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons name="credit-card-outline" size={20} color={Theme.colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Kart seri numarası (arka yüz, 14 hane)"
                    placeholderTextColor={Theme.colors.textMuted}
                    value={cardNumber}
                    onChangeText={setCardNumber}
                    keyboardType="default"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={20}
                  />
                  {cardNumber.length > 0 && (
                    <TouchableOpacity onPress={() => setCardNumber('')}>
                      <Ionicons name="close-circle" size={18} color={Theme.colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                  onPress={handleQuery}
                  disabled={loading || !cardNumber.trim()}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={18} color="#ffffff" />
                      <Text style={styles.submitButtonText}>Bakiyeyi Sorgula</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.sampleBox}>
                  <Ionicons name="information-circle-outline" size={16} color={Theme.colors.secondary} />
                  <Text style={styles.sampleText}>
                    ElazığKart'ınızı NFC ile okutabilir ya da kartın arka yüzünün sağ altındaki 14 haneli seri numarasını yazarak sorgulayabilirsiniz.
                  </Text>
                </View>

                {/* Kart Yükleme Noktaları / Bayiler yönlendirmesi */}
                <TouchableOpacity
                  style={styles.centersLink}
                  onPress={() => {
                    onClose();
                    router.push('/fillingcenters' as any);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.centersLinkIcon}>
                    <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={Theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.centersLinkTitle}>Kart Dolum Noktaları</Text>
                    <Text style={styles.centersLinkSub}>Bayiler ve kiosklar haritada, konuma göre sıralı</Text>
                  </View>
                  <View style={styles.centersLinkBadge}>
                    <Text style={styles.centersLinkBadgeText}>Haritada Gör</Text>
                    <Ionicons name="chevron-forward" size={14} color={Theme.colors.primary} />
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.resultContainer}>
                {result.success ? (
                  <View style={styles.successResult}>
                    <View style={styles.badgeSuccess}>
                      <Ionicons name="checkmark-circle" size={40} color={Theme.colors.successGreen} />
                    </View>

                    <Text style={styles.ownerName}>{result.adSoyad || 'ElazığKart'}</Text>
                    <Text style={styles.cardTypeLabel}>
                      {result.adSoyad ? result.kartTipi : `Kart No: ${cardNumber.replace(/[^0-9A-Za-z]/g, '')}`}
                    </Text>

                    <View style={styles.bakiyeBox}>
                      <Text style={styles.bakiyeTitle}>GÜNCEL BAKİYE</Text>
                      <Text style={styles.bakiyeValue}>₺{(result.bakiye ?? 0).toFixed(2)}</Text>
                      {result.bekleyenBakiye != null && result.bekleyenBakiye > 0 && (
                        <Text style={styles.bakiyePending}>
                          + ₺{result.bekleyenBakiye.toFixed(2)} bekleyen yükleme (karta okutulunca eklenir)
                        </Text>
                      )}
                    </View>

                    <View style={styles.infoTable}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Kart Durumu:</Text>
                        <Text style={result.kartDurumu === 'Aktif' ? styles.infoValueGreen : styles.infoValue}>
                          {result.kartDurumu}
                        </Text>
                      </View>
                      {result.gecerlilik ? (
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Geçerlilik:</Text>
                          <Text style={styles.infoValue}>{result.gecerlilik}</Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.centersLinkResult}
                      onPress={() => {
                        onClose();
                        router.push('/fillingcenters' as any);
                      }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={Theme.colors.primary} />
                      <Text style={styles.centersLinkResultText}>En Yakın Dolum Noktalarını Haritada Gör</Text>
                      <Ionicons name="chevron-forward" size={14} color={Theme.colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.8}>
                      <Ionicons name="refresh-outline" size={16} color={Theme.colors.primary} />
                      <Text style={styles.resetButtonText}>Başka Kart Sorgula</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.errorResult}>
                    <Ionicons name="alert-circle-outline" size={44} color={Theme.colors.pharmacyRed} />
                    <Text style={styles.errorText}>{result.message || 'Kart bulunamadı veya hata oluştu.'}</Text>
                    <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                      <Text style={styles.resetButtonText}>Tekrar Deneyin</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = themedStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 27, 51, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '88%',
    ...Theme.shadows.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
  },
  closeButton: {
    padding: 6,
  },
  formContent: {
    gap: 12,
  },
  nfcScanButton: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Theme.shadows.md,
  },
  nfcIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfcButtonTextGroup: {
    flex: 1,
  },
  nfcButtonTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  nfcButtonSub: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.cardBorder,
  },
  dividerText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: Theme.colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Theme.colors.textPrimary,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: Theme.colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...Theme.shadows.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  sampleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceVariant,
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  sampleText: {
    fontSize: 12,
    color: Theme.colors.secondary,
    flex: 1,
  },
  nfcScanContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  nfcRadarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    marginBottom: 8,
  },
  nfcTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  nfcSubtitle: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  nfcCancelButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  nfcCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.colors.textMuted,
  },
  resultContainer: {
    paddingVertical: 10,
  },
  successResult: {
    alignItems: 'center',
  },
  badgeSuccess: {
    marginBottom: 8,
  },
  ownerName: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  cardTypeLabel: {
    fontSize: 13,
    color: Theme.colors.secondary,
    fontWeight: '600',
    marginTop: 2,
  },
  bakiyeBox: {
    backgroundColor: Theme.colors.surfaceVariant,
    width: '100%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: Theme.colors.secondaryBg,
  },
  bakiyeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.secondary,
    letterSpacing: 1,
  },
  bakiyeValue: {
    fontSize: 32,
    fontWeight: '800',
    color: Theme.colors.primary,
    marginTop: 4,
  },
  centersLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.surfaceSubtle,
    marginTop: 12,
  },
  centersLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.colors.secondaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centersLinkTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  centersLinkSub: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 1,
  },
  centersLinkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  centersLinkBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  centersLinkResult: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.colors.successBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginTop: 10,
  },
  centersLinkResultText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  bakiyePending: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.secondary,
    marginTop: 6,
    textAlign: 'center',
  },
  infoTable: {
    width: '100%',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: Theme.colors.textMuted,
  },
  infoValue: {
    fontSize: 13,
    color: Theme.colors.textPrimary,
    fontWeight: '600',
  },
  infoValueGreen: {
    fontSize: 13,
    color: Theme.colors.successGreen,
    fontWeight: '700',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  errorResult: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  errorText: {
    fontSize: 14,
    color: Theme.colors.pharmacyRed,
    textAlign: 'center',
    fontWeight: '600',
  },
}));

