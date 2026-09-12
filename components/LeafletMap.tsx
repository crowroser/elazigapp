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
  userLocation?: { lat: number; lng: number } | null;
  buses?: any[];
  enableClustering?: boolean;
}

export interface LeafletMapRef {
  panToLocation: (lat: number, lng: number, zoom?: number) => void;
  updateUserLocation: (loc: { lat: number; lng: number } | null) => void;
  updateMarkers: (markers: LeafletMarkerItem[], selectedId?: string | number | null) => void;
  updateBuses: (buses: any[]) => void;
  updateRoutePolyline: (coords: any[]) => void;
  selectMarker: (id: string | number | null) => void;
  injectJavaScript: (js: string) => void;
}

export interface LeafletMapProps {
  markers?: LeafletMarkerItem[];
  markerType?: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom';
  center?: { lat: number; lng: number };
  zoom?: number;
  selectedId?: string | number | null;
  userLocation?: { lat: number; lng: number } | null;
  buses?: any[];
  enableClustering?: boolean;
  onMarkerPress?: (marker: LeafletMarkerItem) => void;
  onMapTap?: () => void;
  onMapReady?: () => void;
  onDirectionsPress?: (lat: number, lng: number, name?: string) => void;
  style?: StyleProp<ViewStyle>;
  title?: string;
  customHtml?: string;
}

