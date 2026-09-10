import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Linking,
  Platform,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '../../constants/Theme';
import {
  ApiService,
  BusStation,
  BusRoute,
  CardBalanceResult,
  StationBusInfo,
  RealtimeBusInfo,
  RouteLineItem,
} from '../../services/apiService';
import { CardQueryModal } from '../../components/CardQueryModal';
import { AuthProfileModal } from '../../components/AuthProfileModal';
import { AuthService, UserProfile } from '../../services/authService';
import { auth } from '../../config/firebase';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const ELAZIG_CENTER = { lat: 38.6745, lng: 39.2205 };
const MAP_BOUNDS = {
  minLat: 38.62,
  maxLat: 38.73,
  minLng: 39.15,
  maxLng: 39.29,
};

const BUS_COLORS = ['#1A365D', '#3182CE', '#2D3748', '#0061a5', '#0f766e', '#7c3aed', '#b45309'];

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/i̇/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .trim();
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function projectToScreen(lat: number, lng: number): { left: `${number}%`; top: `${number}%` } {
  const x = Math.max(4, Math.min(92, ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100));
  const y = Math.max(6, Math.min(88, ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100));
  return {
    left: `${x}%` as `${number}%`,
    top: `${y}%` as `${number}%`,
  };
}

function getBusColor(hatkodu?: string, index = 0): string {
  if (!hatkodu) return BUS_COLORS[index % BUS_COLORS.length];
  let hash = 0;
  for (let i = 0; i < hatkodu.length; i++) hash = (hash + hatkodu.charCodeAt(i) * (i + 1)) % 997;
  return BUS_COLORS[hash % BUS_COLORS.length];
}

