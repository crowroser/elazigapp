import React, { useRef, useImperativeHandle, forwardRef, useEffect, useMemo } from 'react';
import { Theme, themedStyles } from '../constants/Theme';
import { View, StyleSheet, Platform, StyleProp, ViewStyle, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

export interface LeafletMarkerItem {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
  code?: string;
  direction?: string;
  address?: string;
  phone?: string;
  type?: 'station' | 'kiosk' | 'bayi' | 'custom' | string;
  tipLabel?: string;
  distanceText?: string;
}

export interface BuildLeafletHtmlOptions {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: LeafletMarkerItem[];
  markerType?: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom';
  selectedId?: string | number | null;
  selectedVehicleKey?: string | null;
  userLocation?: { lat: number; lng: number } | null;
  buses?: any[];
  overviewLines?: any[];
  enableClustering?: boolean;
}

export interface LeafletMapRef {
  /** yShift: harita yüksekliğinin oranı kadar hedefi yukarı al (alt panel açıkken 0.23) */
  panToLocation: (lat: number, lng: number, zoom?: number, yShift?: number) => void;
  updateUserLocation: (loc: { lat: number; lng: number } | null) => void;
  updateMarkers: (markers: LeafletMarkerItem[], selectedId?: string | number | null) => void;
  updateBuses: (buses: any[], generatedUtc?: string) => void;
  updateRoutePolyline: (coords: any[], selectedRouteCode?: string) => void;
  setOverviewLines: (routes: any[]) => void;
  selectMarker: (id: string | number | null) => void;
  selectVehicle: (key: string | null) => void;
  setFollowVehicle: (key: string | null) => void;
  /** Harita / uydu katmanı arasında geçiş */
  toggleBaseLayer: () => void;
  injectJavaScript: (js: string) => void;
}

export interface LeafletMapProps {
  markers?: LeafletMarkerItem[];
  markerType?: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom';
  center?: { lat: number; lng: number };
  zoom?: number;
  selectedId?: string | number | null;
  selectedVehicleKey?: string | null;
  userLocation?: { lat: number; lng: number } | null;
  buses?: any[];
  overviewLines?: any[];
  enableClustering?: boolean;
  onMarkerPress?: (marker: LeafletMarkerItem) => void;
  onVehiclePress?: (vehicle: any) => void;
  onFollowCancel?: () => void;
  onMapTap?: () => void;
  onMapReady?: () => void;
  onDirectionsPress?: (lat: number, lng: number, name?: string) => void;
  style?: StyleProp<ViewStyle>;
  title?: string;
  customHtml?: string;
  reducedMotion?: boolean;
}

const ELAZIG_CENTER = { lat: 38.6748, lng: 39.2225 };

export interface BuildLeafletHtmlOptions {
  markers?: LeafletMarkerItem[];
  buses?: any[];
  center?: { lat: number; lng: number };
  selectedId?: string | number | null;
  selectedVehicleKey?: string | null;
  userLocation?: { lat: number; lng: number } | null;
  markerType?: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom';
  enableClustering?: boolean;
  zoom?: number;
  overviewLines?: any[];
  reducedMotion?: boolean;
}

export function buildLeafletHtml(
  stationsOrOptions: any[] | BuildLeafletHtmlOptions,
  busesArg: any[] = [],
  centerArg: { lat: number; lng: number } = ELAZIG_CENTER,
  selectedIdArg?: string | number | null,
  userLocationArg?: { lat: number; lng: number } | null
): string {
  let markers: LeafletMarkerItem[] = [];
  let buses: any[] = [];
  let center = centerArg;
  let selectedId = selectedIdArg;
  let selectedVehicleKey: string | null = null;
  let userLocation = userLocationArg;
  let markerType: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom' = 'station';
  let enableClustering = true;
  let zoom = 14;
  let overviewLines: any[] = [];
  let reducedMotion = false;

  if (Array.isArray(stationsOrOptions)) {
    markers = stationsOrOptions;
    buses = busesArg || [];
    center = centerArg || ELAZIG_CENTER;
    selectedId = selectedIdArg;
    userLocation = userLocationArg;
    markerType = 'station';
  } else if (stationsOrOptions && typeof stationsOrOptions === 'object') {
    markers = stationsOrOptions.markers || [];
    buses = stationsOrOptions.buses || [];
    center = stationsOrOptions.center || ELAZIG_CENTER;
    selectedId = stationsOrOptions.selectedId;
    selectedVehicleKey = stationsOrOptions.selectedVehicleKey || null;
    userLocation = stationsOrOptions.userLocation;
    markerType = stationsOrOptions.markerType || 'mixed';
    enableClustering = stationsOrOptions.enableClustering ?? true;
    zoom = stationsOrOptions.zoom || 14;
    overviewLines = stationsOrOptions.overviewLines || [];
    reducedMotion = stationsOrOptions.reducedMotion ?? false;
  }

  const dark = Theme.colors.isDark;
  const mapBg = dark ? '#0B1220' : '#e5eeff';
  const routePalette = Theme.routePalette;

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
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${mapBg}; overflow: hidden; }
    .leaflet-container { background: ${mapBg}; font-family: Inter, system-ui, -apple-system, sans-serif; }
    .dark-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.92) saturate(0.55); }
    
    /* Station Markers (DESIGN_PLAN §2.1: slate500 dolgu, beyaz kenar) */
    .station-marker {
      width: 10px; height: 10px; border-radius: 50%;
      background: #64748B; border: 2px solid #ffffff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      position: relative;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .station-marker.selected {
      width: 16px; height: 16px; background: #0F2A4A;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(15,42,74,0.35);
      transform: scale(1.15);
      z-index: 800 !important;
    }

    /* Kiosk (Kart Dolum Otomatı) marker */
    .kiosk-marker {
      width: 28px; height: 28px; border-radius: 9px;
      background: #0284c7; border: 2px solid #ffffff;
      box-shadow: 0 3px 8px rgba(0,32,69,0.3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 14px; color: #fff;
    }
    .kiosk-marker.selected {
      transform: scale(1.2);
      box-shadow: 0 0 0 5px rgba(2, 132, 199, 0.45);
      z-index: 1000 !important;
    }

    /* Bayi (Yetkili Satış/Paso Bürosu) marker */
    .bayi-marker {
      width: 28px; height: 28px; border-radius: 9px;
      background: #7c3aed; border: 2px solid #ffffff;
      box-shadow: 0 3px 8px rgba(124,58,237,0.3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 14px; color: #fff;
    }
    .bayi-marker.selected {
      transform: scale(1.2);
      box-shadow: 0 0 0 5px rgba(124, 58, 237, 0.45);
      z-index: 1000 !important;
    }
    
    /* Cluster styling */
    .station-cluster {
      background-color: rgba(100, 116, 139, 0.22);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
    }
    .station-cluster div {
      width: 24px; height: 24px; border-radius: 50%;
      background: #475569; color: #ffffff;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800; border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .station-cluster.cluster-large div {
      background: #0F2A4A;
    }

    /* ─── Canlı Araç İkonu (v2 Tasarımı) ─── */
    .bus-v2-marker {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transition: opacity 0.3s ease;
      will-change: transform;
    }
    .bus-v2-body {
      height: 26px;
      padding: 0 8px;
      border-radius: 13px;
      border: 2px solid #ffffff;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      position: relative;
      font-size: 11px;
      font-weight: 900;
      color: #ffffff;
      user-select: none;
      white-space: nowrap;
    }
    .bus-v2-arrow {
      width: 0;
      height: 0;
      border-left: 3px solid transparent;
      border-right: 3px solid transparent;
      border-bottom: 5px solid #ffffff;
      transform-origin: center center;
      margin-right: 2px;
      flex-shrink: 0;
    }
    .bus-v2-marker.selected .bus-v2-body {
      transform: scale(1.22);
      box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.6), 0 4px 14px rgba(0,0,0,0.4);
      z-index: 1000 !important;
    }
    .bus-v2-marker.dimmed {
      opacity: 0.55;
    }
    .bus-v2-plate {
      margin-top: 2px;
      background: rgba(255, 255, 255, 0.94);
      color: #0F172A;
      font-size: 9.5px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.22);
      white-space: nowrap;
      pointer-events: none;
      display: block;
    }
    .bus-v2-plate.hidden-lod {
      display: none !important;
    }
    .bus-v2-top-row {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* G1.9 Yön/Hız Rozeti: Hat modunda ikon yanında km/s etiketi */
    .bus-v2-speed-badge {
      background: rgba(15, 23, 42, 0.88);
      color: #10B981;
      font-size: 8.5px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 4px;
      margin-left: 2px;
      border: 1px solid rgba(16, 185, 129, 0.4);
      white-space: nowrap;
      user-select: none;
    }
    .bus-v2-speed-badge.stopped {
      color: #F59E0B;
      border-color: rgba(245, 158, 11, 0.4);
    }
    @media (prefers-reduced-motion: reduce) {
      .teleport-pulse { animation: none !important; }
      .user-pulse { animation: none !important; }
      .bus-v2-marker { transition: none !important; }
    }
    ${dark ? `
      .bus-v2-plate {
        background: rgba(18, 27, 46, 0.94);
        color: #F1F5F9;
        border: 1px solid rgba(255,255,255,0.1);
      }
    ` : ''}

    /* Işınlanma Nabzı (G1.5) */
    .teleport-pulse {
      position: absolute;
      width: 44px;
      height: 44px;
      top: -9px;
      left: 50%;
      margin-left: -22px;
      border-radius: 50%;
      border: 3px solid #10B981;
      animation: teleportAnim 2s ease-out 1;
      pointer-events: none;
    }
    @keyframes teleportAnim {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }

    .user-pulse {
      width: 20px; height: 20px; border-radius: 50%;
      background: #0284c7; border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.4);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.7); }
      70% { box-shadow: 0 0 0 12px rgba(2, 132, 199, 0); }
      100% { box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
    }
    .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 4px 16px rgba(15,23,42,0.2); }
    .popup-title { font-weight: 700; color: #0F172A; font-size: 13px; margin-bottom: 2px; }
    .popup-code { font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-block; }
    .popup-chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
    .chip-kiosk { background: #e0f2fe; color: #0369a1; }
    .chip-bayi { background: #f3e8ff; color: #7e22ce; }
    .directions-btn {
      margin-top: 8px; width: 100%; background: #0F2A4A; color: #ffffff;
      border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px;
      font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .directions-btn:active { background: #0A1B33; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var ROUTE_PALETTE = ${JSON.stringify(routePalette)};
    function getRouteColor(code) {
      if (!code) return ROUTE_PALETTE[0];
      var str = String(code);
      var hash = 0;
      for (var i = 0; i < str.length; i++) hash = (hash + str.charCodeAt(i) * 17) % ROUTE_PALETTE.length;
      return ROUTE_PALETTE[Math.abs(hash) % ROUTE_PALETTE.length];
    }

    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${center.lat}, ${center.lng}], ${zoom});

    var streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'OpenStreetMap',
      className: ${dark ? "'dark-tiles'" : "''"}
    }).addTo(map);

    var satMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri World Imagery'
    });

    // Leaflet'in kendi zoom/katman düğmeleri çizilmez (üst şerit ve FAB'larla çakışıyordu);
    // yakınlaştırma pinch ile, katman geçişi uygulamanın FAB'ından (toggleBaseLayer) yapılır.
    var satActive = false;
    window.toggleBaseLayer = function() {
      satActive = !satActive;
      if (satActive) { map.removeLayer(streetMap); satMap.addTo(map); }
      else { map.removeLayer(satMap); streetMap.addTo(map); }
      return satActive;
    };

    var overviewPolylinesGroup = L.layerGroup().addTo(map);
    var selectedRoutePolylineGroup = L.layerGroup().addTo(map);
    var busLayerGroup = L.layerGroup().addTo(map);

    var userMarker = null;
    window.updateUserLocation = function(uLoc) {
      if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
      if (uLoc && uLoc.lat && uLoc.lng) {
        var uIcon = L.divIcon({
          className: '',
          html: '<div class="user-pulse"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        userMarker = L.marker([uLoc.lat, uLoc.lng], { icon: uIcon, zIndexOffset: 1000 }).addTo(map)
          .bindPopup("<div class='popup-title'>Mevcut Konumunuz</div>");
      }
    };

    var userLoc = ${JSON.stringify(userLocation || null)};
    if (userLoc) window.updateUserLocation(userLoc);

    // ─── Durak İşaretçileri ───
    var enableCluster = ${enableClustering ? 'true' : 'false'};
    var markerContainer;
    if (enableCluster && typeof L.markerClusterGroup === 'function') {
      markerContainer = L.markerClusterGroup({
        maxClusterRadius: 35,
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
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
        }
      });
    } else {
      markerContainer = L.layerGroup();
    }
    map.addLayer(markerContainer);

    var markerMap = {};
    var currentSelectedId = ${JSON.stringify(selectedId || null)};
    var defaultMarkerType = ${JSON.stringify(markerType)};

    function createMarkerIcon(item, isSelected) {
      var itype = item.type || defaultMarkerType;
      if (itype === 'kiosk' || (item.tip && item.tip.toUpperCase() === 'K')) {
        return L.divIcon({
          className: '',
          html: '<div class="kiosk-marker' + (isSelected ? ' selected' : '') + '">💳</div>',
          iconSize: isSelected ? [32, 32] : [28, 28],
          iconAnchor: isSelected ? [16, 16] : [14, 14]
        });
      } else if (itype === 'bayi' || (item.tip && item.tip.toUpperCase() === 'B')) {
        return L.divIcon({
          className: '',
          html: '<div class="bayi-marker' + (isSelected ? ' selected' : '') + '">🏪</div>',
          iconSize: isSelected ? [32, 32] : [28, 28],
          iconAnchor: isSelected ? [16, 16] : [14, 14]
        });
      }
      return L.divIcon({
        className: '',
        html: '<div class="station-marker' + (isSelected ? ' selected' : '') + '"></div>',
        iconSize: isSelected ? [16, 16] : [10, 10],
        iconAnchor: isSelected ? [8, 8] : [5, 5]
      });
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function createPopupContent(item) {
      var itype = item.type || defaultMarkerType;
      var isKiosk = itype === 'kiosk' || (item.tip && item.tip.toUpperCase() === 'K');
      var isBayi = itype === 'bayi' || (item.tip && item.tip.toUpperCase() === 'B');

      if (isKiosk || isBayi) {
        var chipClass = isKiosk ? 'chip-kiosk' : 'chip-bayi';
        var chipLabel = item.tipLabel || (isKiosk ? 'Kiosk (7/24 Otomat)' : 'Yetkili Bayi');
        return "<div class='popup-title'>" + esc(item.name) + "</div>" +
          "<div style='display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;'>" +
            "<span class='popup-chip " + chipClass + "'>" + esc(chipLabel) + "</span>" +
            (item.distanceText ? "<span style='font-size:11px;color:#0F2A4A;font-weight:700;'>" + esc(item.distanceText) + "</span>" : "") +
          "</div>" +
          (item.address ? "<div style='font-size:11px;color:#475569;margin-top:4px;line-height:1.3;'>" + esc(item.address) + "</div>" : "") +
          (item.phone ? "<div style='font-size:11px;color:#475569;margin-top:2px;'>📞 " + esc(item.phone) + "</div>" : "") +
          "<button class='directions-btn' data-lat='" + Number(item.lat) + "' data-lng='" + Number(item.lng) + "' data-name='" + esc(item.name) + "'>🧭 Yol Tarifi</button>";
      }

      return "<div class='popup-title'>" + esc(item.name) + "</div>" +
        (item.code ? "<div class='popup-code'>" + esc(item.code) + "</div>" : "") +
        (item.direction ? "<div style='font-size:11px;color:#64748b;margin-top:4px'>" + esc(item.direction) + "</div>" : "");
    }

    document.addEventListener('click', function(ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.directions-btn') : null;
      if (!btn) return;
      window.openDirections(parseFloat(btn.getAttribute('data-lat')), parseFloat(btn.getAttribute('data-lng')), btn.getAttribute('data-name') || '');
    });

    function renderMarkers(items, selId) {
      markerContainer.clearLayers();
      markerMap = {};
      currentSelectedId = selId || null;

      if (!Array.isArray(items)) return;
      items.forEach(function(item) {
        if (!item || isNaN(item.lat) || isNaN(item.lng)) return;
        var isSelected = (currentSelectedId && String(currentSelectedId) === String(item.id));
        var icon = createMarkerIcon(item, isSelected);
        var marker = L.marker([item.lat, item.lng], { icon: icon, zIndexOffset: isSelected ? 500 : 100 });
        marker.bindPopup(createPopupContent(item));

        marker.on('click', function() {
          var payload = JSON.stringify({ type: 'markerPress', marker: item, id: item.id });
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
          else if (window.parent) window.parent.postMessage(payload, '*');
        });

        markerMap[String(item.id)] = marker;
        markerContainer.addLayer(marker);
      });
    }

    renderMarkers(${JSON.stringify(markers)}, currentSelectedId);

    window.updateMarkers = function(newItems, selId) {
      renderMarkers(newItems, selId);
    };

    window.selectMarker = function(id) {
      if (!id) return;
      var strId = String(id);
      var m = markerMap[strId];
      if (m) {
        if (typeof markerContainer.zoomToShowLayer === 'function') {
          markerContainer.zoomToShowLayer(m, function() { m.openPopup(); });
        } else {
          m.openPopup();
        }
      }
    };

    window.openDirections = function(lat, lng, name) {
      var payload = JSON.stringify({ type: 'directions', lat: lat, lng: lng, name: name });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      else if (window.parent) window.parent.postMessage(payload, '*');
    };

    // ─── Güzergah Çizgileri ───
    var storedOverviewRoutes = [];
    window.setOverviewLines = function(routes) {
      overviewPolylinesGroup.clearLayers();
      if (!Array.isArray(routes)) return;
      storedOverviewRoutes = routes;
      routes.forEach(function(r) {
        if (!Array.isArray(r.lines)) return;
        var color = getRouteColor(r.routeCode || r.title);
        r.lines.forEach(function(line) {
          if (!Array.isArray(line) || line.length < 2) return;
          var latlngs = line.map(function(pt) { return [pt[1], pt[0]]; });
          L.polyline(latlngs, {
            color: color,
            weight: 2.5,
            opacity: 0.35,
            lineJoin: 'round'
          }).addTo(overviewPolylinesGroup);
        });
      });
    };

    var currentRoutePolylines = [];
    window.updateRoutePolyline = function(coords, selectedRouteCode) {
      selectedRoutePolylineGroup.clearLayers();
      currentRoutePolylines = [];
      if (!Array.isArray(coords) || coords.length === 0) {
        overviewPolylinesGroup.eachLayer(function(l) { l.setStyle({ opacity: 0.35 }); });
        return;
      }
      overviewPolylinesGroup.eachLayer(function(l) { l.setStyle({ opacity: 0.12 }); });

      var groups = { F: [], B: [] };
      coords.forEach(function(c) {
        if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return;
        var key = c.routeDirection === 'B' ? 'B' : 'F';
        groups[key].push([c.latitude, c.longitude]);
      });

      var color = getRouteColor(selectedRouteCode || '1');
      var bounds = null;
      ['F', 'B'].forEach(function(key) {
        if (groups[key].length < 2) return;
        currentRoutePolylines.push(groups[key]);
        var poly = L.polyline(groups[key], {
          color: color,
          weight: 4.5,
          opacity: key === 'B' ? 0.75 : 0.95,
          lineJoin: 'round',
          dashArray: key === 'B' ? '8 6' : null
        }).addTo(selectedRoutePolylineGroup);
        bounds = bounds ? bounds.extend(poly.getBounds()) : poly.getBounds();
      });
      try {
        if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
      } catch (e) {}
    };

    // ─── Geometri / İzdüşüm & Çizgiye Oturtma (G1.2) ───
    var SNAP_POS_M = 200;
    var TELEPORT_M = 300;
    var BUS_SPEED_MS = 20 * 1000 / 3600; // 20 km/h ≈ 5.55 m/s

    function distMeters(lat1, lon1, lat2, lon2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    function calcAzimuth(lat1, lon1, lat2, lon2) {
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
      var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
      var brng = Math.atan2(y, x) * 180 / Math.PI;
      return (brng + 360) % 360;
    }

    function projectPointToSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
      var dx = bLon - aLon;
      var dy = bLat - aLat;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return { lat: aLat, lon: aLon, t: 0 };
      var t = ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return {
        lat: aLat + t * dy,
        lon: aLon + t * dx,
        t: t
      };
    }

    function snapToLines(lat, lon, lines) {
      var best = { snapped: false, lat: lat, lon: lon, dist: Infinity, azimuth: 0, lineIdx: -1, segIdx: -1 };
      if (!Array.isArray(lines) || lines.length === 0) return best;

      for (var lIdx = 0; lIdx < lines.length; lIdx++) {
        var pts = lines[lIdx];
        if (!pts || pts.length < 2) continue;
        for (var sIdx = 0; sIdx < pts.length - 1; sIdx++) {
          var p1 = pts[sIdx];
          var p2 = pts[sIdx + 1];
          var proj = projectPointToSegment(lat, lon, p1[0], p1[1], p2[0], p2[1]);
          var d = distMeters(lat, lon, proj.lat, proj.lon);
          if (d < best.dist) {
            best.dist = d;
            best.lat = proj.lat;
            best.lon = proj.lon;
            best.lineIdx = lIdx;
            best.segIdx = sIdx;
            best.azimuth = calcAzimuth(p1[0], p1[1], p2[0], p2[1]);
            if (d <= SNAP_POS_M) best.snapped = true;
          }
        }
      }
      return best;
    }

    // ─── Çizgi Üzerinde Yol Kurma (G1.3) ───
    function buildPathAlongPolyline(oldSnap, newSnap, polyline) {
      if (!polyline || polyline.length < 2) return null;
      var s1 = oldSnap.segIdx;
      var s2 = newSnap.segIdx;
      if (s1 === -1 || s2 === -1) return null;

      var path = [[oldSnap.lat, oldSnap.lon]];
      if (s1 <= s2) {
        for (var i = s1 + 1; i <= s2; i++) {
          path.push([polyline[i][0], polyline[i][1]]);
        }
      } else {
        // Geri gitme / ring hat durumu
        for (var i = s1; i >= s2 + 1; i--) {
          path.push([polyline[i][0], polyline[i][1]]);
        }
      }
      path.push([newSnap.lat, newSnap.lon]);

      // Toplam yol mesafesini hesapla
      var totalDist = 0;
      for (var j = 0; j < path.length - 1; j++) {
        totalDist += distMeters(path[j][0], path[j][1], path[j+1][0], path[j+1][1]);
      }
      var directDist = distMeters(oldSnap.lat, oldSnap.lon, newSnap.lat, newSnap.lon);

      // Yol düz mesafenin 3 katından uzunsa (yanlış kola oturma), düz geçişe düş (G1.3)
      if (totalDist > directDist * 3 && directDist > 30) return null;

      return { path: path, totalDist: totalDist };
    }

    // ─── Otobüs İşaretçileri & Animasyon Döngüsü (G1.1 & G1.11) ───
    var prefersReducedMotion = ${Boolean(reducedMotion)} || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var busMarkers = {}; // key -> { marker, data, currentPos, anim, stationaryCount }
    var animatingBuses = {};
    var followedVehicleKey = null;
    var lastGeneratedUtc = '';
    var animFrameId = null;
    var selectedVehicleKey = ${JSON.stringify(selectedVehicleKey || null)};

    function parseDateMs(dateStr) {
      if (!dateStr) return null;
      var direct = Date.parse(dateStr);
      if (!isNaN(direct)) return direct;
      var m = String(dateStr).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (m) {
        var d = new Date(
          parseInt(m[3], 10),
          parseInt(m[2], 10) - 1,
          parseInt(m[1], 10),
          parseInt(m[4] || '0', 10),
          parseInt(m[5] || '0', 10),
          parseInt(m[6] || '0', 10)
        );
        if (!isNaN(d.getTime())) return d.getTime();
      }
      return null;
    }

    function createBusHtml(b, isSelected, isDimmed, heading, isRouteMode) {
      var label = b.hatkodu || '';
      var color = getRouteColor(b.hatkodu);
      var plate = b.plaka || '';
      var zoom = map.getZoom();
      var hidePlateClass = zoom < 16 ? ' hidden-lod' : '';

      // G1.9 Hız rozeti: Hat modunda ikon yanında km/s etiketi (0 ise durakta)
      var speedBadge = '';
      if (isRouteMode && b.hiz !== undefined && b.hiz !== null) {
        var spd = Math.round(Number(b.hiz));
        var spdText = spd === 0 ? 'durakta' : spd + ' km/s';
        speedBadge = '<span class="bus-v2-speed-badge' + (spd === 0 ? ' stopped' : '') + '">' + esc(spdText) + '</span>';
      }

      var html = '<div class="bus-v2-marker' + (isSelected ? ' selected' : '') + (isDimmed ? ' dimmed' : '') + '">' +
        '<div class="bus-v2-top-row">' +
          '<div class="bus-v2-body" style="background:' + color + ';">' +
            '<div class="bus-v2-arrow" style="transform:rotate(' + (heading || 0) + 'deg)"></div>' +
            '<span>' + esc(label) + '</span>' +
          '</div>' +
          speedBadge +
        '</div>' +
        '<span class="bus-v2-plate' + hidePlateClass + '">' + esc(plate) + '</span>' +
      '</div>';
      return html;
    }

    function createBusIcon(b, isSelected, isDimmed, heading, isRouteMode) {
      return L.divIcon({
        className: '',
        html: createBusHtml(b, isSelected, isDimmed, heading, isRouteMode),
        iconSize: isSelected ? [36, 36] : [28, 28],
        iconAnchor: isSelected ? [18, 14] : [14, 13]
      });
    }

    function animationTick(now) {
      var keys = Object.keys(animatingBuses);
      if (keys.length === 0) {
        animFrameId = null;
        return;
      }

      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var item = busMarkers[key];
        if (!item || !item.anim) {
          delete animatingBuses[key];
          continue;
        }

        var anim = item.anim;
        var elapsed = now - anim.startTime;
        var t = Math.min(1, elapsed / anim.duration);

        // Yol boyunca konumu bul
        var curLat, curLon, curAzimuth;
        if (anim.subSegments && anim.subSegments.length > 0) {
          var targetDist = t * anim.totalDist;
          var accum = 0;
          var found = false;
          for (var s = 0; s < anim.subSegments.length; s++) {
            var seg = anim.subSegments[s];
            if (accum + seg.len >= targetDist || s === anim.subSegments.length - 1) {
              var segT = seg.len > 0 ? (targetDist - accum) / seg.len : 0;
              segT = Math.max(0, Math.min(1, segT));
              curLat = seg.p1[0] + segT * (seg.p2[0] - seg.p1[0]);
              curLon = seg.p1[1] + segT * (seg.p2[1] - seg.p1[1]);
              curAzimuth = seg.azimuth;
              found = true;
              break;
            }
            accum += seg.len;
          }
          if (!found) {
            curLat = anim.endLat;
            curLon = anim.endLon;
            curAzimuth = anim.subSegments[anim.subSegments.length - 1].azimuth;
          }
        } else {
          // Düz hat ara-değerleme
          curLat = anim.startLat + t * (anim.endLat - anim.startLat);
          curLon = anim.startLon + t * (anim.endLon - anim.startLon);
          curAzimuth = anim.azimuth;
        }

        item.currentPos = { lat: curLat, lon: curLon, azimuth: curAzimuth };
        item.marker.setLatLng([curLat, curLon]);

        // Ok yönünü güncelle
        var arrowEl = item.marker.getElement() ? item.marker.getElement().querySelector('.bus-v2-arrow') : null;
        if (arrowEl) arrowEl.style.transform = 'rotate(' + (curAzimuth || 0) + 'deg)';

        // Takip modu: kamera aracı izler (G2)
        if (followedVehicleKey && String(followedVehicleKey) === String(key)) {
          map.panTo([curLat, curLon], { animate: false });
        }

        if (t >= 1) {
          delete animatingBuses[key];
          item.anim = null;
        }
      }

      if (Object.keys(animatingBuses).length > 0) {
        animFrameId = requestAnimationFrame(animationTick);
      } else {
        animFrameId = null;
      }
    }

    function startAnimationLoop() {
      if (!animFrameId) animFrameId = requestAnimationFrame(animationTick);
    }

    window.updateBuses = function(busesList, generatedUtc) {
      if (!Array.isArray(busesList)) return;

      // Aynı anlık görüntü: generatedUtc değişmediyse dokunma (G1.6)
      if (generatedUtc && generatedUtc === lastGeneratedUtc) return;
      if (generatedUtc) lastGeneratedUtc = generatedUtc;

      var currentKeys = new Set();
      var now = performance.now();

      busesList.forEach(function(b) {
        var rawLat = parseFloat(b.enlem || b.latitude);
        var rawLon = parseFloat(b.boylam || b.longitude);
        if (isNaN(rawLat) || isNaN(rawLon) || rawLat === 0 || rawLon === 0) return;

        var key = String(b.key || b.plaka || (rawLat + ',' + rawLon));
        currentKeys.add(key);

        // Çizgiye oturtma (G1.2)
        var linesToSearch = currentRoutePolylines.length > 0 ? currentRoutePolylines : [];
        if (linesToSearch.length === 0 && storedOverviewRoutes.length > 0) {
          // Eşleşen hattın çizgilerini ara
          var matchedRoute = storedOverviewRoutes.find(function(r) {
            return (r.routeCode && b.hatkodu && r.routeCode.toUpperCase() === b.hatkodu.toUpperCase()) ||
                   (r.title && b.hatkodu && r.title === b.hatkodu);
          });
          if (matchedRoute && Array.isArray(matchedRoute.lines)) {
            linesToSearch = matchedRoute.lines.map(function(ln) {
              return ln.map(function(pt) { return [pt[1], pt[0]]; });
            });
          }
        }

        var snap = snapToLines(rawLat, rawLon, linesToSearch);
        var targetLat = snap.snapped ? snap.lat : rawLat;
        var targetLon = snap.snapped ? snap.lon : rawLon;
        var targetAzimuth = snap.snapped ? snap.azimuth : (b.yon ? Number(b.yon) : b.gpsDir ? Number(b.gpsDir) : 0);

        var isRouteMode = currentRoutePolylines.length > 0;

        // Hat modunda 200m'den uzaksa gizle (G1.2)
        if (isRouteMode && !snap.snapped) {
          if (busMarkers[key]) {
            busLayerGroup.removeLayer(busMarkers[key].marker);
            delete busMarkers[key];
            delete animatingBuses[key];
          }
          return;
        }

        // Hat modunda editDate 15 dk'dan eskiyse aracı gizle (G1.8)
        if (isRouteMode && b.editDate) {
          var editMs = parseDateMs(b.editDate);
          if (editMs && (Date.now() - editMs) > 15 * 60 * 1000) {
            if (busMarkers[key]) {
              busLayerGroup.removeLayer(busMarkers[key].marker);
              delete busMarkers[key];
              delete animatingBuses[key];
            }
            return;
          }
        }

        var isSelected = (selectedVehicleKey && String(selectedVehicleKey) === String(key));
        var speedVal = b.hiz != null ? Number(b.hiz) : null;
        var isDimmed = speedVal === 0;

        var existing = busMarkers[key];
        if (!existing) {
          // Yeni araç: belirme
          var icon = createBusIcon(b, isSelected, isDimmed, targetAzimuth, isRouteMode);
          var marker = L.marker([targetLat, targetLon], { icon: icon, zIndexOffset: isSelected ? 800 : 300 }).addTo(busLayerGroup);

          marker.on('click', function() {
            var payload = JSON.stringify({ type: 'vehiclePress', vehicle: b, key: key });
            if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
            else if (window.parent) window.parent.postMessage(payload, '*');
          });

          busMarkers[key] = {
            marker: marker,
            data: b,
            currentPos: { lat: targetLat, lon: targetLon, azimuth: targetAzimuth },
            anim: null,
            stationaryCount: 0
          };
        } else {
          // Var olan araç: hedef konumu güncelle & ara-değerleme (G1.1 & G1.3)
          var oldPos = existing.currentPos;
          var jumpDist = distMeters(oldPos.lat, oldPos.lon, targetLat, targetLon);

          // Hareketsizlik kontrolü (G1.8): 3 ardışık anlık görüntüde kıpırdamayan araç soluk
          if (jumpDist < 4) {
            existing.stationaryCount = (existing.stationaryCount || 0) + 1;
            if (existing.stationaryCount >= 3) isDimmed = true;
          } else {
            existing.stationaryCount = 0;
          }

          existing.data = b;
          existing.marker.setIcon(createBusIcon(b, isSelected, isDimmed, targetAzimuth, isRouteMode));

          if (jumpDist < 4) {
            // Neredeyse aynı nokta, animasyonsuz kal
            return;
          }

          // Sistemde animasyonları azalt açıksa (DESIGN_PLAN §2.4 reduced-motion)
          if (prefersReducedMotion) {
            existing.currentPos = { lat: targetLat, lon: targetLon, azimuth: targetAzimuth };
            existing.marker.setLatLng([targetLat, targetLon]);
            var arrowEl = existing.marker.getElement() ? existing.marker.getElement().querySelector('.bus-v2-arrow') : null;
            if (arrowEl) arrowEl.style.transform = 'rotate(' + (targetAzimuth || 0) + 'deg)';
            if (followedVehicleKey && String(followedVehicleKey) === String(key)) {
              map.panTo([targetLat, targetLon], { animate: false });
            }
            return;
          }

          if (jumpDist > TELEPORT_M) {
            // Işınlanma: 300m'den büyük sıçramada yanıp sönerek belir (G1.5)
            existing.currentPos = { lat: targetLat, lon: targetLon, azimuth: targetAzimuth };
            existing.marker.setLatLng([targetLat, targetLon]);
            var mEl = existing.marker.getElement();
            if (mEl) {
              var pEl = document.createElement('div');
              pEl.className = 'teleport-pulse';
              mEl.appendChild(pEl);
              setTimeout(function() { if (pEl.parentNode) pEl.parentNode.removeChild(pEl); }, 2000);
            }
            if (followedVehicleKey && String(followedVehicleKey) === String(key)) {
              map.panTo([targetLat, targetLon], { animate: true, duration: 0.8 });
            }
            return;
          }

          // Çizgi üzerinde yol kur (G1.3)
          var pathObj = null;
          if (snap.snapped && snap.lineIdx >= 0 && linesToSearch[snap.lineIdx]) {
            pathObj = buildPathAlongPolyline(
              { lat: oldPos.lat, lon: oldPos.lon, segIdx: snap.segIdx },
              snap,
              linesToSearch[snap.lineIdx]
            );
          }

          var pathDistance = pathObj ? pathObj.totalDist : jumpDist;
          // Süre = mesafe / 20 km/s, 1.5 - 45 sn kırpılır (G1.4)
          var duration = Math.max(1500, Math.min(45000, (pathDistance / BUS_SPEED_MS) * 1000));

          var subSegments = [];
          if (pathObj && pathObj.path.length >= 2) {
            for (var k = 0; k < pathObj.path.length - 1; k++) {
              var ptA = pathObj.path[k];
              var ptB = pathObj.path[k+1];
              subSegments.push({
                p1: ptA,
                p2: ptB,
                len: distMeters(ptA[0], ptA[1], ptB[0], ptB[1]),
                azimuth: calcAzimuth(ptA[0], ptA[1], ptB[0], ptB[1])
              });
            }
          }

          existing.anim = {
            startTime: now,
            duration: duration,
            startLat: oldPos.lat,
            startLon: oldPos.lon,
            endLat: targetLat,
            endLon: targetLon,
            totalDist: pathDistance,
            subSegments: subSegments,
            azimuth: targetAzimuth
          };
          animatingBuses[key] = true;
          startAnimationLoop();
        }
      });

      // Listeden düşen araçları kaldır (G1.1)
      Object.keys(busMarkers).forEach(function(k) {
        if (!currentKeys.has(k)) {
          busLayerGroup.removeLayer(busMarkers[k].marker);
          delete busMarkers[k];
          delete animatingBuses[k];
          if (followedVehicleKey && String(followedVehicleKey) === String(k)) {
            followedVehicleKey = null;
            var payload = JSON.stringify({ type: 'vehicleDropped', key: k });
            if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
          }
        }
      });
    };

    window.selectVehicle = function(key) {
      selectedVehicleKey = key ? String(key) : null;
      Object.keys(busMarkers).forEach(function(k) {
        var item = busMarkers[k];
        var isSel = (selectedVehicleKey && String(selectedVehicleKey) === String(k));
        var speedVal = item.data.hiz != null ? Number(item.data.hiz) : null;
        var isDim = speedVal === 0 || (item.stationaryCount >= 3);
        item.marker.setIcon(createBusIcon(item.data, isSel, isDim, item.currentPos.azimuth));
        item.marker.setZIndexOffset(isSel ? 800 : 300);
      });
    };

    window.setFollowVehicle = function(key) {
      followedVehicleKey = key ? String(key) : null;
      if (followedVehicleKey && busMarkers[followedVehicleKey]) {
        var pos = busMarkers[followedVehicleKey].currentPos;
        map.panTo([pos.lat, pos.lon], { animate: true, duration: 0.6 });
      }
    };

    // yShift: ekranın alt kısmı panel ile kaplıyken hedefi görünür alanın ortasına getirmek için
    // haritanın yüksekliğinin bu oranı kadar yukarı kaydırılır (0.23 ≈ yarım açık panel).
    window.panToLocation = function(lat, lng, zoomLevel, yShift) {
      if (lat && lng) {
        var z = zoomLevel || 16;
        if (yShift) {
          var pt = map.project([lat, lng], z);
          var target = map.unproject([pt.x, pt.y + map.getSize().y * yShift], z);
          map.setView(target, z, { animate: true, duration: 0.8 });
        } else {
          map.setView([lat, lng], z, { animate: true, duration: 0.8 });
        }
      }
    };

    // Zoom seviyesine göre plaka etiketlerini göster/gizle (G1.10 LOD)
    function updateLOD() {
      var zoom = map.getZoom();
      var plates = document.querySelectorAll('.bus-v2-plate');
      for (var i = 0; i < plates.length; i++) {
        if (zoom < 16) plates[i].classList.add('hidden-lod');
        else plates[i].classList.remove('hidden-lod');
      }
    }
    map.on('zoomend', updateLOD);

    // Kullanıcı haritayı elle sürükleyince takip modunu durdur (G2)
    map.on('dragstart', function() {
      if (followedVehicleKey) {
        followedVehicleKey = null;
        var msg = JSON.stringify({ type: 'followCancel' });
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
        else if (window.parent) window.parent.postMessage(msg, '*');
      }
    });

    map.on('click', function(e) {
      var msg = JSON.stringify({ type: 'mapTap' });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      else if (window.parent) window.parent.postMessage(msg, '*');
    });

    if (overviewLines && overviewLines.length > 0) {
      window.setOverviewLines(overviewLines);
    }
    if (Array.isArray(${JSON.stringify(buses)})) {
      window.updateBuses(${JSON.stringify(buses)});
    }

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

export const LeafletMap = forwardRef<LeafletMapRef, LeafletMapProps>(function LeafletMap(
  {
    markers = [],
    markerType = 'mixed',
    center = ELAZIG_CENTER,
    zoom = 14,
    selectedId = null,
    selectedVehicleKey = null,
    userLocation = null,
    buses = [],
    overviewLines = [],
    enableClustering = true,
    onMarkerPress,
    onVehiclePress,
    onFollowCancel,
    onMapTap,
    onMapReady,
    onDirectionsPress,
    style,
    title = 'Elazığ Haritası',
    customHtml,
    reducedMotion = false,
  },
  ref
) {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const isMapReadyRef = useRef(false);

  const pendingRef = useRef<{
    markers?: [LeafletMarkerItem[], string | number | null];
    buses?: [any[], string?];
    polyline?: [any[], string?];
    overviewLines?: any[];
    userLoc?: any;
    selectedVehicle?: string | null;
    followedVehicle?: string | null;
  }>({});

  const initialHtml = useMemo(() => {
    if (customHtml) return customHtml;
    return buildLeafletHtml({
      markers,
      markerType,
      center,
      zoom,
      selectedId,
      selectedVehicleKey,
      userLocation,
      buses,
      overviewLines,
      enableClustering,
      reducedMotion,
    });
    // Build HTML only once to prevent reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    panToLocation: (lat, lng, zoomLevel = 16, yShift = 0) => {
      const js = `if (window.panToLocation) { window.panToLocation(${lat}, ${lng}, ${zoomLevel}, ${yShift}); } true;`;
      webViewRef.current?.injectJavaScript(js);
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage?.({ type: 'panTo', lat, lng, zoomLevel }, '*');
      }
    },
    toggleBaseLayer: () => {
      webViewRef.current?.injectJavaScript('if (window.toggleBaseLayer) { window.toggleBaseLayer(); } true;');
    },
    updateUserLocation: (loc) => {
      pendingRef.current.userLoc = loc;
      const js = `if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(loc)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    updateMarkers: (newMarkers, selId = null) => {
      pendingRef.current.markers = [newMarkers, selId];
      const js = `if (window.updateMarkers) { window.updateMarkers(${JSON.stringify(newMarkers)}, ${JSON.stringify(selId)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    updateBuses: (busList, generatedUtc = '') => {
      pendingRef.current.buses = [busList, generatedUtc];
      const js = `if (window.updateBuses) { window.updateBuses(${JSON.stringify(busList)}, ${JSON.stringify(generatedUtc)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    updateRoutePolyline: (coords, selectedRouteCode = '') => {
      pendingRef.current.polyline = [coords, selectedRouteCode];
      const js = `if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(coords)}, ${JSON.stringify(selectedRouteCode)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    setOverviewLines: (routes) => {
      pendingRef.current.overviewLines = routes;
      const js = `if (window.setOverviewLines) { window.setOverviewLines(${JSON.stringify(routes)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    selectMarker: (id) => {
      const js = `if (window.selectMarker) { window.selectMarker(${JSON.stringify(id)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    selectVehicle: (key) => {
      pendingRef.current.selectedVehicle = key;
      const js = `if (window.selectVehicle) { window.selectVehicle(${JSON.stringify(key)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    setFollowVehicle: (key) => {
      pendingRef.current.followedVehicle = key;
      const js = `if (window.setFollowVehicle) { window.setFollowVehicle(${JSON.stringify(key)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    injectJavaScript: (js) => {
      webViewRef.current?.injectJavaScript(js);
    },
  }));

  // markers / selectedId prop'u degisince WebView'daki isaretcileri guncelle
  // (ilk HTML bir kez kurulur; duraklar sonradan yuklendiginde bu effect olmadan harita bos kalir)
  const isFirstMarkersRef = useRef(true);
  useEffect(() => {
    if (isFirstMarkersRef.current) {
      isFirstMarkersRef.current = false;
      if (markers.length === 0) return; // ilk HTML zaten bu listeyle kuruldu
    }
    pendingRef.current.markers = [markers, selectedId];
    if (isMapReadyRef.current) {
      webViewRef.current?.injectJavaScript(
        `if (window.updateMarkers) { window.updateMarkers(${JSON.stringify(markers)}, ${JSON.stringify(selectedId)}); } true;`
      );
    }
  }, [markers, selectedId]);

  const flushPending = () => {
    const p = pendingRef.current;
    const inject = (js: string) => webViewRef.current?.injectJavaScript(js);
    if (p.overviewLines) inject(`if (window.setOverviewLines) { window.setOverviewLines(${JSON.stringify(p.overviewLines)}); } true;`);
    if (p.polyline) inject(`if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(p.polyline[0])}, ${JSON.stringify(p.polyline[1] || '')}); } true;`);
    if (p.markers) inject(`if (window.updateMarkers) { window.updateMarkers(${JSON.stringify(p.markers[0])}, ${JSON.stringify(p.markers[1])}); } true;`);
    if (p.buses) inject(`if (window.updateBuses) { window.updateBuses(${JSON.stringify(p.buses[0])}, ${JSON.stringify(p.buses[1] || '')}); } true;`);
    if (p.selectedVehicle !== undefined) inject(`if (window.selectVehicle) { window.selectVehicle(${JSON.stringify(p.selectedVehicle)}); } true;`);
    if (p.followedVehicle !== undefined) inject(`if (window.setFollowVehicle) { window.setFollowVehicle(${JSON.stringify(p.followedVehicle)}); } true;`);
    if (p.userLoc) inject(`if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(p.userLoc)}); } true;`);
  };

  const handleMessageString = (raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'mapReady') {
        const first = !isMapReadyRef.current;
        isMapReadyRef.current = true;
        if (first) flushPending();
        onMapReady?.();
      } else if (data.type === 'mapTap') {
        onMapTap?.();
      } else if (data.type === 'markerPress' && data.marker) {
        onMarkerPress?.(data.marker);
      } else if (data.type === 'vehiclePress' && data.vehicle) {
        onVehiclePress?.(data.vehicle);
      } else if (data.type === 'followCancel') {
        onFollowCancel?.();
      } else if (data.type === 'directions') {
        if (onDirectionsPress) {
          onDirectionsPress(data.lat, data.lng, data.name);
        } else {
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}`);
        }
      }
    } catch {
      // ignore
    }
  };

  const handlerRef = useRef(handleMessageString);
  handlerRef.current = handleMessageString;
  useEffect(() => {
    if (Platform.OS === 'web') {
      const webHandler = (ev: MessageEvent) => {
        if (typeof ev.data === 'string') handlerRef.current(ev.data);
      };
      window.addEventListener('message', webHandler);
      return () => window.removeEventListener('message', webHandler);
    }
  }, []);

  return (
    <View style={[styles.container, style]}>
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          ref: iframeRef,
          srcDoc: initialHtml,
          style: { width: '100%', height: '100%', border: 'none' },
          title,
        })
      ) : (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: initialHtml }}
          style={styles.webView}
          onMessage={(e) => handleMessageString(e.nativeEvent.data)}
          onLoadEnd={() => {
            setTimeout(() => {
              const first = !isMapReadyRef.current;
              isMapReadyRef.current = true;
              if (first) flushPending();
              onMapReady?.();
            }, 300);
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
        />
      )}
    </View>
  );
});

export default LeafletMap;

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.isDark ? '#0B1220' : '#e5eeff',
  },
  webView: {
    flex: 1,
    backgroundColor: Theme.colors.isDark ? '#0B1220' : '#e5eeff',
  },
}));