const ELAZIG_CENTER = { lat: 38.6748, lng: 39.2225 };

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
  let userLocation = userLocationArg;
  let markerType: 'station' | 'kiosk' | 'bayi' | 'mixed' | 'custom' = 'station';
  let enableClustering = true;
  let zoom = 14;

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
    userLocation = stationsOrOptions.userLocation;
    markerType = stationsOrOptions.markerType || 'mixed';
    enableClustering = stationsOrOptions.enableClustering ?? true;
    zoom = stationsOrOptions.zoom || 14;
  }

  const dark = Theme.colors.isDark;
  const mapBg = dark ? '#0B1220' : '#e5eeff';
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
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${mapBg}; }
    .leaflet-container { background: ${mapBg}; font-family: Inter, system-ui, sans-serif; }
    .dark-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.92) saturate(0.55); }
    
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

    /* Kiosk (Kart Dolum Otomatı) marker */
    .kiosk-marker {
      width: 30px; height: 30px; border-radius: 10px;
      background: #0061a5; border: 2px solid #ffffff;
      box-shadow: 0 3px 8px rgba(0,32,69,0.35);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.2s ease;
      font-size: 15px; color: #fff;
    }
    .kiosk-marker.selected {
      transform: scale(1.25);
      background: #0284c7;
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 6px rgba(2, 132, 199, 0.45);
      z-index: 1000 !important;
    }

    /* Bayi (Yetkili Satış/Paso Bürosu) marker */
    .bayi-marker {
      width: 30px; height: 30px; border-radius: 10px;
      background: #6b21a8; border: 2px solid #ffffff;
      box-shadow: 0 3px 8px rgba(107,33,168,0.35);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.2s ease;
      font-size: 15px; color: #fff;
    }
    .bayi-marker.selected {
      transform: scale(1.25);
      background: #9333ea;
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 6px rgba(147, 51, 234, 0.45);
      z-index: 1000 !important;
    }
    
    /* Cluster styling */
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
    .popup-chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
    .chip-kiosk { background: #e0f2fe; color: #0369a1; }
    .chip-bayi { background: #f3e8ff; color: #7e22ce; }
    .directions-btn {
      margin-top: 8px; width: 100%; background: #0061a5; color: #ffffff;
      border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px;
      font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
    }
    .directions-btn:active { background: #004d84; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${center.lat}, ${center.lng}], ${zoom});

    // Koyu temada OSM karoları CSS filtresiyle karartılır (anahtarsız karo servisi yok); uydu katmanı filtrelenmez
    var streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'OpenStreetMap',
      className: ${dark ? "'dark-tiles'" : "''"}
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

    // MarkerCluster or LayerGroup Setup
    var enableCluster = ${enableClustering ? 'true' : 'false'};
    var markerContainer;
    if (enableCluster && typeof L.markerClusterGroup === 'function') {
      markerContainer = L.markerClusterGroup({
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
          iconSize: isSelected ? [34, 34] : [30, 30],
          iconAnchor: isSelected ? [17, 17] : [15, 15]
        });
      } else if (itype === 'bayi' || (item.tip && item.tip.toUpperCase() === 'B')) {
        return L.divIcon({
          className: '',
          html: '<div class="bayi-marker' + (isSelected ? ' selected' : '') + '">🏪</div>',
          iconSize: isSelected ? [34, 34] : [30, 30],
          iconAnchor: isSelected ? [17, 17] : [15, 15]
        });
      }
      // Default: station marker
      return L.divIcon({
        className: '',
        html: '<div class="station-marker' + (isSelected ? ' selected' : '') + '"></div>',
        iconSize: isSelected ? [22, 22] : [16, 16],
        iconAnchor: isSelected ? [11, 11] : [8, 8]
      });
    }

    // Sunucudan gelen metinler (isim/adres) HTML'e ham basılmaz; tırnak ve etiketler kaçırılır
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
        // Yol tarifi düğmesi: değerler data-* özniteliklerinde, tıklama delegasyonla yakalanır
        var html = "<div class='popup-title'>" + esc(item.name) + "</div>" +
          "<div style='display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;'>" +
            "<span class='popup-chip " + chipClass + "'>" + esc(chipLabel) + "</span>" +
            (item.distanceText ? "<span style='font-size:11px;color:#0061a5;font-weight:700;'>" + esc(item.distanceText) + "</span>" : "") +
          "</div>" +
          (item.address ? "<div style='font-size:11px;color:#475569;margin-top:4px;line-height:1.3;'>" + esc(item.address) + "</div>" : "") +
          (item.phone ? "<div style='font-size:11px;color:#475569;margin-top:2px;'>📞 " + esc(item.phone) + "</div>" : "") +
          "<button class='directions-btn' data-lat='" + Number(item.lat) + "' data-lng='" + Number(item.lng) + "' data-name='" + esc(item.name) + "'>🧭 Yol Tarifi</button>";
        return html;
      }

      // Transit Station
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
          var stationPayload = JSON.stringify({ type: 'station', id: item.id });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(payload);
            window.ReactNativeWebView.postMessage(stationPayload);
          } else if (window.parent) {
            window.parent.postMessage(payload, '*');
            window.parent.postMessage(stationPayload, '*');
          }
        });

        markerMap[String(item.id)] = marker;
        markerContainer.addLayer(marker);
      });
    }

    var initialMarkers = ${JSON.stringify(markers)};
    renderMarkers(initialMarkers, currentSelectedId);

    window.updateMarkers = function(newItems, selId) {
      renderMarkers(newItems, selId);
    };

    window.selectMarker = function(id) {
      if (!id) return;
      var strId = String(id);
      var m = markerMap[strId];
      if (m) {
        if (typeof markerContainer.zoomToShowLayer === 'function') {
          markerContainer.zoomToShowLayer(m, function() {
            m.openPopup();
          });
        } else {
          m.openPopup();
        }
      }
    };

    window.openDirections = function(lat, lng, name) {
      var payload = JSON.stringify({ type: 'directions', lat: lat, lng: lng, name: name });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(payload);
      } else if (window.parent) {
        window.parent.postMessage(payload, '*');
      }
    };

    window.updateRoutePolyline = function(coords) {
      polylineLayer.clearLayers();
      if (!Array.isArray(coords) || coords.length === 0) return;
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
        map.setView([lat, lng], zoomLevel || 16, { animate: true, duration: 0.8 });
      }
    };

    window.updateBuses(${JSON.stringify(buses)});

    map.on('click', function(e) {
      var msg = JSON.stringify({ type: 'mapTap' });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      else if (window.parent) window.parent.postMessage(msg, '*');
    });

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
    userLocation = null,
    buses = [],
    enableClustering = true,
    onMarkerPress,
    onMapTap,
    onMapReady,
    onDirectionsPress,
    style,
    title = 'Elazığ Haritası',
    customHtml,
  },
  ref
) {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const isMapReadyRef = useRef(false);
  // Harita hazır olmadan gelen işaretçi/otobüs güncellemeleri burada bekletilir ve mapReady'de uygulanır
  const pendingRef = useRef<{ markers?: [LeafletMarkerItem[], string | number | null]; buses?: any[]; polyline?: any[]; userLoc?: any }>({});

  const initialHtml = useMemo(() => {
    if (customHtml) return customHtml;
    return buildLeafletHtml({
      markers,
      markerType,
      center,
      zoom,
      selectedId,
      userLocation,
      buses,
      enableClustering,
    });
    // Build HTML only once to prevent reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    panToLocation: (lat, lng, zoomLevel = 16) => {
      const js = `if (window.panToLocation) { window.panToLocation(${lat}, ${lng}, ${zoomLevel}); } true;`;
      webViewRef.current?.injectJavaScript(js);
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage?.({ type: 'panTo', lat, lng, zoomLevel }, '*');
      }
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
    updateBuses: (busList) => {
      pendingRef.current.buses = busList;
      const js = `if (window.updateBuses) { window.updateBuses(${JSON.stringify(busList)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    updateRoutePolyline: (coords) => {
      pendingRef.current.polyline = coords;
      const js = `if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(coords)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    selectMarker: (id) => {
      const js = `if (window.selectMarker) { window.selectMarker(${JSON.stringify(id)}); } true;`;
      webViewRef.current?.injectJavaScript(js);
    },
    injectJavaScript: (js) => {
      webViewRef.current?.injectJavaScript(js);
    },
  }));

  /** Harita hazır olunca, hazır olmadan gönderilmiş son durumu yeniden uygular */
  const flushPending = () => {
    const p = pendingRef.current;
    const inject = (js: string) => webViewRef.current?.injectJavaScript(js);
    if (p.markers) inject(`if (window.updateMarkers) { window.updateMarkers(${JSON.stringify(p.markers[0])}, ${JSON.stringify(p.markers[1])}); } true;`);
    if (p.buses) inject(`if (window.updateBuses) { window.updateBuses(${JSON.stringify(p.buses)}); } true;`);
    if (p.polyline) inject(`if (window.updateRoutePolyline) { window.updateRoutePolyline(${JSON.stringify(p.polyline)}); } true;`);
    if (p.userLoc) inject(`if (window.updateUserLocation) { window.updateUserLocation(${JSON.stringify(p.userLoc)}); } true;`);
  };

  // Handle incoming message from webview / iframe
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

  // Dinleyici bir kez kaydedilir ama her zaman en güncel prop'lu işleyiciyi çağırır
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
