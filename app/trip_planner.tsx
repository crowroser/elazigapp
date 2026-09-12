import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { Card, Pill, ScreenHeader } from '../components/ui';
import { ApiService, BusStation } from '../services/apiService';
import {
  TripPlannerService,
  TripPlan,
  TripLocation,
  POPULAR_DESTINATIONS,
} from '../services/tripPlannerService';
import { LeafletMap, LeafletMapRef, LeafletMarkerItem } from '../components/LeafletMap';

const C = Theme.colors;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TripPlannerScreen() {
  useAppTheme();
  const router = useRouter();

  // Konum alınamazsa şehir merkezi (Valilik) varsayılan başlangıçtır; adı bunu açıkça söyler
  const [origin, setOrigin] = useState<TripLocation>({
    name: 'Şehir Merkezi (Valilik)',
    lat: 38.6753,
    lng: 39.2105,
  });
  const [destination, setDestination] = useState<TripLocation | null>(null);

  const [originInput, setOriginInput] = useState('Şehir Merkezi (Valilik)');
  const [destInput, setDestInput] = useState('');

  const [stations, setStations] = useState<BusStation[]>([]);
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | null>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [warmProgress, setWarmProgress] = useState<{ done: number; total: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<TripPlan | null>(null);
  const [searched, setSearched] = useState(false);

  const mapRef = useRef<LeafletMapRef>(null);

  useEffect(() => {
    // Tüm durakları al
    ApiService.getBusStationsWithCache()
      .then((res) => {
        setStations(res.data.filter((s) => s.lat && s.lng));
      })
      .catch(() => {});

    // Hat ağını (hat başına 7 gün önbellek) arka planda ısıt; ilk kurulumda ~45 hat indirilir
    let alive = true;
    TripPlannerService.warmUp((done, total) => {
      if (alive) setWarmProgress(done < total ? { done, total } : null);
    }).finally(() => alive && setWarmProgress(null));

    // Kullanıcı mevcut konumunu almaya çalış
    handleGetCurrentLocation(false);
    return () => {
      alive = false;
    };
  }, []);

  const handleGetCurrentLocation = async (showAlert = true) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (showAlert) Alert.alert('Konum İzni', 'Mevcut konumunuzu kullanmak için konum izni gereklidir.');
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const myLoc: TripLocation = {
        name: 'Mevcut Konumum',
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };
      setOrigin(myLoc);
      setOriginInput('Mevcut Konumum');
    } catch {
      if (showAlert) Alert.alert('Hata', 'Mevcut konum alınamadı.');
    } finally {
      setLocating(false);
    }
  };

  const handleSwap = () => {
    if (!destination) return;
    const oldOrigin = origin;
    const oldDest = destination;
    setOrigin(oldDest);
    setDestination(oldOrigin);
    setOriginInput(oldDest.name);
    setDestInput(oldOrigin.name);
    setPlans([]);
    setSelectedPlan(null);
    setSearched(false);
  };

  const handleSearchPlans = async () => {
    if (!origin || !destination) {
      Alert.alert('Eksik Bilgi', 'Lütfen başlangıç ve varış noktasını seçin.');
      return;
    }

    setActiveInput(null);
    setLoading(true);
    setSearched(true);
    try {
      const result = await TripPlannerService.planTrip(origin, destination, setProgress);
      setPlans(result);
      if (result.length > 0) {
        setSelectedPlan(result[0]);
      } else {
        setSelectedPlan(null);
      }
    } catch (e) {
      console.log('Rota hesaplama hatası:', e);
      Alert.alert('Hata', 'Rota hesaplanırken bir sorun oluştu.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  // Autocomplete önerileri
  const currentQuery = activeInput === 'origin' ? originInput : destInput;
  const filteredSuggestions = currentQuery.trim().length > 0
    ? [
        ...POPULAR_DESTINATIONS.filter((d) =>
          d.name.toLowerCase().includes(currentQuery.toLowerCase())
        ),
        ...stations
          .filter((s) => s.name.toLowerCase().includes(currentQuery.toLowerCase()))
          .map((s) => ({ name: s.name, lat: s.lat!, lng: s.lng! })),
      ].slice(0, 7)
    : activeInput === 'dest'
    ? POPULAR_DESTINATIONS.slice(0, 6)
    : [];

  const handleSelectSuggestion = (item: TripLocation) => {
    if (activeInput === 'origin') {
      setOrigin(item);
      setOriginInput(item.name);
    } else {
      setDestination(item);
      setDestInput(item.name);
    }
    setActiveInput(null);
  };

  // Harita verisi hazırlığı
  const mapMarkers: LeafletMarkerItem[] = [];
  if (origin) {
    mapMarkers.push({
      id: 'origin',
      name: `Başlangıç: ${origin.name}`,
      lat: origin.lat,
      lng: origin.lng,
      type: 'custom',
    });
  }
  if (destination) {
    mapMarkers.push({
      id: 'destination',
      name: `Hedef: ${destination.name}`,
      lat: destination.lat,
      lng: destination.lng,
      type: 'custom',
    });
  }

  // Seçili rotanın ara duraklarını haritaya ekle
  if (selectedPlan) {
    selectedPlan.legs.forEach((leg, idx) => {
      if (leg.type === 'bus' && leg.coordinates && leg.coordinates.length > 0) {
        const first = leg.coordinates[0];
        const last = leg.coordinates[leg.coordinates.length - 1];
        if (leg.fromStationName) {
          mapMarkers.push({
            id: `leg_start_${idx}`,
            name: `${leg.fromStationName} (${leg.lineNo || 'Otobüs'})`,
            lat: first.latitude,
            lng: first.longitude,
            type: 'station',
          });
        }
        if (leg.toStationName) {
          mapMarkers.push({
            id: `leg_end_${idx}`,
            name: `${leg.toStationName} (İniş Durağı)`,
            lat: last.latitude,
            lng: last.longitude,
            type: 'station',
          });
        }
      }
    });
  }

  // Harita bileşeni HTML'i bir kez kurar; işaretçi ve çizgi güncellemeleri ref üzerinden gider
  // (harita hazır değilse bileşen bekletip mapReady'de uygular)
  const markersKey = mapMarkers.map((m) => `${m.id}:${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    mapRef.current?.updateMarkers(mapMarkers, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  useEffect(() => {
    const coords = selectedPlan ? selectedPlan.legs.flatMap((l) => l.coordinates || []) : [];
    mapRef.current?.updateRoutePolyline(coords);
  }, [selectedPlan]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={C.background} />
      <ScreenHeader
        title="Nasıl Giderim?"
        subtitle="Toplu taşıma ve yürüyüş rotası planlayıcı"
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Giriş Formu */}
        <Card style={styles.formCard}>
          <View style={styles.inputContainer}>
            {/* Sol gösterge çizgisi */}
            <View style={styles.lineIndicator}>
              <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
              <View style={styles.dashedLine} />
              <View style={[styles.dot, { backgroundColor: C.danger }]} />
            </View>

            {/* Giriş Alanları */}
            <View style={{ flex: 1, gap: 10 }}>
              {/* Başlangıç */}
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Başlangıç noktası veya durak"
                  placeholderTextColor={C.textMuted}
                  value={originInput}
                  onChangeText={(t) => {
                    setOriginInput(t);
                    setActiveInput('origin');
                  }}
                  onFocus={() => setActiveInput('origin')}
                />
                <TouchableOpacity
                  onPress={() => handleGetCurrentLocation(true)}
                  style={styles.locateBtn}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Ionicons name="navigate" size={17} color={C.primary} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Varış */}
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nereye gitmek istiyorsunuz?"
                  placeholderTextColor={C.textMuted}
                  value={destInput}
                  onChangeText={(t) => {
                    setDestInput(t);
                    setActiveInput('dest');
                  }}
                  onFocus={() => setActiveInput('dest')}
                />
                {destInput.length > 0 && (
                  <TouchableOpacity onPress={() => { setDestInput(''); setDestination(null); }}>
                    <Ionicons name="close-circle" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Yer Değiştirme Butonu */}
            <TouchableOpacity style={styles.swapBtn} onPress={handleSwap}>
              <Ionicons name="swap-vertical" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>

          {/* Autocomplete Listesi */}
          {activeInput && filteredSuggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              <Text style={styles.suggestionsTitle}>
                {activeInput === 'origin' ? 'Başlangıç Önerileri' : 'Popüler Varış Noktaları'}
              </Text>
              {filteredSuggestions.map((item, idx) => (
                <TouchableOpacity
                  key={`${item.name}-${idx}`}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Ionicons name="location-outline" size={16} color={C.primary} />
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Hızlı Seçim Rozetleri */}
          {!activeInput && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChipsRow}>
              {POPULAR_DESTINATIONS.slice(0, 5).map((pop, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.chip}
                  onPress={() => {
                    setDestination(pop);
                    setDestInput(pop.name);
                  }}
                >
                  <Text style={styles.chipText}>{pop.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Rota Bul Butonu */}
          <TouchableOpacity
            style={[styles.planBtn, (!destination || loading) && styles.planBtnDisabled]}
            onPress={handleSearchPlans}
            disabled={!destination || loading}
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                {progress.length > 0 && <Text style={styles.planBtnText}>{progress}</Text>}
              </>
            ) : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.planBtnText}>Rota Bul</Text>
              </>
            )}
          </TouchableOpacity>
          {warmProgress && !loading && (
            <Text style={styles.warmText}>
              Hat güzergahları hazırlanıyor ({warmProgress.done}/{warmProgress.total}) — ilk kullanımda bir kez indirilir
            </Text>
          )}
        </Card>

        {/* Harita Önizleme */}
        {(selectedPlan || destination) && (
          <Card padded={false} style={styles.mapCard}>
            <LeafletMap
              ref={mapRef}
              style={styles.map}
              markers={mapMarkers}
              center={{ lat: origin.lat, lng: origin.lng }}
              zoom={14}
              enableClustering={false}
              title="Rota Haritası"
            />
          </Card>
        )}

        {/* Rota Sonuçları */}
        {searched && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsHeader}>
              {plans.length > 0 ? `Bulunan Rotalar (${plans.length})` : 'Uygun Rota Bulunamadı'}
            </Text>

            {plans.map((p) => {
              const isSelected = selectedPlan?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planCard, isSelected && styles.planCardSelected]}
                  onPress={() => setSelectedPlan(p)}
                  activeOpacity={0.9}
                >
                  <View style={styles.planTopRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={styles.planTitle}>{p.title}</Text>
                      {p.recommended && (
                        <Pill label="Önerilen" color={Theme.colors.success} bg={Theme.colors.successBg} />
                      )}
                    </View>
                    <View style={styles.durationBadge}>
                      <Ionicons name="time" size={14} color="#b45309" />
                      <Text style={styles.durationText}>{p.totalDurationMinutes} dk</Text>
                    </View>
                  </View>

                  <Text style={styles.planSummary}>{p.summary}</Text>

                  {/* Adımlar Önizlemesi */}
                  <View style={styles.legsRow}>
                    {p.legs.map((leg, lIdx) => (
                      <React.Fragment key={lIdx}>
                        {lIdx > 0 && (
                          <Ionicons name="chevron-forward" size={12} color={C.textMuted} />
                        )}
                        <View style={styles.legBadge}>
                          <Ionicons
                            name={leg.type === 'walk' ? 'walk-outline' : 'bus'}
                            size={13}
                            color={leg.type === 'walk' ? C.textSecondary : C.primary}
                          />
                          <Text style={styles.legBadgeText}>
                            {leg.type === 'walk' ? `${leg.durationMinutes} dk` : (leg.lineNo || 'Otobüs')}
                          </Text>
                        </View>
                      </React.Fragment>
                    ))}
                    <Text style={styles.walkMetaText}>
                      Toplam {p.walkingDistanceMeters} m yürüme
                    </Text>
                  </View>

                  {/* Seçili Planın Detaylı Yol Tarifi */}
                  {isSelected && (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailTitle}>Yol Tarifi Adımları:</Text>
                      {p.legs.map((leg, stepIdx) => (
                        <View key={stepIdx} style={styles.stepRow}>
                          <View style={styles.stepIconCircle}>
                            <Ionicons
                              name={leg.type === 'walk' ? 'walk' : 'bus'}
                              size={14}
                              color="#fff"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.stepInstruction}>{leg.instruction}</Text>
                            <Text style={styles.stepSub}>
                              Yaklaşık {leg.durationMinutes} dk • {leg.distanceMeters} m
                              {leg.type === 'bus' && leg.stopCount ? ` • ${leg.stopCount} durak` : ''}
                            </Text>
                            {leg.inferred && (
                              <Text style={styles.inferredText}>
                                ElazığKart bu hattın dönüş yönü duraklarını yayınlamıyor; sıralama gidiş yönünden türetildi.
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: Theme.spacing.lg, gap: 14 },
  formCard: { gap: 12 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIndicator: { alignItems: 'center', justifyContent: 'center', width: 14, height: 74 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dashedLine: { flex: 1, width: 2, backgroundColor: C.cardBorder, marginVertical: 3 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceSubtle,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 12,
    height: 42,
  },
  textInput: { flex: 1, fontSize: 13, color: C.textPrimary },
  locateBtn: { padding: 4 },
  swapBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  suggestionsBox: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 8,
    gap: 4,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  suggestionText: {
    fontSize: 13,
    color: C.textPrimary,
    fontWeight: '500',
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: C.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    marginRight: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
  },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    marginTop: 4,
  },
  planBtnDisabled: {
    opacity: 0.5,
  },
  planBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  mapCard: {
    height: SCREEN_HEIGHT * 0.28,
    overflow: 'hidden',
    borderRadius: Theme.radius.lg,
  },
  map: {
    flex: 1,
  },
  resultsContainer: {
    gap: 10,
  },
  resultsHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: C.textPrimary,
  },
  planCard: {
    backgroundColor: C.surface,
    borderRadius: Theme.radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.cardBorder,
    gap: 8,
    ...Theme.shadows.sm,
  },
  planCardSelected: {
    borderColor: C.primary,
    backgroundColor: Theme.colors.surfaceVariant,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.textPrimary,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.prayerBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
  },
  planSummary: {
    fontSize: 12,
    color: C.textSecondary,
  },
  legsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  legBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surfaceSubtle,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  legBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textPrimary,
  },
  walkMetaText: {
    fontSize: 11,
    color: C.textMuted,
    marginLeft: 'auto',
  },
  detailBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    gap: 8,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textPrimary,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepInstruction: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textPrimary,
  },
  stepSub: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 1,
  },
  inferredText: {
    fontSize: 10,
    color: '#b45309',
    marginTop: 3,
    lineHeight: 14,
  },
  warmText: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
}));
