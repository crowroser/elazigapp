import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import { ApiService, FillingCenter } from '../services/apiService';
import { LeafletMap, LeafletMapRef, LeafletMarkerItem } from '../components/LeafletMap';
import { ScreenHeader, Chip } from '../components/ui';

const C = Theme.colors;
const ELAZIG_CENTER = { lat: 38.6748, lng: 39.2225 };

type FilterType = 'ALL' | 'KIOSK' | 'BAYI';

interface CenterWithDistance extends FillingCenter {
  distance?: number | null;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatKm(km: number | null | undefined): string {
  if (km == null || isNaN(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function FillingCentersScreen() {
  useAppTheme();
  const router = useRouter();
  const mapRef = useRef<LeafletMapRef>(null);
  const flatListRef = useRef<FlatList<CenterWithDistance>>(null);

  const [centers, setCenters] = useState<FillingCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Load centers and location
  const loadData = useCallback(async () => {
    try {
      const [list, loc] = await Promise.all([
        ApiService.getFillingCenters(),
        (async () => {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              setHasLocationPermission(false);
              return null;
            }
            setHasLocationPermission(true);
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            return { lat: pos.coords.latitude, lng: pos.coords.longitude };
          } catch {
            return null;
          }
        })(),
      ]);

      setCenters(list);
      if (loc) {
        setUserLocation(loc);
        mapRef.current?.updateUserLocation(loc);
      }
    } catch (e) {
      console.log('Dolum noktaları yükleme hatası:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Request / refresh location
  const handleLocationPress = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setHasLocationPermission(false);
        return;
      }
      setHasLocationPermission(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
      mapRef.current?.updateUserLocation(loc);
      mapRef.current?.panToLocation(loc.lat, loc.lng, 15);
    } catch (e) {
      console.log('Konum yenileme hatası:', e);
    }
  };

  // Compute list with distances and filter
  const processedCenters: CenterWithDistance[] = useMemo(() => {
    const list: CenterWithDistance[] = centers.map((c) => ({
      ...c,
      distance: userLocation ? distanceKm(userLocation.lat, userLocation.lng, c.lat, c.lng) : null,
    }));

    if (userLocation) {
      list.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    return list;
  }, [centers, userLocation]);

  // Counts for chips
  const totalCount = centers.length;
  const kioskCount = useMemo(() => centers.filter((c) => c.tip === 'K').length, [centers]);
  const bayiCount = useMemo(() => centers.filter((c) => c.tip !== 'K').length, [centers]);

  // Filtered by chips and search
  const filteredCenters = useMemo(() => {
    return processedCenters.filter((c) => {
      // Filter chip
      if (activeFilter === 'KIOSK' && c.tip !== 'K') return false;
      if (activeFilter === 'BAYI' && c.tip === 'K') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.name.toLowerCase().includes(q);
        const addrMatch = (c.address || '').toLowerCase().includes(q);
        return nameMatch || addrMatch;
      }

      return true;
    });
  }, [processedCenters, activeFilter, searchQuery]);

  // Markers for Leaflet map
  const mapMarkers: LeafletMarkerItem[] = useMemo(() => {
    return filteredCenters.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      type: c.tip === 'K' ? 'kiosk' : 'bayi',
      tipLabel: c.tipLabel,
      address: c.address,
      phone: c.phone,
      distanceText: c.distance != null ? formatKm(c.distance) : undefined,
    }));
  }, [filteredCenters]);

  // Update map markers when filter/search changes
  useEffect(() => {
    // Boş sonuçta da çağrılır ki filtre "0 nokta" derken haritada eski işaretçiler kalmasın
    mapRef.current?.updateMarkers(mapMarkers, selectedId);
  }, [mapMarkers, selectedId]);

  // Select a center (from list or map)
  const handleSelectCenter = useCallback(
    (item: CenterWithDistance, fromMap = false) => {
      setSelectedId(item.id);

      // Pan map to center and open popup
      mapRef.current?.panToLocation(item.lat, item.lng, 16);
      mapRef.current?.selectMarker(item.id);

      // If clicked on map, scroll list to item
      if (fromMap) {
        const index = filteredCenters.findIndex((c) => c.id === item.id);
        if (index >= 0) {
          flatListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.2,
          });
        }
      }
    },
    [filteredCenters]
  );

  // Open Google Maps directions
  const handleDirections = useCallback((c: CenterWithDistance) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
    Linking.openURL(url);
  }, []);

  const renderCenterCard = ({ item }: { item: CenterWithDistance }) => {
    const isSelected = selectedId === item.id;
    const isKiosk = item.tip === 'K';

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        activeOpacity={0.85}
        onPress={() => handleSelectCenter(item, false)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, isKiosk ? styles.typeBadgeKiosk : styles.typeBadgeBayi]}>
            <MaterialCommunityIcons
              name={isKiosk ? 'credit-card-fast-outline' : 'store-outline'}
              size={14}
              color={isKiosk ? '#0369a1' : '#7e22ce'}
            />
            <Text style={[styles.typeBadgeText, isKiosk ? styles.typeBadgeTextKiosk : styles.typeBadgeTextBayi]}>
              {item.tipLabel} {isKiosk ? '(7/24)' : ''}
            </Text>
          </View>

          {item.distance != null ? (
            <View style={styles.distanceBadge}>
              <Ionicons name="navigate" size={12} color={C.primary} />
              <Text style={styles.distanceText}>{formatKm(item.distance)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>

        {item.address ? (
          <View style={styles.cardMetaRow}>
            <Ionicons name="location-outline" size={13} color={C.textMuted} style={{ marginTop: 1 }} />
            <Text style={styles.cardAddress} numberOfLines={2}>
              {item.address}
            </Text>
          </View>
        ) : null}

        {item.phone ? (
          <TouchableOpacity
            style={styles.cardMetaRow}
            onPress={() => Linking.openURL(`tel:${item.phone}`)}
            hitSlop={6}
          >
            <Ionicons name="call-outline" size={13} color={C.primary} />
            <Text style={styles.cardPhone}>{item.phone}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtnMap}
            onPress={() => handleSelectCenter(item, false)}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={14} color={C.primary} />
            <Text style={styles.actionBtnMapText}>Haritada Gör</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnDirections}
            onPress={() => handleDirections(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={14} color="#ffffff" />
            <Text style={styles.actionBtnDirectionsText}>Yol Tarifi</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <ScreenHeader
        title="Kart Dolum Noktaları"
        subtitle={
          userLocation
            ? 'En yakın noktadan uzağa sıralı'
            : '42 Nokta • Bayiler ve 7/24 Kiosklar'
        }
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            style={[styles.headerIconBtn, userLocation && styles.headerIconBtnActive]}
            onPress={handleLocationPress}
            hitSlop={8}
            accessibilityLabel="Mevcut konuma odaklan"
          >
            <Ionicons
              name={userLocation ? 'locate' : 'locate-outline'}
              size={20}
              color={userLocation ? '#ffffff' : C.primary}
            />
          </TouchableOpacity>
        }
      />

      {/* Filter Chips & Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.chipsRow}>
          <Chip
            label={`Tümü (${totalCount})`}
            active={activeFilter === 'ALL'}
            onPress={() => setActiveFilter('ALL')}
            tint={C.primary}
          />
          <Chip
            label={`Kiosk (${kioskCount})`}
            active={activeFilter === 'KIOSK'}
            onPress={() => setActiveFilter('KIOSK')}
            tint="#0284c7"
            icon="credit-card-fast-outline"
          />
          <Chip
            label={`Bayi (${bayiCount})`}
            active={activeFilter === 'BAYI'}
            onPress={() => setActiveFilter('BAYI')}
            tint="#6b21a8"
            icon="store-outline"
          />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Nokta veya adres ara (örn: Hastane, Park23...)"
            placeholderTextColor={C.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Main Map Container */}
      <View style={styles.mapWrapper}>
        <LeafletMap
          ref={mapRef}
          markers={mapMarkers}
          markerType="mixed"
          center={userLocation || ELAZIG_CENTER}
          zoom={14}
          selectedId={selectedId}
          userLocation={userLocation}
          onMarkerPress={(marker) => {
            const found = centers.find((c) => String(c.id) === String(marker.id));
            if (found) handleSelectCenter(found, true);
          }}
          onDirectionsPress={(lat, lng) => {
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
          }}
          title="ElazığKart Dolum Noktaları Haritası"
        />
        {/* Subtle map overlay indicator */}
        <View style={styles.mapIndicatorBadge}>
          <Text style={styles.mapIndicatorText}>
            📍 {filteredCenters.length} Nokta Gösteriliyor
          </Text>
        </View>
      </View>

      {/* List of Filling Centers */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {activeFilter === 'ALL'
              ? 'Tüm Dolum Noktaları'
              : activeFilter === 'KIOSK'
              ? '7/24 Kart Dolum Kioskları (Otomat)'
              : 'Yetkili Satış ve Dolum Bayileri'}
          </Text>
          <Text style={styles.listSubtitle}>
            {userLocation ? 'Konumunuza göre sıralandı' : 'Alfabetik sıralı'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Dolum noktaları yükleniyor...</Text>
          </View>
        ) : filteredCenters.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="storefront-outline" size={42} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Nokta Bulunamadı</Text>
            <Text style={styles.emptySubtitle}>
              Arama kriterinize uygun dolum noktası veya bayi bulunamadı.
            </Text>
            {searchQuery ? (
              <TouchableOpacity
                style={styles.clearSearchBtn}
                onPress={() => setSearchQuery('')}
              >
                <Text style={styles.clearSearchBtnText}>Aramayı Temizle</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredCenters}
            keyExtractor={(item) => `center-${item.id}`}
            renderItem={renderCenterCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
              }, 100);
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadData();
                }}
                colors={[C.primary]}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    gap: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.textPrimary,
    paddingVertical: 0,
  },
  mapWrapper: {
    height: 250,
    width: '100%',
    position: 'relative',
    backgroundColor: Theme.colors.surfaceVariant,
  },
  mapIndicatorBadge: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    backgroundColor: 'rgba(15, 42, 74, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapIndicatorText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
    backgroundColor: C.background,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.cardBorder,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
  },
  listSubtitle: {
    fontSize: 11,
    color: C.textMuted,
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardSelected: {
    borderColor: C.primary,
    borderWidth: 2,
    backgroundColor: Theme.colors.surfaceSubtle,
    shadowColor: C.primary,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeKiosk: {
    backgroundColor: Theme.colors.secondaryBg,
  },
  typeBadgeBayi: {
    backgroundColor: Theme.colors.surfaceVariant,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  typeBadgeTextKiosk: {
    color: '#0369a1',
  },
  typeBadgeTextBayi: {
    color: '#7e22ce',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 3,
  },
  cardAddress: {
    fontSize: 12,
    color: C.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  cardPhone: {
    fontSize: 12,
    color: C.primary,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.cardBorder,
  },
  actionBtnMap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.surfaceSubtle,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    paddingVertical: 8,
  },
  actionBtnMapText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.primary,
  },
  actionBtnDirections: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 8,
  },
  actionBtnDirectionsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: C.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  clearSearchBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearSearchBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
}));