function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m mesafede`;
  return `${km.toFixed(1)} km mesafede`;
}

function buildLeafletHtml(
  stations: Array<{ id: string; name: string; code: string; lat: number; lng: number; direction: string }>,
  buses: Array<any>,
  center: { lat: number; lng: number },
  selectedId?: string | null,
  userLocation?: { lat: number; lng: number } | null
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #e5eeff; }
    .leaflet-container { background: #e5eeff; font-family: Inter, system-ui, sans-serif; }
    
    /* Clean individual station marker */
    .station-marker {
      width: 16px; height: 16px; border-radius: 50%;
      background: #002045; border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,32,69,0.35);
      position: relative;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .station-marker.selected {
      width: 22px; height: 22px; background: #0061a5;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 5px rgba(0,97,165,0.35);
      transform: scale(1.15);
    }
    .station-marker::after {
      content: ''; position: absolute; top: 50%; left: 50%;
      width: 4px; height: 4px; margin: -2px 0 0 -2px;
      background: #ffffff; border-radius: 50%;
    }
    
    /* Station Cluster styling - prevents 1300 dots visual explosion */
    .station-cluster {
      background-color: rgba(0, 32, 69, 0.22);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px;
    }
    .station-cluster div {
      width: 28px; height: 28px; border-radius: 50%;
      background: #002045; color: #ffffff;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800; border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,32,69,0.3);
    }
    .station-cluster.cluster-large div {
      background: #0061a5;
    }

    .bus-marker {
      color: #fff; border-radius: 999px;
      width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
      border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      font-size: 16px; font-weight: 800;
      transition: all 0.3s ease;
    }
    .bus-label {
      background: #fff; border: 1px solid #c4c6cf; border-radius: 6px;
      padding: 2px 6px; font-size: 10px; font-weight: 700; color: #002045;
      margin-top: 2px; white-space: nowrap; text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
    }
    .user-pulse {
      width: 22px; height: 22px; border-radius: 50%;
      background: #0061a5; border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(0, 97, 165, 0.4);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(0, 97, 165, 0.7); }
      70% { box-shadow: 0 0 0 12px rgba(0, 97, 165, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 97, 165, 0); }
    }
    .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 4px 16px rgba(26,54,93,0.2); }
    .popup-title { font-weight: 700; color: #002045; font-size: 13px; margin-bottom: 2px; }
    .popup-code { font-size: 11px; background: #d2e4ff; color: #0061a5; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${center.lat}, ${center.lng}], 14);

    var streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'OpenStreetMap'
    }).addTo(map);

    var satMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri World Imagery'
    });

    L.control.layers({
      "Harita": streetMap,
      "Uydu": satMap
    }, null, { position: 'topright' }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    var polylineLayer = L.layerGroup().addTo(map);
    var busLayerGroup = L.layerGroup().addTo(map);

    var userMarker = null;
    window.updateUserLocation = function(uLoc) {
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
      if (uLoc && uLoc.lat && uLoc.lng) {
        var uIcon = L.divIcon({
          className: '',
          html: '<div class="user-pulse"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        userMarker = L.marker([uLoc.lat, uLoc.lng], { icon: uIcon, zIndexOffset: 1000 }).addTo(map)
          .bindPopup("<div class='popup-title'>Mevcut Konumunuz</div>");
      }
    };

    var userLoc = ${JSON.stringify(userLocation || null)};
    if (userLoc) window.updateUserLocation(userLoc);

    // MarkerCluster Setup for 1300+ Stations
    var stationCluster;
    if (typeof L.markerClusterGroup === 'function') {
      stationCluster = L.markerClusterGroup({
        maxClusterRadius: 40,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
          var count = cluster.getChildCount();
          var cls = count > 20 ? ' cluster-large' : '';
          return L.divIcon({
            html: '<div class="station-cluster' + cls + '"><div>' + count + '</div></div>',
            className: '',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
          });
        }
      });
    } else {
      stationCluster = L.layerGroup();
    }

    var stations = ${JSON.stringify(stations)};
    var selectedId = ${JSON.stringify(selectedId || null)};
    stations.forEach(function(s) {
      var isSelected = (selectedId && String(selectedId) === String(s.id));
      var icon = L.divIcon({
        className: '',
        html: '<div class="station-marker' + (isSelected ? ' selected' : '') + '"></div>',
        iconSize: isSelected ? [22, 22] : [16, 16],
        iconAnchor: isSelected ? [11, 11] : [8, 8]
      });
      var marker = L.marker([s.lat, s.lng], { icon: icon, zIndexOffset: isSelected ? 500 : 100 });
      marker.bindPopup(
        "<div class='popup-title'>" + s.name + "</div>" +
        "<div class='popup-code'>" + s.code + "</div>" +
        "<div style='font-size:11px;color:#64748b;margin-top:4px'>" + (s.direction || '') + "</div>"
      );
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'station', id: s.id }));
        } else if (window.parent) {
          window.parent.postMessage(JSON.stringify({ type: 'station', id: s.id }), '*');
        }
      });
      stationCluster.addLayer(marker);
    });
    map.addLayer(stationCluster);

    window.updateRoutePolyline = function(coords) {
      polylineLayer.clearLayers();
      if (!Array.isArray(coords) || coords.length === 0) return;
      // Gidiş (F) ve Dönüş (B) güzergahlarını ayrı çizgiler olarak çiz
      var groups = { F: [], B: [] };
      coords.forEach(function(c) {
        if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return;
        var key = c.routeDirection === 'B' ? 'B' : 'F';
        groups[key].push([c.latitude, c.longitude]);
      });
      var bounds = null;
      ['F', 'B'].forEach(function(key) {
        if (groups[key].length < 2) return;
        var poly = L.polyline(groups[key], {
          color: key === 'B' ? '#c2410c' : '#0061a5',
          weight: 5,
          opacity: key === 'B' ? 0.7 : 0.85,
          lineJoin: 'round',
          dashArray: key === 'B' ? '8 6' : null
        }).addTo(polylineLayer);
        bounds = bounds ? bounds.extend(poly.getBounds()) : poly.getBounds();
      });
      try {
        if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
      } catch (e) {}
    };

    window.updateBuses = function(busesList) {
      busLayerGroup.clearLayers();
      if (!Array.isArray(busesList)) return;
      busesList.forEach(function(b) {
        if (!b.enlem || !b.boylam) return;
        var label = b.hatkodu || '';
        var busColor = '#10b981';
        var c = (b.renk || '').toUpperCase();
        if (c === 'FFFF00') busColor = '#f59e0b';
        else if (c === 'FF0000') busColor = '#ef4444';
        else if (c === '00FF00') busColor = '#10b981';

        var rot = b.yon ? Number(b.yon) : 0;
        var icon = L.divIcon({
          className: '',
          html: '<div style="display:flex;flex-direction:column;align-items:center">' +
                '<div class="bus-marker" style="background:' + busColor + ';transform:rotate(' + rot + 'deg)">🚌</div>' +
                '<div class="bus-label">Hat ' + label + (b.plaka ? ' · ' + b.plaka : '') + '</div></div>',
          iconSize: [60, 56],
          iconAnchor: [30, 28]
        });
        var marker = L.marker([b.enlem, b.boylam], { icon: icon, zIndexOffset: 300 }).addTo(busLayerGroup);
        var popupContent = "<div class='popup-title' style='font-size:14px;color:#002045;font-weight:700;'>🚌 Hat " + label + "</div>" +
          "<div style='font-size:12px;font-weight:600;color:#1e293b;margin-top:2px;'>" + (b.plaka || 'Belediye Otobüsü') + "</div>" +
          (b.surucu ? "<div style='font-size:11px;color:#475569;margin-top:2px;'>👤 " + b.surucu + "</div>" : "") +
          "<div style='display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;'>" +
            "<span style='background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;'>⚡ " + (b.hiz != null ? b.hiz : 0) + " km/s</span>" +
            (b.istikamet ? "<span style='background:#f1f5f9;color:#334155;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;'>🧭 " + b.istikamet + "</span>" : "") +
            (b.seferYolcu != null ? "<span style='background:#fef3c7;color:#92400e;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;'>👥 " + b.seferYolcu + " Yolcu</span>" : "") +
          "</div>" +
          "<div style='display:flex;gap:6px;margin-top:4px;'>" +
            (b.klimaVarMi ? "<span style='font-size:10px;color:#059669;font-weight:600;'>❄️ Klimalı</span>" : "") +
            (b.engelliUygunMu ? "<span style='font-size:10px;color:#0284c7;font-weight:600;'>♿ Engelli Uygun</span>" : "") +
          "</div>";
        marker.bindPopup(popupContent);
      });
    };

    window.panToLocation = function(lat, lng, zoomLevel) {
      if (lat && lng) {
        map.setView([lat, lng], zoomLevel || 15, { animate: true, duration: 0.8 });
      }
    };

    window.updateBuses(${JSON.stringify(buses)});

    // Boş alana dokunma → RN tarafı panelleri kapatıp tüm şehrin canlı otobüslerini gösterir
    map.on('click', function() {
      var msg = JSON.stringify({ type: 'mapTap' });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      else if (window.parent) window.parent.postMessage(msg, '*');
    });

    // Handshake: Notify React Native that Leaflet map is fully loaded and ready
    function postMapReady() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
      } else if (window.parent) {
        window.parent.postMessage(JSON.stringify({ type: 'mapReady' }), '*');
      }
    }
    map.whenReady(function() {
      setTimeout(postMapReady, 100);
    });
    setTimeout(postMapReady, 400);
  </script>
</body>
</html>`;
}

export default function TransitScreen() {
  const [stations, setStations] = useState<BusStation[]>([]);
  const [allRoutes, setAllRoutes] = useState<RouteLineItem[]>([]);
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [liveBuses, setLiveBuses] = useState<RealtimeBusInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<BusStation | null>(null);
  const [stationBuses, setStationBuses] = useState<StationBusInfo[]>([]);
  const [stationLoading, setStationLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState(ELAZIG_CENTER);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'stations' | 'routes'>('all');
  const [showRoutesPanel, setShowRoutesPanel] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cardInfo, setCardInfo] = useState<CardBalanceResult>({ success: false });
  const [refreshingBuses, setRefreshingBuses] = useState(false);
  // Şehir geneli canlı mod: haritada boş yere dokununca tüm otobüsler
  const [cityLive, setCityLive] = useState(false);
  const cityLiveRef = useRef(false);

  const enterCityLive = useCallback(async () => {
    cityLiveRef.current = true;
    setCityLive(true);
    setSheetExpanded(false);
    setShowRoutesPanel(false);
    setShowSearch(false);
    setSelectedRoute(null);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if (window.updateRoutePolyline) { window.updateRoutePolyline([]); } true;`);
    }
    const all = await ApiService.getAllLiveVehicles();
    if (cityLiveRef.current) setLiveBuses(all);
  }, []);

  const exitCityLive = useCallback(() => {
    cityLiveRef.current = false;
    setCityLive(false);
  }, []);

  // Canlı modda 5 sn'de bir tüm araçları yenile
  useEffect(() => {
    if (!cityLive) return;
    const t = setInterval(async () => {
      const all = await ApiService.getAllLiveVehicles();
      if (cityLiveRef.current) setLiveBuses(all);
    }, 5000);
    return () => clearInterval(t);
  }, [cityLive]);

  const sheetAnim = useRef(new Animated.Value(1)).current;
  const iframeRef = useRef<any>(null);
  const webViewRef = useRef<WebView>(null);
  const isMapReadyRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const didAutoSelectRef = useRef(false);
  const didLocateSelectRef = useRef(false);

  const recordStopSearch = (stopName: string) => {
    AuthService.addRecentBusStop(auth.currentUser?.uid || null, stopName);
  };

  const recordRouteSearch = (routeName: string) => {
    AuthService.addRecentBusRoute(auth.currentUser?.uid || null, routeName);
  };

  const syncUserLocationToMap = useCallback((coords: { lat: number; lng: number }, pan = true) => {
    if (webViewRef.current && isMapReadyRef.current) {
      webViewRef.current.injectJavaScript(
        `if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(coords)}); }
         ${pan ? `if (window.panToLocation) { window.panToLocation(${coords.lat}, ${coords.lng}, 15); }` : ''}
         true;`
      );
    }
  }, []);

  const loadLiveBuses = useCallback(async (targetRouteCode?: string) => {
    if (cityLiveRef.current) return;
    setRefreshingBuses(true);
    try {
      let code = targetRouteCode || selectedRoute?.routeCode || (stationBuses.length > 0 ? stationBuses[0].busLineCode : '') || (allRoutes.length > 0 ? allRoutes[0].kod : '');
      if (code) {
        const buses = await ApiService.getRealtimeBusData(code);
        const filtered = buses.filter((b) => b.enlem && b.boylam);
        setLiveBuses(filtered);
      }
    } catch (e) {
      console.log('Canlı otobüs yükleme hatası:', e);
    }
    setRefreshingBuses(false);
  }, [selectedRoute, stationBuses, allRoutes]);

  const loadStationDetail = useCallback(async (station: BusStation, isBackgroundUpdate = false, panMap = true) => {
    if (isBackgroundUpdate && cityLiveRef.current) return;
    if (!isBackgroundUpdate) exitCityLive();
    setSelectedStation(station);
    if (panMap) {
      setSheetExpanded(true);
    }
    setShowRoutesPanel(false);
    if (!isBackgroundUpdate) {
      setStationLoading(true);
    }
    recordStopSearch(station.name);

    if (!isBackgroundUpdate && panMap && station.lat && station.lng) {
      setMapCenter({ lat: station.lat, lng: station.lng });
      if (webViewRef.current && isMapReadyRef.current) {
        webViewRef.current.injectJavaScript(
          `if (window.panToLocation) { window.panToLocation(${station.lat}, ${station.lng}, 16); } true;`
        );
      }
    }

    try {
      const [buses, stationRoutes] = await Promise.all([
        ApiService.getStationRemainingTime(station.id),
        // Duraktan geçen hatlar (ilk açılışta; arka plan yenilemede tekrar çekmeye gerek yok)
        isBackgroundUpdate || station.lines.length > 0
          ? Promise.resolve<RouteLineItem[]>([])
          : ApiService.getStationRoutes(station.id),
      ]);
      setStationBuses(buses);

      if (stationRoutes.length > 0) {
        const lines = stationRoutes.map((r) => `${r.hatNo} ${r.kod}`.trim());
        setSelectedStation((prev) => (prev && prev.id === station.id ? { ...prev, lines } : prev));
        setStations((prev) => prev.map((s) => (s.id === station.id ? { ...s, lines } : s)));
      }

      if (buses.length > 0 && buses[0].busLineCode) {
        const live = await ApiService.getRealtimeBusData(buses[0].busLineCode);
        setLiveBuses(live.filter((b) => b.enlem && b.boylam));
      }
    } catch (e) {
      console.log('Durak detay yükleme hatası:', e);
    }
    setStationLoading(false);
  }, []);

  const loadRouteDetail = useCallback(async (routeCodeOrHatNo: string, routeName?: string) => {
    exitCityLive();
    setRefreshingBuses(true);
    setShowRoutesPanel(true);
    setShowSearch(false);

    // Hat kodunu çöz (kullanıcı hat no veya kod vermiş olabilir)
    const qNorm = normalizeText(routeCodeOrHatNo);
    const matched = allRoutes.find(
      (r) => String(r.hatNo) === routeCodeOrHatNo || normalizeText(r.kod) === qNorm
    );
    const targetKod = matched ? matched.kod : routeCodeOrHatNo;
    const displayName = routeName || (matched ? `Hat ${matched.hatNo} - ${matched.aciklama}` : `Hat ${routeCodeOrHatNo}`);
    recordRouteSearch(displayName);

    // 1. Canlı otobüsleri seçili hat bazlı belediye API'sinden çek
    try {
      const liveRouteBuses = await ApiService.getRealtimeBusData(targetKod);
      const filtered = liveRouteBuses.filter((b) => b.enlem && b.boylam);
      setLiveBuses(filtered);

      if (filtered.length > 0 && filtered[0].enlem && filtered[0].boylam) {
        setMapCenter({ lat: filtered[0].enlem, lng: filtered[0].boylam });
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `if (window.panToLocation) { window.panToLocation(${filtered[0].enlem}, ${filtered[0].boylam}); } true;`
          );
        }
      }
    } catch (e) {
      console.log('Hat canlı otobüs yükleme hatası:', e);
    }
    setRefreshingBuses(false);

    // 2. Hat detaylarını (duraklar, sefer saatleri, fiyat ve polyline koordinatları) çek
    try {
      let existingRoute = routes.find((r) => r.routeCode === targetKod || r.lineNo === targetKod);
      if (!existingRoute || !existingRoute.mainStops || existingRoute.mainStops.length === 0) {
        const fetched = await ApiService.getBusRoutes(targetKod);
        if (fetched && fetched.length > 0) {
          existingRoute = fetched[0];
          existingRoute.routeName = displayName;
          setRoutes((prev) => [fetched[0], ...prev.filter((p) => p.routeCode !== targetKod && p.lineNo !== targetKod)]);
        }
      }

      if (existingRoute) {
        setSelectedRoute(existingRoute);

        // Harita üzerine polyline çiz
        if (webViewRef.current && existingRoute.routeCoordinates && existingRoute.routeCoordinates.length > 0) {
          const js = `if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(existingRoute.routeCoordinates)}); } true;`;
          webViewRef.current.injectJavaScript(js);
        }
      } else {
        setSelectedRoute({
          lineNo: targetKod,
          routeCode: targetKod,
          routeName: displayName,
          departureTimes: [],
          mainStops: [],
        });
      }
    } catch (e) {
      console.log('Hat rota bilgisi alma hatası:', e);
    }
  }, [allRoutes, routes]);

  // Selected station live tracking polling (seamless background updates every 8 seconds)
  useEffect(() => {
    if (!selectedStation) return;
    const interval = setInterval(() => {
      loadStationDetail(selectedStation, true);
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedStation, loadStationDetail]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUserLocation(coords);
          userLocationRef.current = coords;
          if (
            coords.lat > MAP_BOUNDS.minLat &&
            coords.lat < MAP_BOUNDS.maxLat &&
            coords.lng > MAP_BOUNDS.minLng &&
            coords.lng < MAP_BOUNDS.maxLng
          ) {
            setMapCenter(coords);
          }
          if (isMapReadyRef.current) {
            syncUserLocationToMap(coords, true);
          }
        }
      } catch (e) {
        console.log('Konum izni alınamadı:', e);
      }
    })();
  }, [syncUserLocationToMap]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [stList, officialRoutes] = await Promise.all([
        ApiService.getBusStations(),
        ApiService.getAllRoutes(),
      ]);
      setStations(stList);
      setAllRoutes(officialRoutes);

      if (stList.length > 0 && !didAutoSelectRef.current) {
        didAutoSelectRef.current = true;
        const uLoc = userLocationRef.current;
        if (uLoc) {
          const withCoords = stList.filter((s) => s.lat && s.lng);
          if (withCoords.length > 0) {
            let nearest = withCoords[0];
            let minDist = Infinity;
            for (const s of withCoords) {
              const d = haversineDistance(uLoc.lat, uLoc.lng, s.lat!, s.lng!);
              if (d < minDist) {
                minDist = d;
                nearest = s;
              }
            }
            didLocateSelectRef.current = true;
            await loadStationDetail(nearest, false, false);
          }
        } else {
          const withCoords = stList.find((s) => s.lat && s.lng) || stList[0];
          await loadStationDetail(withCoords, false, false);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [loadStationDetail]);

  // Konum gelince bir kez en yakın durağa geç (haritayı kullanıcı konumundan uzaklaştırmadan)
  useEffect(() => {
    if (!userLocation || stations.length === 0 || didLocateSelectRef.current) return;
    const withCoords = stations.filter((s) => s.lat && s.lng);
    if (withCoords.length === 0) return;

    let nearest = withCoords[0];
    let minDist = Infinity;
    for (const s of withCoords) {
      const d = haversineDistance(userLocation.lat, userLocation.lng, s.lat!, s.lng!);
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    }
    didLocateSelectRef.current = true;
    loadStationDetail(nearest, false, false);
  }, [userLocation, stations, loadStationDetail]);

  // Canlı otobüs konumlarını periyodik yenile
  useEffect(() => {
    const interval = setInterval(loadLiveBuses, 20000);
    return () => clearInterval(interval);
  }, [loadLiveBuses]);

  // Web: iframe postMessage dinle
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'mapReady') {
          isMapReadyRef.current = true;
          if (userLocationRef.current) {
            syncUserLocationToMap(userLocationRef.current, true);
          }
        } else if (data?.type === 'mapTap') {
          enterCityLive();
        } else if (data?.type === 'station' && data.id) {
          const st = stations.find((s) => String(s.id) === String(data.id));
          if (st) loadStationDetail(st);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [stations, loadStationDetail, syncUserLocationToMap, enterCityLive]);

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: sheetExpanded ? 0 : 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [sheetExpanded, sheetAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 40) setSheetExpanded(false);
        else if (g.dy < -40) setSheetExpanded(true);
      },
    })
  ).current;

  const sortedStations = useMemo(() => {
    let list = [...stations];
    if (userLocation) {
      list = list
        .map((s) => ({
          ...s,
          _distance:
            s.lat && s.lng
              ? haversineDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
              : 999,
        }))
        .sort((a, b) => (a as any)._distance - (b as any)._distance);
    }
    return list;
  }, [stations, userLocation]);

  const normQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const matchingRoutes = useMemo(() => {
    if (!normQuery) return allRoutes.slice(0, 15);
    return allRoutes.filter((rt) => {
      const matchHatNo = normalizeText(String(rt.hatNo)).includes(normQuery) ||
                        normalizeText(`hat ${rt.hatNo}`).includes(normQuery);
      const matchKod = normalizeText(rt.kod).includes(normQuery);
      const matchAciklama = normalizeText(rt.aciklama).includes(normQuery);
      return matchHatNo || matchKod || matchAciklama;
    });
  }, [allRoutes, normQuery]);

  const matchingStations = useMemo(() => {
    if (!normQuery) return sortedStations.slice(0, 20);
    return sortedStations.filter((st) => {
      const matchName = normalizeText(st.name).includes(normQuery);
      const matchCode = normalizeText(st.code).includes(normQuery) ||
                        normalizeText(st.id).includes(normQuery);
      const matchLines = st.lines.some((l) => normalizeText(l).includes(normQuery));
      return matchName || matchCode || matchLines;
    }).slice(0, 35);
  }, [sortedStations, normQuery]);

  const mapStations = useMemo(
    () =>
      stations
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          lat: s.lat!,
          lng: s.lng!,
          direction: s.direction,
        })),
    [stations]
  );

  const selectedDistance = useMemo(() => {
    if (!selectedStation?.lat || !selectedStation?.lng || !userLocation) return null;
    return haversineDistance(
      userLocation.lat,
      userLocation.lng,
      selectedStation.lat,
      selectedStation.lng
    );
  }, [selectedStation, userLocation]);

  const serviceUpdateText = useMemo(() => {
    const delayed = stationBuses.filter(
      (b) => b.remainingTimeCurr != null && b.remainingTimeCurr >= 8
    );
    if (delayed.length > 0) {
      const line = delayed[0].busLineNo || delayed[0].busLineCode;
      return `Hat ${line} şu an ${delayed[0].remainingTimeCurr} dk içinde geliyor.`;
    }
    if (liveBuses.length > 0) {
      return `${liveBuses.length} otobüs haritada canlı takip ediliyor.`;
    }
    return 'Canlı sefer bilgileri Elazığ Belediyesi API üzerinden güncelleniyor.';
  }, [stationBuses, liveBuses]);

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 230],
  });

  const fabTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-210, 0],
  });

  const goToMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(coords);
      userLocationRef.current = coords;
      setMapCenter(coords);
      syncUserLocationToMap(coords, true);

      const withCoords = stations.filter((s) => s.lat && s.lng);
      if (withCoords.length > 0) {
        let nearest = withCoords[0];
        let minDist = Infinity;
        for (const s of withCoords) {
          const d = haversineDistance(coords.lat, coords.lng, s.lat!, s.lng!);
          if (d < minDist) {
            minDist = d;
            nearest = s;
          }
        }
        loadStationDetail(nearest, false, false);
      }
    } catch (e) {
      console.log('Konum alma hatası:', e);
    }
  };

  // Build HTML ONCE on initial load to prevent WebView reloads, zoom resets, & white flashes
  const initialLeafletHtml = useMemo(
    () =>
      buildLeafletHtml(
        mapStations,
        liveBuses.map((b) => ({
          plaka: b.plaka,
          hatkodu: b.hatkodu,
          enlem: b.enlem || 0,
          boylam: b.boylam || 0,
          istikamet: b.istikamet,
          hiz: b.hiz,
        })),
        userLocation || ELAZIG_CENTER,
        null,
        userLocation
      ),
    [mapStations.length > 0]
  );

  // Inject live bus marker updates dynamically without reloading WebView!
  useEffect(() => {
    if (webViewRef.current && liveBuses.length > 0) {
      const busPayload = liveBuses.map((b) => ({
        plaka: b.plaka,
        hatkodu: b.hatkodu,
        enlem: b.enlem || 0,
        boylam: b.boylam || 0,
        istikamet: b.istikamet,
        hiz: b.hiz,
      }));
      const js = `if (window.updateBuses) { window.updateBuses(${JSON.stringify(busPayload)}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [liveBuses]);

  // Inject user location pulse marker dynamically when user location is retrieved
  useEffect(() => {
    if (webViewRef.current && userLocation) {
      const js = `if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(userLocation)}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  }, [userLocation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Theme.colors.surface} />

      {/* Top App Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>Ulaşım</Text>
            <Text style={styles.headerSub}>
              {refreshingBuses ? 'Canlı veriler güncelleniyor…' : `${stations.length || '—'} durak · ${allRoutes.length || '—'} hat · canlı`}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {refreshingBuses && <ActivityIndicator size="small" color={Theme.colors.accent} />}
          {cityLive && (
            <TouchableOpacity style={styles.liveChip} onPress={exitCityLive} activeOpacity={0.8}>
              <View style={styles.liveDot} />
              <Text style={styles.liveChipText}>{liveBuses.length} otobüs</Text>
              <Ionicons name="close" size={12} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.cardChip}
            onPress={() => setCardModalVisible(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="credit-card-chip-outline" size={16} color="#fff" />
            <Text style={styles.cardChipText}>
              {cardInfo.bakiye !== undefined ? `₺${cardInfo.bakiye.toFixed(2)}` : 'Kart'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarText}>
              {(userProfile?.displayName || 'M').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Search Bar — Always visible for 1-tap search */}
      <View style={styles.topSearchBarContainer}>
        <TouchableOpacity
          style={styles.topSearchBar}
          onPress={() => {
            setShowSearch(true);
            setShowRoutesPanel(false);
          }}
          activeOpacity={0.88}
        >
          <Ionicons name="search" size={18} color={Theme.colors.primary} />
          <Text style={styles.topSearchPlaceholder} numberOfLines={1}>
            {selectedStation
              ? `${selectedStation.name} • Durak veya Hat Ara...`
              : 'Durak adı, kod (Örn: 701) veya Hat ara (Örn: 27)...'}
          </Text>
          <View style={styles.topSearchAction}>
            <Text style={styles.topSearchActionText}>Ara</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Main Canvas */}
      <View style={styles.mainCanvas}>
        {/* Full-screen Map */}
            {Platform.OS === 'web' ? (
              <View style={styles.mapFull}>
                {React.createElement('iframe', {
                  ref: iframeRef,
                  srcDoc: initialLeafletHtml,
                  style: { width: '100%', height: '100%', border: 'none' },
                  title: 'Elazığ Canlı Transit Haritası',
                })}
                <View style={styles.mapGradient} pointerEvents="none" />
              </View>
            ) : (
              <View style={styles.mapFull}>
                <WebView
                  ref={webViewRef}
                  originWhitelist={['*']}
                  source={{ html: initialLeafletHtml }}
                  style={{ flex: 1, backgroundColor: '#e5eeff' }}
                  onMessage={(event) => {
                    try {
                      const data = JSON.parse(event.nativeEvent.data);
                      if (data.type === 'mapReady') {
                        isMapReadyRef.current = true;
                        if (userLocationRef.current) {
                          syncUserLocationToMap(userLocationRef.current, true);
                        }
                      } else if (data.type === 'mapTap') {
                        enterCityLive();
                      } else if (data.type === 'station' && data.id) {
                        const st = stations.find((s) => String(s.id) === String(data.id));
                        if (st) loadStationDetail(st);
                      }
                    } catch (e) {
                      console.log('WebView message error:', e);
                    }
                  }}
                  onLoadEnd={() => {
                    setTimeout(() => {
                      isMapReadyRef.current = true;
                      if (userLocationRef.current) {
                        syncUserLocationToMap(userLocationRef.current, true);
                      }
                    }, 350);
                  }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={false}
                  scalesPageToFit={true}
                />
                <View style={styles.mapGradient} pointerEvents="none" />
              </View>
            )}

            {/* Enhanced Search overlay for both Stations and Routes */}
            {showSearch && (
              <View style={styles.searchOverlay}>
                <View style={styles.searchHeader}>
                  <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color={Theme.colors.primary} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Durak adı, kod veya Hat ara (Örn: 27, Valilik)..."
                      placeholderTextColor={Theme.colors.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoFocus
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={18} color={Theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                    }}
                    style={styles.searchCloseBtn}
                  >
                    <Ionicons name="close" size={22} color={Theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Filter Tabs */}
                <View style={styles.filterTabsRow}>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'all' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('all')}
                  >
                    <Text style={[styles.filterChipText, searchFilter === 'all' && styles.filterChipTextActive]}>
                      Tümü
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'routes' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('routes')}
                  >
                    <MaterialCommunityIcons
                      name="routes"
                      size={14}
                      color={searchFilter === 'routes' ? '#fff' : Theme.colors.secondary}
                    />
                    <Text style={[styles.filterChipText, searchFilter === 'routes' && styles.filterChipTextActive]}>
                      Hatlar ({matchingRoutes.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterChip, searchFilter === 'stations' && styles.filterChipActive]}
                    onPress={() => setSearchFilter('stations')}
                  >
                    <MaterialCommunityIcons
                      name="bus-stop"
                      size={14}
                      color={searchFilter === 'stations' ? '#fff' : Theme.colors.primary}
                    />
                    <Text style={[styles.filterChipText, searchFilter === 'stations' && styles.filterChipTextActive]}>
                      Duraklar ({matchingStations.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.searchResults}
                  contentContainerStyle={styles.searchResultsContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Direct query action if numeric */}
                  {/^\d+$/.test(normQuery) && (
                    <TouchableOpacity
                      style={styles.directActionCard}
                      onPress={() => loadRouteDetail(normQuery, `Hat ${normQuery}`)}
                    >
                      <View style={styles.directActionIcon}>
                        <MaterialCommunityIcons name="bus-clock" size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.directActionTitle}>Hat {normQuery} Canlı Takip & Seferleri</Text>
                        <Text style={styles.directActionSub}>Bu hattın canlı otobüslerini ve duraklarını haritada gör</Text>
                      </View>
                      <Ionicons name="arrow-forward-circle" size={22} color={Theme.colors.secondary} />
                    </TouchableOpacity>
                  )}

                  {/* Empty query: Quick Lines & Recents */}
                  {!normQuery && allRoutes.length > 0 && (
                    <View style={styles.quickSection}>
                      <Text style={styles.quickSectionTitle}>Sık Kullanılan Hatlar</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsScroll}>
                        {allRoutes.slice(0, 10).map((rt) => (
                          <TouchableOpacity
                            key={`quick-${rt.kod}`}
                            style={styles.quickLineChip}
                            onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                          >
                            <Text style={styles.quickLineChipText}>Hat {rt.hatNo}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Routes section */}
                  {(searchFilter === 'all' || searchFilter === 'routes') && matchingRoutes.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <MaterialCommunityIcons name="routes" size={16} color={Theme.colors.secondary} />
                        <Text style={styles.searchSectionTitle}>Otobüs Hatları ({matchingRoutes.length})</Text>
                      </View>
                      {matchingRoutes.map((rt) => (
                        <TouchableOpacity
                          key={`rt-${rt.kod}`}
                          style={styles.routeResultItem}
                          onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                        >
                          <View style={[styles.routeBadge, { backgroundColor: getBusColor(String(rt.hatNo)) }]}>
                            <Text style={styles.routeBadgeText}>HAT {rt.hatNo}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.routeResultName}>Hat {rt.hatNo} - {rt.kod}</Text>
                            <Text style={styles.routeResultDesc} numberOfLines={1}>{rt.aciklama}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Stations section */}
                  {(searchFilter === 'all' || searchFilter === 'stations') && matchingStations.length > 0 && (
                    <View style={styles.searchSection}>
                      <View style={styles.searchSectionHeader}>
                        <MaterialCommunityIcons name="bus-stop" size={16} color={Theme.colors.primary} />
                        <Text style={styles.searchSectionTitle}>Otobüs Durakları</Text>
                      </View>
                      {matchingStations.map((st) => (
                        <TouchableOpacity
                          key={`st-${st.id}`}
                          style={styles.searchResultItem}
                          onPress={() => {
                            loadStationDetail(st);
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                        >
                          <View style={styles.stationIconBox}>
                            <MaterialCommunityIcons name="bus-stop" size={18} color={Theme.colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.searchResultName}>{st.name}</Text>
                            <Text style={styles.searchResultMeta}>
                              {st.code}
                              {st.direction ? ` · ${st.direction}` : ''}
                              {(st as any)._distance != null && (st as any)._distance < 100
                                ? ` · ${formatDistance((st as any)._distance)}`
                                : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={Theme.colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* No results */}
                  {normQuery && matchingRoutes.length === 0 && matchingStations.length === 0 && (
                    <View style={styles.noResultsBox}>
                      <MaterialCommunityIcons name="bus-stop-covered" size={36} color={Theme.colors.textMuted} />
                      <Text style={styles.noResultsTitle}>Sonuç Bulunamadı</Text>
                      <Text style={styles.noResultsSub}>"{searchQuery}" ile eşleşen hat veya durak bulunamadı.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Routes panel (layers) */}
            {showRoutesPanel && (
              <View style={styles.routesPanel}>
                <View style={styles.routesPanelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="routes" size={20} color={Theme.colors.primary} />
                    <Text style={styles.routesPanelTitle}>Hat Seferleri & Durakları</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowRoutesPanel(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={Theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* All Elazığ bus lines horizontal picker */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeTabs} contentContainerStyle={{ paddingRight: 12 }}>
                  {allRoutes.map((rt) => (
                    <TouchableOpacity
                      key={`panel-${rt.kod}`}
                      style={[
                        styles.routeTab,
                        (selectedRoute?.routeCode === rt.kod || selectedRoute?.lineNo === rt.kod) && styles.routeTabActive,
                      ]}
                      onPress={() => loadRouteDetail(rt.kod, rt.aciklama)}
                    >
                      <Text
                        style={[
                          styles.routeTabText,
                          (selectedRoute?.routeCode === rt.kod || selectedRoute?.lineNo === rt.kod) && styles.routeTabTextActive,
                        ]}
                      >
                        Hat {rt.hatNo}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {selectedRoute && (
                  <ScrollView style={styles.routeDetailScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.routeName}>{selectedRoute.routeName}</Text>
                    {selectedRoute.priceInfo ? (
                      <Text style={styles.routePrice}>💳 {selectedRoute.priceInfo}</Text>
                    ) : null}
                    {selectedRoute.totalStops ? (
                      <Text style={styles.routeStopsCount}>
                        🚏 Toplam {selectedRoute.totalStops} durak (Durağa dokunarak haritada görün)
                      </Text>
                    ) : null}

                    {/* Interactive Route Stops List */}
                    {selectedRoute.mainStops.map((stop, idx) => (
                      <TouchableOpacity
                        key={`${stop}-${idx}`}
                        style={styles.routeStopRow}
                        onPress={() => {
                          const matched = stations.find(
                            (s) =>
                              normalizeText(s.name).includes(normalizeText(stop)) ||
                              normalizeText(stop).includes(normalizeText(s.name))
                          );
                          if (matched) {
                            loadStationDetail(matched);
                          }
                        }}
                      >
                        <View style={[styles.routeStopDot, idx === 0 && styles.routeStopDotFirst]} />
                        <Text style={styles.routeStopName}>{stop}</Text>
                        <Ionicons name="locate-outline" size={16} color={Theme.colors.secondary} />
                      </TouchableOpacity>
                    ))}

                    {selectedRoute.departureTimes.length > 0 && (
                      <>
                        <Text style={styles.departuresTitle}>Kalkış Saatleri</Text>
                        <View style={styles.timeGrid}>
                          {selectedRoute.departureTimes.slice(0, 24).map((t, i) => (
                            <View key={`${t}-${i}`} style={styles.timePill}>
                              <Text style={styles.timePillText}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </ScrollView>
                )}
              </View>
            )}
            {/* Floating Action Buttons */}
            <Animated.View style={[styles.fabColumn, { transform: [{ translateY: fabTranslateY }] }]}>
              <TouchableOpacity
                style={styles.fabSecondary}
                onPress={() => {
                  setShowRoutesPanel((v) => !v);
                  setShowSearch(false);
                }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="layers-outline" size={22} color={Theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fabPrimary} onPress={goToMyLocation} activeOpacity={0.85}>
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#fff" />
              </TouchableOpacity>
            </Animated.View>

            {/* Bottom Sheet */}
            <Animated.View
              style={[styles.bottomSheet, { transform: [{ translateY: sheetTranslateY }] }]}
              {...panResponder.panHandlers}
            >
              <TouchableOpacity
                style={styles.dragHandleHit}
                onPress={() => setSheetExpanded((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={styles.dragHandle} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetHeaderTouchable}
                onPress={() => setSheetExpanded((v) => !v)}
                activeOpacity={0.85}
              >
                <View style={styles.sheetHeaderRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {selectedStation?.name || 'Durak Seçin'}
                    </Text>
                    <View style={styles.sheetMetaRow}>
                      <MaterialCommunityIcons
                        name="near-me"
                        size={14}
                        color={Theme.colors.textMuted}
                      />
                      <Text style={styles.sheetMeta}>
                        {selectedDistance != null
                          ? formatDistance(selectedDistance)
                          : selectedStation?.lines.length
                          ? `${selectedStation.lines.length} hat geçiyor`
                          : selectedStation?.direction || 'Konum bekleniyor'}
                      </Text>
                      {selectedStation?.code ? (
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{selectedStation.code}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {selectedStation?.lat && selectedStation?.lng ? (
                      <TouchableOpacity
                        style={styles.detailsBtn}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps?q=${selectedStation.lat},${selectedStation.lng}`
                          )
                        }
                      >
                        <Text style={styles.detailsBtnText}>Yol Tarifi</Text>
                      </TouchableOpacity>
                    ) : null}
                    <Ionicons
                      name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
                      size={20}
                      color={Theme.colors.textMuted}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Scrollable sheet body so content never clips or overlaps */}
              <ScrollView
                style={styles.sheetBodyScroll}
                contentContainerStyle={styles.sheetBodyContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Live Arrivals */}
                {stationLoading ? (
                  <View style={styles.sheetLoading}>
                    <ActivityIndicator size="small" color={Theme.colors.primary} />
                    <Text style={styles.sheetLoadingText}>Yaklaşan otobüsler yükleniyor...</Text>
                  </View>
                ) : (
                  <View style={styles.arrivalsGrid}>
                    {stationBuses.length > 0 ? (
                      stationBuses.slice(0, 4).map((bus, idx) => (
                        <View
                          key={`${bus.busLineCode}-${idx}`}
                          style={[
                            styles.arrivalCard,
                            idx >= 2 && stationBuses.length === 3 && idx === 2
                              ? styles.arrivalCardWide
                              : null,
                            stationBuses.length === 1 ? styles.arrivalCardWide : null,
                          ]}
                        >
                          <View style={styles.arrivalCardTop}>
                            <View
                              style={[
                                styles.hatBadge,
                                { backgroundColor: getBusColor(String(bus.busLineNo || bus.busLineCode), idx) },
                              ]}
                            >
                              <Text style={styles.hatBadgeText}>
                                HAT {bus.busLineNo || bus.busLineCode || '—'}
                              </Text>
                            </View>
                            <Text style={styles.arrivalMins}>
                              {bus.remainingTimeCurr != null ? `${bus.remainingTimeCurr} dk` : '—'}
                            </Text>
                          </View>
                          <Text style={styles.arrivalDest} numberOfLines={1}>
                            {bus.busLineLongName || bus.busLineCode || '—'}
                          </Text>
                          {(bus.remainingNumberOfBusStops != null || bus.busPlate) && (
                            <Text style={styles.arrivalNext} numberOfLines={1}>
                              {bus.remainingNumberOfBusStops != null ? `${bus.remainingNumberOfBusStops} durak uzakta` : ''}
                              {bus.remainingNumberOfBusStops != null && bus.busPlate ? ' · ' : ''}
                              {bus.busPlate || ''}
                            </Text>
                          )}
                          {bus.remainingTimeNext != null && (
                            <Text style={styles.arrivalNext}>
                              Sonraki: {bus.remainingTimeNext} dk
                            </Text>
                          )}
                        </View>
                      ))
                    ) : (
                      <View style={styles.arrivalCardWide}>
                        <Text style={styles.noBusText}>
                          Bu duraktan şu an yaklaşan aktif otobüs bulunamadı.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Nearby stations quick list */}
                {sortedStations.length > 1 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.nearbySectionTitle}>Çevredeki Diğer Duraklar</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.nearbyScroll}
                      contentContainerStyle={styles.nearbyScrollContent}
                    >
                      {sortedStations.slice(0, 10).map((st) => (
                        <TouchableOpacity
                          key={st.id}
                          style={[
                            styles.nearbyChip,
                            selectedStation?.id === st.id && styles.nearbyChipActive,
                          ]}
                          onPress={() => loadStationDetail(st)}
                        >
                          <MaterialCommunityIcons
                            name="bus-stop"
                            size={14}
                            color={
                              selectedStation?.id === st.id ? '#fff' : Theme.colors.primary
                            }
                          />
                          <Text
                            style={[
                              styles.nearbyChipText,
                              selectedStation?.id === st.id && styles.nearbyChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {st.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
      </View>

      <CardQueryModal
        visible={cardModalVisible}
        onClose={() => setCardModalVisible(false)}
        onSuccess={(res) => {
          if (res.success) setCardInfo(res);
        }}
      />
      <AuthProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onProfileUpdated={(prof) => setUserProfile(prof)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Theme.colors.background,
    zIndex: 40,
  },
  headerSub: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Theme.colors.success,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveChipText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cardChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.colors.primary,
    borderWidth: 0,
    borderColor: Theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  mainCanvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
  },
  mapFull: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  mapGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
    // soft fade simulated via overlay tint
    opacity: 0.5,
    zIndex: 1,
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    bottom: 85,
    zIndex: 60,
    gap: 12,
    alignItems: 'center',
  },
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.md,
  },
  fabPrimary: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadows.lg,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0,
    borderColor: Theme.colors.cardBorder,
    paddingBottom: 16,
    maxHeight: SCREEN_HEIGHT * 0.46,
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 16,
  },
  dragHandleHit: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  dragHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#c4c6cf',
  },
  sheetHeaderTouchable: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.colors.textPrimary,
    marginBottom: 2,
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sheetMeta: {
    fontSize: 13,
    color: Theme.colors.textMuted,
  },
  codeBadge: {
    backgroundColor: Theme.colors.secondaryBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.secondary,
  },
  detailsBtn: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  sheetBodyScroll: {
    flex: 1,
  },
  sheetBodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheetLoading: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  sheetLoadingText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  arrivalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  arrivalCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  arrivalCardWide: {
    width: '100%',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  arrivalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hatBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  arrivalMins: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.accentDark,
  },
  arrivalDest: {
    fontSize: 13,
    color: Theme.colors.textPrimary,
  },
  arrivalNext: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 4,
  },
  noBusText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  serviceUpdate: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.colors.surfaceVariant,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  serviceUpdateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#66affe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceUpdateTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  serviceUpdateBody: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  nearbySectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nearbyScroll: {
    marginTop: 4,
  },
  nearbyScrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  nearbyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 160,
  },
  nearbyChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  nearbyChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
    maxWidth: 120,
  },
  nearbyChipTextActive: {
    color: '#fff',
  },
  // Top Search Bar (Always visible)
  topSearchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: Theme.colors.background,
    zIndex: 35,
  },
  topSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    ...Theme.shadows.sm,
  },
  topSearchPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontWeight: '500',
  },
  topSearchAction: {
    backgroundColor: Theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  topSearchActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // Search Overlay (Full featured modal)
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    maxHeight: SCREEN_HEIGHT * 0.72,
    backgroundColor: Theme.colors.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 2,
    borderBottomColor: Theme.colors.cardBorder,
    overflow: 'hidden',
    ...Theme.shadows.lg,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.colors.textPrimary,
  },
  searchCloseBtn: {
    padding: 6,
  },

  // Filter Tabs
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textPrimary,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Search Results
  searchResults: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  searchResultsContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Direct Action Card
  directActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.colors.secondaryBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.colors.secondary,
    padding: 12,
    marginVertical: 6,
  },
  directActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  directActionSub: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },

  // Quick Lines Section
  quickSection: {
    marginVertical: 8,
  },
  quickSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  quickChipsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  quickLineChip: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  quickLineChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.primary,
  },

  // Search Sections (Hatlar / Duraklar)
  searchSection: {
    marginTop: 8,
  },
  searchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    marginBottom: 4,
  },
  searchSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  routeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 54,
    alignItems: 'center',
  },
  routeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  routeResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  routeResultDesc: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  stationIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  searchResultMeta: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  noResultsBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  noResultsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  noResultsSub: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    textAlign: 'center',
  },

  // Routes Panel (Layers)
  routesPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 72,
    bottom: 280,
    zIndex: 35,
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    padding: 14,
    ...Theme.shadows.lg,
  },
  routesPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  routesPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  routeTabs: {
    flexGrow: 0,
    marginBottom: 10,
  },
  routeTab: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  routeTabActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  routeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textPrimary,
  },
  routeTabTextActive: {
    color: '#fff',
  },
  routeDetailScroll: {
    flex: 1,
  },
  routeName: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.primary,
    marginBottom: 4,
  },
  routePrice: {
    fontSize: 12,
    color: Theme.colors.secondary,
    marginBottom: 4,
  },
  routeStopsCount: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginBottom: 10,
  },
  routeStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceSubtle,
  },
  routeStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.colors.cardBorder,
  },
  routeStopDotFirst: {
    backgroundColor: Theme.colors.primary,
  },
  routeStopName: {
    fontSize: 13,
    color: Theme.colors.textPrimary,
    flex: 1,
  },
  departuresTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
    marginTop: 12,
    marginBottom: 8,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timePill: {
    backgroundColor: Theme.colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  timePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
});
