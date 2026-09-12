import { XMLParser } from 'fast-xml-parser';
import { cached, CACHE_TTL, CachedResult } from './cacheService';

export type { CachedResult };

export interface WeatherData {
  tempC: number;
  conditionText: string;
  conditionTr: string;
  humidity: number;
  windKph: number;
  icon: string;
}

export interface CardBalanceResult {
  success: boolean;
  adSoyad?: string;
  kartTipi?: string;
  bakiye?: number;
  bekleyenBakiye?: number;
  kartDurumu?: string;
  sonIslemTarihi?: string;
  gecerlilik?: string;
  message?: string;
}

export interface RouteLineItem {
  /** Sunucu tarafındaki sayısal hat id'si (variants/vehicles/stations çağrıları için) */
  id?: number;
  kod: string;
  aciklama: string;
  hatNo: number;
}

export interface RouteVariantItem {
  id: number;
  title: string;
  directionTypeTitle: string;
  routeVariantCode: string;
  isBaseLineVariant: boolean;
  /** GeoJSON LineString koordinatları [lng, lat] */
  coordinates: Array<[number, number]>;
}

export interface RouteCoordinateItem {
  latitude: number;
  longitude: number;
  sequence: number;
  route: string;
  routeDirection: 'F' | 'B';
}

export interface RouteStopItem {
  stopId: number;
  stopName: string;
  sequence: number;
  latitude: number;
  longitude: number;
  direction: string;
}

/** Bir hattın tek yön varyantındaki sıralı duraklar (rota planlayıcı ağı) */
export interface RouteVariantStops {
  variantId: number;
  /** 'G' (Gidiş) | 'D' (Dönüş) | sunucudaki diğer varyant kodları */
  direction: string;
  title: string;
  stops: RouteStopItem[];
  /** Sunucuda olmayan, gidiş dizilimi ters çevrilerek türetilmiş dönüş yönü (rota planlayıcı) */
  inferred?: boolean;
}

export interface TransitNetworkRoute {
  id: number;
  kod: string;
  hatNo: number;
  aciklama: string;
  variants: RouteVariantStops[];
}

export interface RoutePriceItem {
  routeCode: string;
  description: string;
  cardType: string;
  price: number;
}

export interface RouteScheduleItem {
  sequenceNumber: number;
  stationName: string;
  routeCode: string;
  time: string;
  plannedStationIn?: string;
  hour?: number;
  minute?: number;
  direction: string;
  ring?: boolean;
}

export interface RealtimeBusInfo {
  state?: number;
  plaka?: string;
  surucu?: string;
  hiz?: number;
  maxHiz?: number;
  mesafe?: number;
  klimaVarMi?: boolean;
  engelliUygunMu?: boolean;
  durakYolcu?: number;
  seferYolcu?: number;
  gunlukYolcu?: number;
  istikamet?: string;
  yon?: number;
  renk?: string;
  imageUrl?: string;
  enlem: number;
  boylam: number;
  hatkodu?: string;
  validatorNo?: number | string;
  editDate?: string;
}

export interface StationBusInfo {
  busLineCode: string;
  busLineNo: string | number;
  busLineShortName?: string;
  /** Hattın tam adı / istikameti (ör. "1 Apasa  Hastane") */
  busLineLongName?: string;
  panelId?: number;
  routeId?: number;
  remainingTimeCurr: number | null;
  remainingTimeNext: number | null;
  /** Otobüsün durağa kaç durak uzakta olduğu (sunucu bilmiyorsa null) */
  remainingNumberOfBusStops?: number | null;
  busPlate?: string | null;
  routeVariantCode?: string | null;
  routeVariantId?: number | null;
  isAccordingToTimeSchedule?: string;
  busStatusCurr?: number;
  busStatusNext?: number;
}

export interface FillingCenter {
  id: number;
  /** 'K' = Kiosk, diğerleri = Bayi / Büro (site ile aynı ayrım) */
  tip: string;
  tipLabel: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
}

export interface BusStation {
  id: string;
  name: string;
  code: string;
  direction: string;
  lat?: number;
  lng?: number;
  lines: string[];
  nextBusMinutes?: number;
  nearestBus?: RealtimeBusInfo;
  stationBuses?: StationBusInfo[];
}

export interface BusRoute {
  lineNo: string;
  routeCode?: string;
  routeName: string;
  departureTimes: string[];
  mainStops: string[];
  priceInfo?: string;
  totalStops?: number;
  routeCoordinates?: RouteCoordinateItem[];
  stops?: RouteStopItem[];
  prices?: RoutePriceItem[];
  schedules?: RouteScheduleItem[];
}

export interface MenuItem {
  name: string;
  category: string;
  calories?: number;
  icon: string;
}

export interface DiningMenu {
  date: string;
  lunch: MenuItem[];
  dinner: MenuItem[];
  priceStudent: string;
  priceStaff: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  phone: string;
  district: string;
  dutyHours: string;
  lat?: number;
  lng?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  snippet: string;
  date: string;
  link: string;
  category: string;
  imageUrl?: string;
}

export interface AcademicAnnouncement {
  id: string;
  unit: string;
  title: string;
  date: string;
  link: string;
}

export interface AnnouncementDetailData {
  title: string;
  unit: string;
  date: string;
  views: string;
  paragraphs: string[];
  attachments: Array<{ name: string; url: string; size?: string; type: string }>;
  link: string;
  imageUrl?: string;
}

export interface PrayerTime {
  name: string;
  nameTr: string;
  time: string;
  isNext?: boolean;
}

export interface OutageItem {
  id: string;
  type: 'electric' | 'water';
  title: string;
  region: string;
  startTime: string;
  endTime: string;
  description: string;
}

// 33 Fakülte ve Yüksekokul subdomain haritası (N8N workflow)
export const FIRAT_UNI_UNITS: Record<string, string> = {
  baskil: "Baskil Meslek Yüksekokulu",
  disf: "Diş Hekimliği Fakültesi",
  eczacilikf: "Eczacılık Fakültesi",
  egitim: "Eğitim Bilimleri Enstitüsü",
  egitimf: "Eğitim Fakültesi",
  fen: "Fen Bilimleri Enstitüsü",
  fenf: "Fen Fakültesi",
  iibf: "İktisadi ve İdari Bilimler Fakültesi",
  ilahiyatf: "İlahiyat Fakültesi",
  iletisimf: "İletişim Fakültesi",
  isbf: "İnsani ve Sosyal Bilimler Fakültesi",
  karakocan: "Karakoçan Meslek Yüksekokulu",
  keban: "Keban Meslek Yüksekokulu",
  kovancilar: "Kovancılar Meslek Yüksekokulu",
  kyo: "Devlet Konservatuvarı",
  mimarlikf: "Mimarlık Fakültesi",
  muhendislikf: "Mühendislik Fakültesi",
  saglik: "Sağlık Bilimleri Enstitüsü",
  saglikf: "Sağlık Bilimleri Fakültesi",
  saglikmyo: "Sağlık Hizmetleri Meslek Yüksekokulu",
  sivilhavacilik: "Sivil Havacılık Yüksekokulu",
  sivrice: "Sivrice Meslek Yüksekokulu",
  sosyal: "Sosyal Bilimler Enstitüsü",
  sosyalmyo: "Sosyal Bilimler Meslek Yüksekokulu",
  sporbilimlerif: "Spor Bilimleri Fakültesi",
  suuf: "Su Ürünleri Fakültesi",
  tef: "Teknik Eğitim Fakültesi",
  teknik: "Teknik Bilimler Meslek Yüksekokulu",
  teknolojif: "Teknoloji Fakültesi",
  tip: "Tıp Fakültesi",
  veterinerf: "Veteriner Fakültesi",
  yabancidiller: "Yabancı Diller Yüksekokulu",
  yazilimtf: "Teknoloji Yazılım Fakültesi",
};

/**
 * ELAZIĞKART (elazigkart.elazig.bel.tr) — Eylül 2026 itibarıyla site tamamen yenilendi (v1.30).
 * Eski POST /api/static/* ve /api/card/usercardinfocore uçları kaldırıldı (404/403).
 * Yeni uçlar GET tabanlı JSON döner ve Referer başlığı olmadan 403 "Access denied." verir:
 *   /api/wheremybus/routes                 → hat listesi
 *   /api/wheremybus/variants/{routeId}     → yön varyantları (+ GeoJSON güzergah)
 *   /api/wheremybus/vehicles/{variantId}   → canlı araçlar
 *   /api/wheremybus/stations/{variantId}   → varyant durakları
 *   /api/wheremybus/schedule/{variantId}/{haftaGunu 1-7}
 *   /api/wheremybus/price/{routeCode}
 *   /api/smartstop/stations                → tüm duraklar
 *   /api/smartstop/approaching/{stopId}    → durağa yaklaşan otobüsler
 *   /api/balance/inquiry (POST, antiforgery token + cookie zorunlu)
 */
const ELAZIGKART_BASE = 'https://elazigkart.elazig.bel.tr';
const ELAZIGKART_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

const ELAZIGKART_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent': ELAZIGKART_UA,
  referer: `${ELAZIGKART_BASE}/WhereMyBus`,
  origin: ELAZIGKART_BASE,
};

/** Sunucunun bazı uçlarda (price) ürettiği Windows-1254 → UTF-8 mojibake'i onarır ("Ã‡ÄRENCÄ°" → "ÖĞRENCİ"). */
function fixMojibake(str: any): string {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  if (!/[\u00C3\u00C4\u00C5][\u0080-\u00BF\u0152\u0153\u0160\u0161\u017D\u017E\u0178\u02C6\u02DC\u2013-\u203A\u20AC\u2122]/.test(str)) return str;
  try {
    const fixed = decodeURIComponent(escape(str));
    return fixed || str;
  } catch {
    return str;
  }
}

/** Yeni API zarfını açar: {version, statusCode, result:{...}} → result */
function unwrapEnvelope(data: any): any {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'result' in data) {
    return data.result;
  }
  return data;
}

async function fetchElazigKartJson(path: string, retryCount = 1): Promise<any> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${ELAZIGKART_BASE}${cleanPath}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: ELAZIGKART_HEADERS });

    // 429 (hız sınırı) ve 502/503 (belediyenin arka servisi aralıklı düşüyor) için kısa bekleyip tekrar dene
    if ((res.status === 429 || res.status === 502 || res.status === 503) && retryCount > 0) {
      await new Promise((r) => setTimeout(r, res.status === 429 ? 1200 : 2000));
      return fetchElazigKartJson(path, retryCount - 1);
    }
    if (!res.ok) {
      console.log(`ElazığKart API HTTP ${res.status} [${cleanPath}]`);
      return null;
    }

    const text = await res.text();
    try {
      return unwrapEnvelope(JSON.parse(text));
    } catch {
      return null;
    }
  } catch (e) {
    console.log(`ElazığKart API hatası [${cleanPath}]:`, e);
    return null;
  }
}

// Hat kodu → sunucu id ve varyant önbelleği (her hat için tekrar tekrar sorgu atmamak için)
let routeCatalogCache: RouteLineItem[] = [];
const routeVariantsCache = new Map<number, RouteVariantItem[]>();
let transitNetworkInFlight: Promise<TransitNetworkRoute[]> | null = null;

function normalizeRouteKey(value: string): string {
  return (value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/i̇/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveRoute(routeCodeOrNo: string): Promise<RouteLineItem | null> {
  const q = String(routeCodeOrNo || '').trim();
  if (!q) return null;
  if (routeCatalogCache.length === 0) {
    routeCatalogCache = await ApiService.getAllRoutes();
  }
  const qNorm = normalizeRouteKey(q);
  return (
    routeCatalogCache.find((r) => normalizeRouteKey(r.kod) === qNorm) ||
    routeCatalogCache.find((r) => String(r.hatNo) === q) ||
    routeCatalogCache.find((r) => String(r.id) === q) ||
    null
  );
}

function parseGeoJsonLine(geom: any): Array<[number, number]> {
  try {
    const obj = typeof geom === 'string' ? JSON.parse(geom) : geom;
    const coords = obj?.coordinates;
    if (Array.isArray(coords)) {
      return coords
        .filter((c: any) => Array.isArray(c) && c.length >= 2)
        .map((c: any) => [Number(c[0]), Number(c[1])] as [number, number])
        .filter((c: [number, number]) => !isNaN(c[0]) && !isNaN(c[1]));
    }
  } catch {
    // geçersiz geom
  }
  return [];
}

async function getRouteVariants(routeId: number): Promise<RouteVariantItem[]> {
  const cached = routeVariantsCache.get(routeId);
  if (cached) return cached;

  const data = await fetchElazigKartJson(`/api/wheremybus/variants/${encodeURIComponent(String(routeId))}`);
  const node = data?.route?.[0] || {};
  const list: any[] = Array.isArray(node.routeVariants) ? node.routeVariants : [];
  const variants: RouteVariantItem[] = list.map((v: any) => ({
    id: Number(v.id),
    title: fixMojibake(v.title || v.description || v.routeVariantCode || ''),
    directionTypeTitle: fixMojibake(v.directionTypeTitle || ''),
    routeVariantCode: String(v.routeVariantCode || v.variantCode || ''),
    isBaseLineVariant: v.isBaseLineVariant === true,
    coordinates: parseGeoJsonLine(v.geom),
  }));

  if (variants.length > 0) routeVariantsCache.set(routeId, variants);
  return variants;
}

function pickBaselineVariant(variants: RouteVariantItem[]): RouteVariantItem | null {
  return (
    variants.find((v) => v.isBaseLineVariant) ||
    variants.find((v) => v.directionTypeTitle === 'Gidiş' || v.routeVariantCode === 'G') ||
    variants[0] ||
    null
  );
}

function mapVehicle(v: any, fallbackRouteCode: string): RealtimeBusInfo | null {
  const lat = Number(v.latitude ?? v.enlem);
  const lng = Number(v.longitude ?? v.boylam);
  if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
  const dir = v.istikamet || v.direction || '';
  return {
    plaka: String(v.licencePlate || v.plaka || v.plate || '').trim(),
    hiz: v.hiz !== undefined ? Number(v.hiz) : v.speed !== undefined ? Number(v.speed) : 0,
    istikamet: dir === 'G' ? 'Gidiş' : dir === 'D' ? 'Dönüş' : String(dir),
    yon: Number(v.gpsDir ?? v.yon ?? v.dir ?? v.heading ?? 0) || 0,
    enlem: lat,
    boylam: lng,
    hatkodu: fixMojibake(v.routeCode || fallbackRouteCode),
    validatorNo: v.validatorNo,
    editDate: v.editDate || new Date().toISOString(),
  };
}

export function mapStation(st: any): BusStation {
  const stationId = String(st.id ?? st.stationId ?? st.stopNo);
  return {
    id: stationId,
    name: fixMojibake(st.stopTitle || st.title || st.shortTitle || st.description || `Durak ${stationId}`).trim(),
    code: String(st.stopNo || stationId),
    direction: fixMojibake(st.stopKindTitle || st.address || ''),
    lat: parseFloat(st.latitude),
    lng: parseFloat(st.longitude),
    lines: [],
  };
}

export function isValidStation(st: any): boolean {
  if (!st) return false;
  const lat = parseFloat(st.latitude);
  const lon = parseFloat(st.longitude);
  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) return false;
  // Elazığ il sınırları koordinat filtresi (test/hatalı kayıtları eler)
  if (lat < 38.4 || lat > 38.9 || lon < 39.0 || lon > 39.5) return false;
  const name = fixMojibake(st.stopTitle || st.title || st.shortTitle || st.description || '').trim();
  return name.length > 0 && !name.toLowerCase().includes('test');
}

async function fetchHtmlWithCorsProxy(targetUrl: string): Promise<string> {
  // Doğrudan İstek (Fırat Üni ve Elazığ Belediyesi sunucuları anında 200 OK döndürür)
  try {
    const res = await fetch(targetUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 20) {
        return text;
      }
    }
  } catch (e) {
    console.log('Doğrudan bağlantı hatası:', e);
  }

  return '';
}

/**
 * ELAZIĞKART RESMİ SUNUCU İSTEK YARDIMCISI
 * - 429 (Too Many Requests) geçici hız sınırında 1.2 sn bekleyip otomatik tekrar dener.
 * - Windows-1254 / ISO-8859-9 mojibake bozuk UTF-8 durumunda otomatik kurtarma yapar.
 */
async function fetchElazigKart(endpoint: string, body: any = {}, retryCount = 1): Promise<any> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `https://elazigkart.elazig.bel.tr${cleanEndpoint}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && retryCount > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return fetchElazigKart(endpoint, body, retryCount - 1);
    }

    if (!res.ok) return null;

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      try {
        const decoded = decodeURIComponent(escape(text));
        data = JSON.parse(decoded);
      } catch {
        return null;
      }
    }

    return data?.result ?? data?.data ?? (Array.isArray(data) ? data : data);
  } catch (e) {
    console.log(`ElazığKart API hatası [${endpoint}]:`, e);
    return null;
  }
}

export const ApiService = {
  /**
   * CANLI HAVA DURUMU (WeatherAPI)
   */
  async getWeather(): Promise<WeatherData | null> {
    const key = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
    if (!key) {
      console.log('EXPO_PUBLIC_WEATHER_API_KEY tanımlı değil; hava durumu atlanıyor.');
      return null;
    }
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(key)}&q=Elazig&aqi=no`
      );
      if (response.ok) {
        const data = await response.json();
        const durum = data.current?.condition?.text || 'Sunny';
        let durumTr = durum;
        const lower = durum.toLowerCase();
        if (lower.includes('sunny') || lower.includes('clear')) durumTr = 'Güneşli';
        else if (lower.includes('cloud') || lower.includes('overcast')) durumTr = 'Bulutlu';
        else if (lower.includes('rain')) durumTr = 'Yağmurlu';
        else if (lower.includes('snow')) durumTr = 'Kar Yağışlı';

        return {
          tempC: Math.round(data.current?.temp_c ?? 0),
          conditionText: durum,
          conditionTr: durumTr,
          humidity: data.current?.humidity ?? 0,
          windKph: Math.round(data.current?.wind_kph ?? 0),
          icon: 'wb-sunny',
        };
      }
    } catch (e) {
      console.log('Hava durumu canlı istek hatası:', e);
    }
    return null;
  },

  /**
   * CANLI ELAZIĞKART BAKİYE SORGULAMA (POST /api/balance/inquiry)
   * Yeni site ASP.NET Core antiforgery kullanıyor: önce /BalanceInquiry sayfasından
   * __RequestVerificationToken + antiforgery çerezi alınır, sonra form POST edilir.
   * Referer/Origin başlığı olmadan sunucu 403 "Access denied." döner.
   */
  async queryCardBalance(cardNumber: string): Promise<CardBalanceResult> {
    const cleaned = (cardNumber || '').replace(/[^0-9A-Za-z]/g, '').trim();
    if (!cleaned) {
      return { success: false, message: 'Lütfen bakiye sorgulamak istediğiniz ElazığKart numarasını giriniz.' };
    }
    if (cleaned.length < 8 || cleaned.length > 20) {
      return {
        success: false,
        message: 'Geçersiz kart numarası. Kartın arka yüzündeki 8-20 haneli seri numarasını giriniz.',
      };
    }

    try {
      // 1) Antiforgery token + çerez
      const pageRes = await fetch(`${ELAZIGKART_BASE}/BalanceInquiry`, {
        headers: { 'user-agent': ELAZIGKART_UA, accept: 'text/html,application/xhtml+xml' },
      });
      const pageHtml = await pageRes.text();
      const tokenMatch = pageHtml.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i);
      if (!tokenMatch) {
        return { success: false, message: 'ElazığKart bakiye servisi şu an yanıt vermiyor. Lütfen daha sonra tekrar deneyin.' };
      }
      const token = tokenMatch[1];

      // Çerezi elle de taşıyalım (Android/iOS native çerez deposu zaten otomatik gönderir)
      let cookieHeader = '';
      try {
        const rawCookie =
          typeof (pageRes.headers as any).getSetCookie === 'function'
            ? (pageRes.headers as any).getSetCookie().join(', ')
            : pageRes.headers.get('set-cookie') || '';
        const parts = rawCookie.match(/\.AspNetCore\.Antiforgery\.[^=]+=[^;,\s]+/g);
        if (parts) cookieHeader = parts.join('; ');
      } catch {
        // çerez okunamazsa native jar'a güven
      }

      // 2) Sorgu — site ile birebir: multipart/form-data (cardNo + __RequestVerificationToken).
      //    NFC UID (8 haneli hex) de geçerli bir kart numarasıdır; sunucu büyük/küçük harf ayırmaz.
      const form = new FormData();
      form.append('cardNo', cleaned);
      form.append('__RequestVerificationToken', token);
      const headers: Record<string, string> = {
        'user-agent': ELAZIGKART_UA,
        accept: '*/*',
        referer: `${ELAZIGKART_BASE}/BalanceInquiry`,
        origin: ELAZIGKART_BASE,
      };
      if (cookieHeader) headers.cookie = cookieHeader;

      // Belediyenin arka servisi aralıklı 502 "servise ulaşılamadı" döndürüyor; aynı token ile 3 deneme yap
      let response: Response | null = null;
      let text = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(`${ELAZIGKART_BASE}/api/balance/inquiry`, {
          method: 'POST',
          headers,
          body: form,
        });
        text = await response.text();
        if (response.status !== 502 && response.status !== 503) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!response) {
        return { success: false, message: 'Bakiye sorgulama servisine ulaşılamadı.' };
      }
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (response.status === 404) {
        return { success: false, message: data?.message || 'Girdiğiniz bilgilere ait kayıt bulunamamıştır.' };
      }
      if (response.status === 429) {
        return { success: false, message: 'Çok fazla sorgu yapıldı. Lütfen biraz bekleyip tekrar deneyin.' };
      }
      if (!response.ok) {
        return {
          success: false,
          message: data?.message || `Bakiye sorgulama servisine ulaşılamadı (HTTP ${response.status}).`,
        };
      }

      // Doğrulanmış yanıt: {"ok":true,"guncelBakiye":194.00,"bekleyenBakiye":0.00,
      //                     "gecerlilikBaslangicTarihi":"2026-07-31T00:00:00","gecerlilikBitisTarihi":"2027-07-31T00:00:00"}
      const info = unwrapEnvelope(data) || {};
      if (info.ok === false || info.guncelBakiye === undefined) {
        return { success: false, message: info.message || 'Bakiye bilgisi alınamadı. Lütfen tekrar deneyin.' };
      }
      const bakiye = Number(info.guncelBakiye ?? 0);
      const bekleyen = Number(info.bekleyenBakiye ?? 0);

      const fmtDate = (iso: any): string => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime()) || d.getFullYear() <= 1900) return '';
        return d.toLocaleDateString('tr-TR');
      };
      const bas = fmtDate(info.gecerlilikBaslangicTarihi);
      const bit = fmtDate(info.gecerlilikBitisTarihi);
      const gecerlilik = bas && bit ? `${bas} – ${bit}` : bit || bas;
      const bitisDate = info.gecerlilikBitisTarihi ? new Date(info.gecerlilikBitisTarihi) : null;
      const kartDurumu =
        bitisDate && !isNaN(bitisDate.getTime()) && bitisDate.getFullYear() > 1900 && bitisDate.getTime() < Date.now()
          ? 'Süresi Dolmuş'
          : 'Aktif';

      return {
        success: true,
        adSoyad: '',
        kartTipi: 'ElazığKart',
        bakiye: isNaN(bakiye) ? 0 : bakiye,
        bekleyenBakiye: isNaN(bekleyen) ? 0 : bekleyen,
        kartDurumu,
        gecerlilik,
        sonIslemTarihi: gecerlilik ? `Geçerlilik: ${gecerlilik}` : '—',
      };
    } catch (e) {
      console.log('ElazığKart bakiye bağlantı hatası:', e);
    }

    return {
      success: false,
      message: 'ElazığKart sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
    };
  },

  /**
   * CANLI TÜM HAT LİSTESİ (GET /api/wheremybus/routes) - 24 saat çevrimdışı önbellek
   */
  async getAllRoutes(keyword = '', force = false): Promise<RouteLineItem[]> {
    // Sözleşme: asla fırlatmaz — ağ yok ve önbellek boşsa [] döner
    let res: CachedResult<RouteLineItem[]>;
    try {
      res = await this.getAllRoutesWithCache(force);
    } catch (e) {
      console.log('Tüm hatlar alınamadı:', e);
      return [];
    }
    const q = normalizeRouteKey(keyword);
    if (!q) return res.data;
    return res.data.filter(
      (r) =>
        normalizeRouteKey(r.kod).includes(q) ||
        normalizeRouteKey(r.aciklama).includes(q) ||
        String(r.hatNo) === keyword.trim()
    );
  },

  async getAllRoutesWithCache(force = false): Promise<CachedResult<RouteLineItem[]>> {
    return cached(
      'all_routes',
      CACHE_TTL.ROUTES,
      async () => {
        const data = await fetchElazigKartJson('/api/wheremybus/routes');
        const list: any[] = Array.isArray(data?.routes) ? data.routes : Array.isArray(data) ? data : [];
        const routes = list
          .map((item: any) => ({
            id: Number(item.id),
            kod: fixMojibake(item.routeCode || item.kod || '').trim(),
            aciklama: fixMojibake(item.title || item.description || item.aciklama || '').trim(),
            hatNo: Number(item.routeNo ?? item.hatNo ?? item.shortTitle ?? 0) || 0,
          }))
          .filter((r: RouteLineItem) => r.kod.length > 0)
          .sort((a: RouteLineItem, b: RouteLineItem) => a.hatNo - b.hatNo);
        routeCatalogCache = routes;
        return routes;
      },
      { force }
    );
  },

  /**
   * CANLI OTOBÜS DURAKLARI (GET /api/smartstop/stations) - 24 saat çevrimdışı önbellek
   */
  async getBusStations(force = false): Promise<BusStation[]> {
    try {
      return (await this.getBusStationsWithCache(force)).data;
    } catch (e) {
      console.log('Duraklar alınamadı:', e);
      return [];
    }
  },

  async getBusStationsWithCache(force = false): Promise<CachedResult<BusStation[]>> {
    return cached(
      'bus_stations',
      CACHE_TTL.STATIONS,
      async () => {
        const data = await fetchElazigKartJson('/api/smartstop/stations');
        const stationsList: any[] = Array.isArray(data?.station)
          ? data.station
          : Array.isArray(data?.stations)
          ? data.stations
          : Array.isArray(data)
          ? data
          : [];

        return stationsList
          .filter(isValidStation)
          .map(mapStation);
      },
      { force }
    );
  },

  /**
   * YAKINIMDAKİ OTOBÜS DURAKLARI (GET /api/smartstop/near?lat={lat}&lng={lng})
   */
  async getNearbyStations(lat: number, lng: number): Promise<BusStation[]> {
    try {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return [];
      }
      const data = await fetchElazigKartJson(`/api/smartstop/near?lat=${lat}&lng=${lng}`);
      const list: any[] = Array.isArray(data?.station)
        ? data.station
        : Array.isArray(data?.stations)
        ? data.stations
        : Array.isArray(data)
        ? data
        : [];

      return list
        .filter(isValidStation)
        .map(mapStation);
    } catch (e) {
      console.log('Yakındaki duraklar API hatası:', e);
      return [];
    }
  },

  /**
   * CANLI DURAĞA YAKLAŞAN OTOBÜSLER VE KALAN SÜRE (GET /api/smartstop/approaching/{stopId})
   */
  async getStationRemainingTime(stopId: string | number): Promise<StationBusInfo[]> {
    try {
      const numericStopId = parseInt(String(stopId), 10);
      if (isNaN(numericStopId)) return [];

      const data = await fetchElazigKartJson(`/api/smartstop/approaching/${numericStopId}`);
      const list: any[] = Array.isArray(data?.route) ? data.route : Array.isArray(data) ? data : [];

      // Doğrulanmış kayıt: {busLineCode, busLineNo, busLineShortName, busLineLongName, remainingTimeCurr,
      //   remainingNumberOfBusStops, routeId, description, busPlate, routeVariantCode, routeVariantId}
      return list
        .map((item: any) => ({
          busLineCode: fixMojibake(item.busLineCode || '').trim(),
          busLineNo: item.busLineNo !== undefined && item.busLineNo !== null ? item.busLineNo : item.busLineShortName || '',
          busLineShortName: String(item.busLineShortName || item.busLineNo || ''),
          busLineLongName: fixMojibake(item.busLineLongName || item.description || '').trim(),
          panelId: item.routeId,
          routeId: item.routeId !== undefined && item.routeId !== null ? Number(item.routeId) : undefined,
          remainingTimeCurr:
            item.remainingTimeCurr !== undefined && item.remainingTimeCurr !== null ? Number(item.remainingTimeCurr) : null,
          remainingTimeNext:
            item.remainingTimeNext !== undefined && item.remainingTimeNext !== null ? Number(item.remainingTimeNext) : null,
          remainingNumberOfBusStops:
            item.remainingNumberOfBusStops !== undefined && item.remainingNumberOfBusStops !== null
              ? Number(item.remainingNumberOfBusStops)
              : null,
          busPlate: item.busPlate ? String(item.busPlate).trim() : null,
          routeVariantCode: item.routeVariantCode ?? null,
          routeVariantId: item.routeVariantId !== undefined && item.routeVariantId !== null ? Number(item.routeVariantId) : null,
          isAccordingToTimeSchedule: item.isAccordingToTimeSchedule,
          busStatusCurr: item.busStatusCurr,
          busStatusNext: item.busStatusNext,
        }))
        .sort((a, b) => (a.remainingTimeCurr ?? 999) - (b.remainingTimeCurr ?? 999));
    } catch (e) {
      console.log('Durak kalan süre canlı API hatası:', e);
      return [];
    }
  },

  /**
   * DURAKTAN GEÇEN HATLAR (GET /api/smartstop/routes/{stopId})
   * result.route[] → {id, routeCode, routeNo, title, routeVariants[{id, directionTypeTitle, routeVariantCode}]}
   */
  async getStationRoutes(stopId: string | number): Promise<RouteLineItem[]> {
    try {
      const numericStopId = parseInt(String(stopId), 10);
      if (isNaN(numericStopId)) return [];
      const data = await fetchElazigKartJson(`/api/smartstop/routes/${numericStopId}`);
      const list: any[] = Array.isArray(data?.route) ? data.route : [];
      return list
        .map((r: any) => ({
          id: Number(r.id),
          kod: fixMojibake(r.routeCode || '').trim(),
          aciklama: fixMojibake(r.title || r.description || '').trim(),
          hatNo: Number(r.routeNo ?? r.shortTitle ?? 0) || 0,
        }))
        .filter((r) => r.kod.length > 0)
        .sort((a, b) => a.hatNo - b.hatNo);
    } catch (e) {
      console.log('Durak hatları API hatası:', e);
      return [];
    }
  },

  /**
   * TÜM HAT AĞI (rota planlayıcı): her hattın yön varyantları ve sıralı durakları.
   * Hat başına 7 gün önbellek; ilk kurulumda ~45 hat × (variants + stations) isteği atılır (~30 sn),
   * sonrasında tamamen yerel çalışır. Alınamayan hatlar atlanır (bir sonraki çağrıda yeniden denenir).
   */
  async getTransitNetwork(onProgress?: (done: number, total: number) => void): Promise<TransitNetworkRoute[]> {
    // Aynı anda gelen çağrılar (ekran ısıtma + "Rota Bul") tek indirmeyi paylaşır
    if (transitNetworkInFlight) return transitNetworkInFlight;
    transitNetworkInFlight = this.buildTransitNetwork(onProgress).finally(() => {
      transitNetworkInFlight = null;
    });
    return transitNetworkInFlight;
  },

  async buildTransitNetwork(onProgress?: (done: number, total: number) => void): Promise<TransitNetworkRoute[]> {
    const routes = await this.getAllRoutes();
    const out: TransitNetworkRoute[] = [];
    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < routes.length) {
        const r = routes[cursor++];
        // Tek duraklı yer tutucu kayıtlar (ör. "ESKİ CEZAEVİ" tek durak) ağa alınmaz
        const variants = (await this.getRouteVariantStops(r)).filter((v) => v.stops.length >= 2);
        if (variants.length > 0) out.push({ id: r.id!, kod: r.kod, hatNo: r.hatNo, aciklama: r.aciklama, variants });
        done++;
        onProgress?.(done, routes.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out.sort((a, b) => a.hatNo - b.hatNo);
  },

  /**
   * HAT DURAK AĞI: her yön varyantının sıralı durak listesi
   * (variants/{routeId} → stations/{variantId}); 7 gün önbellek. Rota planlayıcı bunun üzerinde arama yapar.
   */
  async getRouteVariantStops(routeCodeOrItem: string | RouteLineItem): Promise<RouteVariantStops[]> {
    try {
      const route = typeof routeCodeOrItem === 'string' ? await resolveRoute(routeCodeOrItem) : routeCodeOrItem;
      if (!route || !route.id) return [];
      const res = await cached(
        `route_stops_${route.id}`,
        CACHE_TTL.ROUTE_STOPS,
        async () => {
          const variants = await getRouteVariants(route.id!);
          const out: RouteVariantStops[] = [];
          for (const v of variants) {
            const statData = await fetchElazigKartJson(`/api/wheremybus/stations/${v.id}`);
            const rawStops: any[] = Array.isArray(statData?.routeVariantStops?.[0]?.station)
              ? statData.routeVariantStops[0].station
              : Array.isArray(statData?.station)
              ? statData.station
              : [];
            const dir = v.routeVariantCode || (v.directionTypeTitle === 'Dönüş' ? 'D' : 'G');
            const stops: RouteStopItem[] = rawStops
              .map((s: any) => ({
                stopId: Number(s.stopId ?? s.stationId ?? s.id ?? 0),
                stopName: fixMojibake(s.stopTitle || s.stationName || s.stopName || s.title || '').trim(),
                sequence: Number(s.rowNo ?? s.sequence ?? 0),
                latitude: parseFloat(s.latitude || 0),
                longitude: parseFloat(s.longitude || 0),
                direction: dir,
              }))
              .filter((s) => s.latitude !== 0 && s.longitude !== 0)
              .sort((a, b) => a.sequence - b.sequence);
            if (stops.length > 0) out.push({ variantId: v.id, direction: dir, title: v.title, stops });
          }
          return out;
        }
      );
      return res.data;
    } catch (e) {
      console.log('Hat durak ağı alınamadı:', e);
      return [];
    }
  },

  /**
   * KART YÜKLEME NOKTALARI / BAYİLER (GET /api/fillingcenter/list)
   * result[] → {servisId, tip:'K'|'B'|'V', bayiT2Kodu, enlemFStr, boylamFStr, aciklama, adres, telefon}
   */
  async getFillingCenters(): Promise<FillingCenter[]> {
    try {
      const data = await fetchElazigKartJson('/api/fillingcenter/list');
      const list: any[] = Array.isArray(data) ? data : [];
      return list
        .map((d: any) => {
          // Belediye sitesinin kendi ayrımı: yalnızca 'K' kiosk, diğer tüm tipler (B, V) bayi
          const rawTip = String(d.tip || '').toUpperCase();
          const isKiosk = rawTip === 'K';
          const tip = isKiosk ? 'K' : 'B';
          return {
            id: Number(d.servisId),
            tip,
            tipLabel: isKiosk ? 'Kiosk' : 'Bayi',
            name: fixMojibake(d.aciklama || d.bayiT2Kodu || '').replace(/_/g, ' ').trim(),
            address: fixMojibake(d.adres || '').trim(),
            phone: String(d.telefon || '').trim(),
            lat: parseFloat(d.enlemFStr ?? d.enlem),
            lng: parseFloat(d.boylamFStr ?? d.boylam),
          };
        })
        .filter((c) => c.name.length > 0 && !isNaN(c.lat) && !isNaN(c.lng) && c.lat !== 0 && c.lng !== 0);
    } catch (e) {
      console.log('Kart bayileri API hatası:', e);
      return [];
    }
  },

  /**
   * CANLI GERÇEK ZAMANLI OTOBÜS KONUMLARI
   * Hat kodu → sunucu id → varyantlar → her varyant için GET /api/wheremybus/vehicles/{variantId}
   */
  async getRealtimeBusData(routeCode: string): Promise<RealtimeBusInfo[]> {
    const code = String(routeCode || '').trim();
    if (!code) return [];

    try {
      const route = await resolveRoute(code);
      if (!route || !route.id) return [];

      const variants = await getRouteVariants(route.id);
      if (variants.length === 0) return [];

      const results = await Promise.all(
        variants.map((v) => fetchElazigKartJson(`/api/wheremybus/vehicles/${v.id}`))
      );

      const seen = new Set<string>();
      const buses: RealtimeBusInfo[] = [];
      results.forEach((data) => {
        const list: any[] = Array.isArray(data?.routeVehicles)
          ? data.routeVehicles
          : Array.isArray(data?.vehicles)
          ? data.vehicles
          : [];
        list.forEach((raw) => {
          const bus = mapVehicle(raw, route.kod);
          if (!bus) return;
          const key = bus.plaka || `${bus.enlem},${bus.boylam}`;
          if (seen.has(key)) return;
          seen.add(key);
          buses.push(bus);
        });
      });
      return buses;
    } catch (e) {
      console.log(`Hat ${code} canlı otobüs verisi hatası:`, e);
      return [];
    }
  },

  /**
   * ŞEHİRDEKİ TÜM CANLI OTOBÜSLER (GET /api/wheremybus/overview/vehicles)
   * {vehicles:[{key, plate, lon, lat, dir, routeCode}]} — tek istek, 2 sn'de bir yenilenebilir.
   */
  async getAllLiveVehicles(): Promise<RealtimeBusInfo[]> {
    try {
      const data = await fetchElazigKartJson('/api/wheremybus/overview/vehicles');
      const list: any[] = Array.isArray(data?.vehicles) ? data.vehicles : [];
      return list
        .map((v) => mapVehicle({ ...v, latitude: v.lat, longitude: v.lon, gpsDir: v.dir }, v.routeCode || ''))
        .filter((b): b is RealtimeBusInfo => !!b);
    } catch (e) {
      console.log('Tüm canlı araçlar API hatası:', e);
      return [];
    }
  },

  /**
   * CANLI HAT BİLGİSİ: DURAKLAR, SEFER SAATLERİ, ÜCRETLER VE GÜZERGAH
   * (variants → stations/{variantId} + schedule/{variantId}/{gün} + price/{routeCode})
   */
  async getBusRoutes(
    routeCode?: string,
    weekday?: number,
    direction: 'G' | 'D' = 'G'
  ): Promise<BusRoute[]> {
    const code = String(routeCode || '').trim();
    if (!code) {
      const officialRoutes = await this.getAllRoutes();
      return officialRoutes.map((r) => ({
        lineNo: String(r.hatNo || r.kod),
        routeCode: r.kod,
        routeName: `Hat ${r.hatNo} - ${r.aciklama || r.kod}`,
        departureTimes: [],
        mainStops: [r.aciklama || r.kod],
        totalStops: 0,
      }));
    }

    try {
      const route = await resolveRoute(code);
      if (!route || !route.id) return [];

      const variants = await getRouteVariants(route.id);
      const targetVariant =
        variants.find(
          (v) =>
            v.routeVariantCode?.toUpperCase() === direction.toUpperCase() ||
            (direction === 'G' && (v.directionTypeTitle?.toLowerCase().includes('gidiş') || v.isBaseLineVariant)) ||
            (direction === 'D' && v.directionTypeTitle?.toLowerCase().includes('dönüş'))
        ) ||
        (direction === 'G' ? pickBaselineVariant(variants) || variants[0] : variants[1] || variants[0]);

      // Haftanın günü: parametre verilmişse onu al, yoksa bugünün günü (1=Pzt ... 7=Paz)
      const jsDay = new Date().getDay();
      const defaultWeekday = jsDay === 0 ? 7 : jsDay;
      const targetWeekday = weekday != null ? Math.max(1, Math.min(7, Math.round(weekday))) : defaultWeekday;

      const [statData, schedData, priceData] = await Promise.all([
        targetVariant ? fetchElazigKartJson(`/api/wheremybus/stations/${targetVariant.id}`) : Promise.resolve(null),
        targetVariant ? fetchElazigKartJson(`/api/wheremybus/schedule/${targetVariant.id}/${targetWeekday}`) : Promise.resolve(null),
        fetchElazigKartJson(`/api/wheremybus/price/${encodeURIComponent(route.kod)}`),
      ]);

      // Duraklar
      let stops: RouteStopItem[] = [];
      const rawStops: any[] = Array.isArray(statData?.routeVariantStops?.[0]?.station)
        ? statData.routeVariantStops[0].station
        : Array.isArray(statData?.station)
        ? statData.station
        : Array.isArray(statData)
        ? statData
        : [];
      stops = rawStops
        .map((s: any) => ({
          stopId: Number(s.stopId ?? s.stationId ?? s.id ?? 0),
          stopName: fixMojibake(s.stopTitle || s.stationName || s.stopName || s.title || '').trim(),
          sequence: Number(s.rowNo ?? s.sequence ?? 0),
          latitude: parseFloat(s.latitude || 0),
          longitude: parseFloat(s.longitude || 0),
          direction: targetVariant?.routeVariantCode || direction,
        }))
        .sort((a, b) => a.sequence - b.sequence);
      const mainStops = stops.map((s) => s.stopName).filter((st) => st.length > 0);

      // Sefer saatleri
      let schedules: RouteScheduleItem[] = [];
      const rawSched: any[] = Array.isArray(schedData?.schedule) ? schedData.schedule : Array.isArray(schedData) ? schedData : [];
      schedules = rawSched.map((s: any, idx: number) => {
        const hour = s.hour !== undefined && s.hour !== null ? Number(s.hour) : undefined;
        const minute = s.minute !== undefined && s.minute !== null ? Number(s.minute) : undefined;
        const time =
          hour !== undefined && minute !== undefined
            ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
            : String(s.time || '');
        return {
          sequenceNumber: idx + 1,
          stationName: mainStops[0] || '',
          routeCode: route.kod,
          time,
          plannedStationIn: s.timeDescription || undefined,
          hour,
          minute,
          direction: targetVariant?.routeVariantCode || direction,
          ring: false,
        };
      });
      schedules.sort((a, b) => {
        const tA = (a.hour ?? 0) * 60 + (a.minute ?? 0);
        const tB = (b.hour ?? 0) * 60 + (b.minute ?? 0);
        return tA - tB;
      });
      const departureTimes = schedules.map((s) => s.time).filter((t) => t.length > 0);

      // Ücretler
      let prices: RoutePriceItem[] = [];
      const rawPrices: any[] = Array.isArray(priceData) ? priceData : Array.isArray(priceData?.price) ? priceData.price : [];
      prices = rawPrices.map((p: any) => ({
        routeCode: route.kod,
        description: fixMojibake(p.description || ''),
        cardType: fixMojibake(p.cardType || 'Tarife'),
        price: Number(p.price ?? 0),
      }));
      const priceInfo = prices.map((p) => `${p.cardType}: ${p.price} TL`).join(' | ');

      // Güzergah koordinatları (varyant GeoJSON'undan)
      const routeCoordinates: RouteCoordinateItem[] = [];
      variants.forEach((v) => {
        const dir: 'F' | 'B' = v.routeVariantCode === 'D' || v.directionTypeTitle === 'Dönüş' ? 'B' : 'F';
        v.coordinates.forEach(([lng, lat], i) => {
          routeCoordinates.push({ latitude: lat, longitude: lng, sequence: i + 1, route: route.kod, routeDirection: dir });
        });
      });

      return [
        {
          lineNo: String(route.hatNo || route.kod),
          routeCode: route.kod,
          routeName: `Hat ${route.hatNo} - ${route.aciklama || route.kod}`,
          departureTimes,
          mainStops,
          totalStops: stops.length,
          priceInfo: priceInfo || undefined,
          routeCoordinates,
          stops,
          prices,
          schedules,
        },
      ];
    } catch (e) {
      console.log(`Hat ${code} canlı veri alma hatası:`, e);
      return [];
    }
  },

  /**
   * CANLI HAT SEFER SAATLERİ (GET /api/wheremybus/schedule/{variantId}/{weekday})
   * @param routeCode Hat kodu (örn: ABDULLAHPAŞA)
   * @param weekday 1=Pazartesi ... 7=Pazar
   * @param direction 'G' (Gidiş) | 'D' (Dönüş)
   */
  async getRouteSchedule(
    routeCode: string,
    weekday: number,
    direction: 'G' | 'D' = 'G'
  ): Promise<RouteScheduleItem[]> {
    const code = String(routeCode || '').trim();
    if (!code) return [];

    try {
      const route = await resolveRoute(code);
      if (!route || !route.id) return [];

      const variants = await getRouteVariants(route.id);
      if (!variants || variants.length === 0) return [];

      // İstenen yöne göre varyantı seç ('G' veya 'D')
      const targetVariant =
        variants.find(
          (v) =>
            v.routeVariantCode?.toUpperCase() === direction.toUpperCase() ||
            (direction === 'G' && (v.directionTypeTitle?.toLowerCase().includes('gidiş') || v.isBaseLineVariant)) ||
            (direction === 'D' && v.directionTypeTitle?.toLowerCase().includes('dönüş'))
        ) ||
        (direction === 'G' ? pickBaselineVariant(variants) || variants[0] : variants[1] || variants[0]);

      if (!targetVariant) return [];

      // 1-7 arası geçerli gün
      const validDay = Math.max(1, Math.min(7, Math.round(weekday) || 1));
      const schedData = await fetchElazigKartJson(`/api/wheremybus/schedule/${targetVariant.id}/${validDay}`);
      const rawSched: any[] = Array.isArray(schedData?.schedule)
        ? schedData.schedule
        : Array.isArray(schedData)
        ? schedData
        : [];

      const schedules: RouteScheduleItem[] = rawSched.map((s: any, idx: number) => {
        const hour = s.hour !== undefined && s.hour !== null ? Number(s.hour) : undefined;
        const minute = s.minute !== undefined && s.minute !== null ? Number(s.minute) : undefined;
        const time =
          hour !== undefined && minute !== undefined
            ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
            : String(s.time || '');
        return {
          sequenceNumber: idx + 1,
          stationName: fixMojibake(s.stationName || s.stopTitle || s.title || ''),
          routeCode: route.kod,
          time,
          plannedStationIn: s.timeDescription || undefined,
          hour,
          minute,
          direction: targetVariant?.routeVariantCode || direction,
          ring: false,
        };
      });

      return schedules.sort((a, b) => {
        const tA = (a.hour ?? 0) * 60 + (a.minute ?? 0);
        const tB = (b.hour ?? 0) * 60 + (b.minute ?? 0);
        return tA - tB;
      });
    } catch (e) {
      console.log(`Hat ${code} sefer saatleri alma hatası (gün ${weekday}, yön ${direction}):`, e);
      return [];
    }
  },

  /**
   * CANLI HAT DURAK BİLGİSİ (baseline varyantın durakları)
   */
  async getRouteStops(routeCode: string): Promise<RouteStopItem[]> {
    const [route] = await this.getBusRoutes(routeCode);
    return route?.stops || [];
  },

  /**
   * CANLI HAT ÜCRET BİLGİSİ (GET /api/wheremybus/price/{routeCode})
   */
  async getRoutePrices(routeCode: string): Promise<RoutePriceItem[]> {
    const route = await resolveRoute(routeCode);
    const code = route?.kod || routeCode;
    const data = await fetchElazigKartJson(`/api/wheremybus/price/${encodeURIComponent(code)}`);
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.price) ? data.price : [];
    return list.map((p: any) => ({
      routeCode: code,
      description: fixMojibake(p.description || ''),
      cardType: fixMojibake(p.cardType || 'Tarife'),
      price: Number(p.price ?? 0),
    }));
  },

  /**
   * CANLI HAT GÜZERGAH KOORDİNATLARI (varyant GeoJSON'larından)
   */
  async getRouteCoordinates(routeCode: string): Promise<RouteCoordinateItem[]> {
    const [route] = await this.getBusRoutes(routeCode);
    return route?.routeCoordinates || [];
  },

  /**
   * CANLI YEMEKHANE MENÜSÜ (https://unievi.firat.edu.tr) - 3 saat çevrimdışı önbellek
   */
  async getDiningMenu(force = false): Promise<DiningMenu> {
    try {
      return (await this.getDiningMenuWithCache(force)).data;
    } catch (e) {
      console.log('Yemekhane menüsü alınamadı:', e);
      const todayStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      return { date: todayStr, lunch: [], dinner: [], priceStudent: '', priceStaff: '' };
    }
  },

  async getDiningMenuWithCache(force = false): Promise<CachedResult<DiningMenu>> {
    return cached(
      'dining_menu',
      CACHE_TTL.DINING,
      async () => {
        const todayStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        try {
          const html = await fetchHtmlWithCorsProxy('https://unievi.firat.edu.tr/');
          if (html) {
            const boxMatch = html.match(/<div[^>]*class="[^"]*box__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
            const searchScope = boxMatch ? boxMatch[1] : html;
            const pMatches = [...searchScope.matchAll(/<p[^>]*>(.*?)<\/p>/gi)];
            const cleanItems = pMatches
              .map(m => m[1].replace(/<[^>]*>?/gm, '').trim())
              .filter(str => str.length > 2 && !str.includes('Yemekhane') && !str.includes('Fırat'));

            if (cleanItems.length > 0) {
              const lunchItems: MenuItem[] =
                cleanItems.length === 1
                  ? [
                      {
                        name: cleanItems[0],
                        category: 'Günün Menüsü',
                        icon: 'silverware-fork-knife',
                      },
                    ]
                  : cleanItems.map((item, idx) => ({
                      name: item,
                      category:
                        idx === 0
                          ? 'Çorba'
                          : idx === 1
                            ? 'Ana Yemek'
                            : idx === 2
                              ? 'Yan Yemek'
                              : 'Tatlı / Meyve',
                      icon:
                        idx === 0
                          ? 'bowl-mix'
                          : idx === 1
                            ? 'food-drumstick'
                            : idx === 2
                              ? 'food-variant'
                              : 'cake-variant',
                    }));

              return {
                date: todayStr,
                lunch: lunchItems,
                dinner: [],
                priceStudent: '',
                priceStaff: '',
              };
            }
          }
        } catch (e) {
          console.log('Yemekhane canlı tarama hatası:', e);
        }

        return {
          date: todayStr,
          lunch: [],
          dinner: [],
          priceStudent: '',
          priceStaff: '',
        };
      },
      { force }
    );
  },

  /**
   * CANLI NÖBETÇİ ECZANELER (elazig.bel.tr Scraping) - 1 saat çevrimdışı önbellek
   */
  async getPharmacies(force = false): Promise<Pharmacy[]> {
    try {
      return (await this.getPharmaciesWithCache(force)).data;
    } catch (e) {
      console.log('Eczaneler alınamadı:', e);
      return [];
    }
  },

  async getPharmaciesWithCache(force = false): Promise<CachedResult<Pharmacy[]>> {
    return cached(
      'pharmacies',
      CACHE_TTL.PHARMACIES,
      async () => {
        try {
          const response = await fetch('https://www.elazig.bel.tr/nobetci-eczaneler/');
          if (response.ok) {
            const html = await response.text();
            const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
            const stripTags = (str: string) => str.replace(/<[^>]*>?/gm, '\n').replace(/[ \t]+/g, ' ').trim();
            const lines = stripTags(cleanHtml).split('\n').map(l => l.trim()).filter(l => l.length > 0);

            const eczaneler: Pharmacy[] = [];
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (/Eczanesi$/i.test(line) || (/Eczanesi\b/i.test(line) && !line.toLowerCase().includes('nöbetçi') && !line.toLowerCase().includes('ana sayfa'))) {
                let isim = line;
                let adres = '';
                let tel = '';
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                  const nextLine = lines[j];
                  if (nextLine.toLowerCase().includes('eczanesi')) break;
                  if (/(\d{10,11}|0?\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/g.test(nextLine)) {
                    tel = nextLine;
                  } else if (!adres && (nextLine.length > 5 || /mah|cad|sok|bulvar|no|işhanı/i.test(nextLine))) {
                    adres = nextLine;
                  }
                }
                if (!isim.includes('Belediyesi') && !isim.includes('Bilgilendirme')) {
                  eczaneler.push({
                    id: String(eczaneler.length + 1),
                    name: isim,
                    address: adres || 'Elazığ',
                    phone: tel || '',
                    district: 'Elazığ',
                    dutyHours: '24 Saat Nöbetçi',
                  });
                }
              }
            }
            if (eczaneler.length > 0) return eczaneler;
          }
        } catch (e) {
          console.log('Eczane canlı istek hatası:', e);
        }

        return [];
      },
      { force }
    );
  },

  /**
   * CANLI SON DAKİKA HABERLERİ (elazigsonhaber.com RSS Feed XML Parser) - 15 dakika çevrimdışı önbellek
   */
  async getNews(force = false): Promise<NewsItem[]> {
    try {
      return (await this.getNewsWithCache(force)).data;
    } catch (e) {
      console.log('Haberler alınamadı:', e);
      return [];
    }
  },

  async getNewsWithCache(force = false): Promise<CachedResult<NewsItem[]>> {
    return cached(
      'news',
      CACHE_TTL.NEWS,
      async () => {
        try {
          const response = await fetch('https://www.elazigsonhaber.com/rss/tum-mansetler');
          if (response.ok) {
            const xmlText = await response.text();
            const parser = new XMLParser({
              ignoreAttributes: false,
              attributeNamePrefix: '@_',
            });
            const jsonObj = parser.parse(xmlText);
            const rawItems = jsonObj?.rss?.channel?.item || jsonObj?.feed?.entry || [];
            const itemList = Array.isArray(rawItems) ? rawItems : [rawItems];

            if (itemList.length > 0) {
              return itemList.map((item: any, idx: number) => {
                const title = item.title || 'Elazığ Haber';
                const link = item.link || 'https://www.elazigsonhaber.com';
                const description = (item.description || item.summary || '')
                  .replace(/<[^>]+>/g, '')
                  .trim();
                const date = item.pubDate ? new Date(item.pubDate).toLocaleDateString('tr-TR') : 'Bugün';
                const imgUrl = item.enclosure?.['@_url'] || item['media:content']?.['@_url'] || '';
                const lowerFull = (title + ' ' + description).toLowerCase();
                let category = 'Şehir';
                if (/spor|futbol|elazığspor|maç|lig|puan|basketbol|voleybol|stadyum|transfer/i.test(lowerFull)) {
                  category = 'Spor';
                } else if (/fırat|üniversite|eğitim|öğrenci|burs|fakülte|okul|öğretmen|akademik|sınav/i.test(lowerFull)) {
                  category = 'Eğitim';
                } else if (/kültür|sanat|harput|tiyatro|konser|festival|müze|tarih|sergi|turizm/i.test(lowerFull)) {
                  category = 'Kültür';
                }

                return {
                  id: String(idx + 1),
                  title,
                  snippet: description.length > 130 ? description.substring(0, 130) + '...' : description,
                  date,
                  link,
                  category,
                  imageUrl: imgUrl,
                };
              });
            }
          }
        } catch (e) {
          console.log('Haber RSS canlı istek hatası:', e);
        }
        return [];
      },
      { force }
    );
  },

  /**
   * CANLI AKADEMİK DUYURULAR (N8N Workflow: .news-section-card Extractor & Subdomain Taraması)
   */
  async getAcademicAnnouncements(unitFilter?: string): Promise<AcademicAnnouncement[]> {
    try {
      let targetDomain = 'www.firat.edu.tr';
      let targetSubName = 'Fırat Üniversitesi';
      let url = 'https://www.firat.edu.tr/tr/page/announcement';

      const norm = (s: string) => (s || '').toLowerCase()
        .replace(/i̇/g, 'i').replace(/ı/g, 'i')
        .replace(/ü/g, 'u').replace(/ö/g, 'o')
        .replace(/ş/g, 's').replace(/ç/g, 'c')
        .replace(/ğ/g, 'g').trim();

      if (unitFilter && norm(unitFilter) !== 'tumu') {
        const filterNorm = norm(unitFilter);
        const foundSub = Object.keys(FIRAT_UNI_UNITS).find(k => {
          const valNorm = norm(FIRAT_UNI_UNITS[k]);
          const keyNorm = norm(k);
          return valNorm.includes(filterNorm) || filterNorm.includes(valNorm) || keyNorm === filterNorm || filterNorm.includes(keyNorm);
        });

        if (foundSub) {
          targetDomain = `${foundSub}.firat.edu.tr`;
          url = `https://${targetDomain}/tr/announcements-all`;
          targetSubName = FIRAT_UNI_UNITS[foundSub];
        } else {
          targetSubName = `${unitFilter} Fakültesi`;
        }
      }

      const html = await fetchHtmlWithCorsProxy(url);

      if (html && html.length > 100) {
        const announcements: AcademicAnnouncement[] = [];

        // 1. Subdomain Duyuru kartları regex ayrıştırma (Örn. announcements-detail/51875)
        const matches = [...html.matchAll(/<a[^>]*href=["']([^"']*(?:announcements-detail|announcement-detail|duyuru-detay)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];

        // Helper to format dates like news-section-card-left-date">ÇarMay20 to 20 Mayıs 2026
        const cleanSubdomainDate = (rawStr: string): string => {
          if (!rawStr) return 'Güncel';
          let clean = rawStr
            .replace(/<[^>]*>?/gm, '')
            .replace(/news-section-card-left-date["']>*/gi, '')
            .replace(/[^a-zA-Z0-9.\sĞÜŞİÖÇğüşıöç]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const ddmm = clean.match(/(\d{1,2}\s*\.\s*\d{2}\s*\.\s*\d{4})/);
          if (ddmm) return ddmm[1].replace(/\s+/g, '');

          const monthMap: Record<string, string> = {
            Oca: 'Ocak', Sub: 'Şubat', Mar: 'Mart', Nis: 'Nisan', May: 'Mayıs', Haz: 'Haziran',
            Tem: 'Temmuz', Agu: 'Ağustos', Eyl: 'Eylül', Eki: 'Ekim', Kas: 'Kasım', Ara: 'Aralık'
          };

          for (const mKey of Object.keys(monthMap)) {
            if (clean.includes(mKey)) {
              const dayNumMatch = clean.match(/\d{1,2}/);
              const dayNum = dayNumMatch ? dayNumMatch[0] : '';
              return dayNum ? `${dayNum} ${monthMap[mKey]} 2026` : `${monthMap[mKey]} 2026`;
            }
          }

          return clean.length > 2 ? clean : 'Güncel';
        };

        if (matches.length > 0) {
          matches.forEach((m, idx) => {
            let rawLink = m[1].trim();
            const content = m[2];

            if (rawLink.includes('page/announcement') || rawLink.includes('announcements-all')) return;

            const titleMatch = content.match(/news-section-card-right-title[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
                               content.match(/news-section-card-right-explanation[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
                               content.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
                               content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);

            const dateMatch = content.match(/(\d{1,2}\s*\.\s*\d{2}\s*\.\s*\d{4})/i) || content.match(/news-section-card-left-date[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || content.match(/news-section-card-left-date[\s\S]*/i);

            if (titleMatch) {
              let title = titleMatch[1].replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
              let date = dateMatch ? cleanSubdomainDate(dateMatch[0]) : 'Güncel';

              if (title && title.length > 5 && !title.toLowerCase().includes('tüm duyurular') && !rawLink.includes('#')) {
                let fullLink = rawLink.startsWith('http') ? rawLink : `https://${targetDomain}${rawLink.startsWith('/') ? '' : '/'}${rawLink}`;
                if (!announcements.some((a) => a.link === fullLink)) {
                  announcements.push({
                    id: `${targetDomain}_${idx}`,
                    unit: targetSubName,
                    title,
                    date: date || 'Güncel',
                    link: fullLink,
                  });
                }
              }
            }
          });

          if (announcements.length > 0) {
            return announcements.slice(0, 25);
          }
        }

        // 2. Ana Sayfa (www.firat.edu.tr) içerik blokları ve day/month tarih ayrıştırma
        const blocks = html.split(/<div[^>]*class="[^"]*content-pad[^"]*"/gi);
        if (blocks.length > 1) {
          for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const titleMatch = block.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            if (!titleMatch) continue;

            let link = titleMatch[1].trim();
            const title = titleMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

            const dayMatch = block.match(/class="day">([^<]+)<\/div>/i);
            const monthMatch = block.match(/class="month">([^<]+)<\/div>/i);
            const day = dayMatch ? dayMatch[1].trim() : '';
            const month = monthMatch ? monthMatch[1].trim() : '';
            const yearNow = new Date().getFullYear();
            const dateStr = day && month ? `${day} ${month} ${yearNow}` : 'Güncel';

            if (title && title.length > 5 && !link.includes('#')) {
              if (!link.startsWith('http')) {
                link = `https://${targetDomain}${link}`;
              }
              announcements.push({
                id: `ann_main_${i}`,
                unit: targetSubName,
                title,
                date: dateStr,
                link,
              });
            }
          }

          if (announcements.length > 0) {
            return announcements.slice(0, 25);
          }
        }
      }
    } catch (e) {
      console.log('Akademik duyuru canlı tarama hatası:', e);
    }
    return [];
  },

  /**
   * CANLI FÜ ETKİNLİKLERİ (firat.edu.tr/tr/page/event)
   */
  async getAcademicEvents(): Promise<AcademicAnnouncement[]> {
    try {
      const html = await fetchHtmlWithCorsProxy('https://www.firat.edu.tr/tr/page/event');
      if (html && html.length > 100) {
        const titleLinkRegex = /<h3[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const matches = [...html.matchAll(titleLinkRegex)];

        if (matches.length > 0) {
          return matches.map((m, idx) => {
            let link = m[1].trim();
            const title = m[2].replace(/<[^>]*>?/gm, '').trim();
            if (link && !link.startsWith('http')) {
              link = 'https://www.firat.edu.tr' + link;
            }
            return {
              id: `evt_${idx}`,
              unit: 'Etkinlik',
              title,
              date: 'Gelecek Etkinlik',
              link,
            };
          });
        }
      }
    } catch (e) {
      console.log('Etkinlik çekme hatası:', e);
    }
    return [];
  },

  /**
   * AKADEMİK DUYURU DETAY KAZIMA (Seçilen Duyuru Sayfasının Tam Metni ve Ek Dosyaları)
   * Includes recursive stub/redirect detection with loop protection (max 2 levels)
   */
  async getAnnouncementDetail(linkUrl: string, fallbackTitle?: string, fallbackUnit?: string, fallbackDate?: string, recursionDepth: number = 0): Promise<AnnouncementDetailData> {
    try {
      const MAX_RECURSION_DEPTH = 2;
      let targetUrl = linkUrl;

      // Normalize URL patterns - general approach (replaces narrow single-pattern block)
      if (targetUrl.includes('firat.edu.tr/page/announcement') && !targetUrl.includes('/tr/')) {
        targetUrl = targetUrl.replace('firat.edu.tr/page/announcement', 'firat.edu.tr/tr/page/announcement');
      }

      const domainMatch = targetUrl.match(/https?:\/\/([^\/]+)/i);
      const baseDomain = domainMatch ? domainMatch[1] : 'www.firat.edu.tr';

      const html = await fetchHtmlWithCorsProxy(targetUrl);

      if (html && html.length > 200) {
        // Isolate main content from sidebars, footer, and scripts!
        let mainContent = html;
        if (mainContent.includes('class="other-news')) {
          mainContent = mainContent.split('class="other-news')[0];
        }
        if (mainContent.includes('<footer')) {
          mainContent = mainContent.split('<footer')[0];
        }
        if (mainContent.includes('id="footer"')) {
          mainContent = mainContent.split('id="footer"')[0];
        }

        // Clean out <script>, <style>, <nav>, <header>
        mainContent = mainContent
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

        const titleMatch = mainContent.match(/<title>(.*?)<\/title>/is) ||
                           mainContent.match(/news-section-card-right-title[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
                           mainContent.match(/<h[12][^>]*>(.*?)<\/h[12]>/is);
        let scrapedTitle = titleMatch ? titleMatch[1].replace(/\|.*$/g, '').replace(/<[^>]+>/g, '').trim() : '';

        const dateMatch = mainContent.match(/(\d{2}\s*\.\s*\d{2}\s*\.\s*\d{4}|\d{2}\.\d{2}\.\d{4}|\d{1,2}\s+[A-Za-zĞÜŞİÖÇğüşıöç]+\s+\d{4})/i);
        let scrapedDate = dateMatch ? dateMatch[1].replace(/\s+/g, '') : '';

        const viewsMatch = mainContent.match(/([\d\.,]+)\s*(?:Görüntülenme|Okunma|Tıklanma|kez)/i);
        let scrapedViews = viewsMatch ? `${viewsMatch[1]} Görüntülenme` : '';

        const decodeHtml = (str: string) => {
          return str
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&rsquo;/g, "'")
            .replace(/&lsquo;/g, "'")
            .replace(/&ldquo;/g, '"')
            .replace(/&rdquo;/g, '"')
            .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
            .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
            .replace(/&ccedil;/g, 'ç').replace(/&Ccedil;/g, 'Ç')
            .replace(/&sdot;/g, '·')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|h[1-6]|div|section|article)>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\r/g, '')
            .trim();
        };

        const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9ğüşıöç]/gi, '');
        const foldTr = (s: string) =>
          (s || '')
            .toLocaleLowerCase('tr-TR')
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const isStubText = (text: string) => {
          const f = foldTr(text);
          return (
            f.includes('tiklayiniz') ||
            f.includes('>>>') ||
            /icin\s+tikla/.test(f) ||
            /detay\s+icin/.test(f) ||
            /duyuru\s+icin/.test(f)
          );
        };

        const isUsefulParagraph = (text: string) => {
          const lower = text.toLowerCase();
          const isPureDate =
            /^\s*\d{1,2}\s*[\.\/]\s*\d{2}\s*[\.\/]\s*\d{4}\s*$/i.test(text) || /^\d{1,2}$/.test(text);
          const isTitle =
            !!scrapedTitle &&
            text.length < scrapedTitle.length + 15 &&
            norm(text) === norm(scrapedTitle);
          return (
            text.length > 3 &&
            !isPureDate &&
            !isTitle &&
            !lower.includes('tüm hakları saklıdır') &&
            !lower.includes('diğer duyurular') &&
            !lower.includes('function(') &&
            !lower.includes('initlanguagepicker') &&
            !lower.includes('ziyaretçi sayısı')
          );
        };

        const collectParagraphsFromHtml = (chunk: string) => {
          const lines = decodeHtml(chunk).split('\n');
          for (const line of lines) {
            const text = line.replace(/\s+/g, ' ').trim();
            if (isUsefulParagraph(text) && !paragraphs.includes(text)) {
              paragraphs.push(text);
            }
          }
        };

        const paragraphs: string[] = [];

        // Prefer known content containers (subdomain explanation, then www post-content)
        const expMatch = mainContent.match(/class="new-section-detail-explanation"[^>]*>([\s\S]*?)<\/div>/i);
        const postContentMatch = mainContent.match(/class="post-content"[^>]*>([\s\S]*?)<\/div>/i);

        if (expMatch) {
          collectParagraphsFromHtml(expMatch[1]);
        } else if (postContentMatch) {
          collectParagraphsFromHtml(postContentMatch[1]);
        } else {
          const pRegex = /<p[^>]*>(.*?)<\/p>/gis;
          let pMatch;
          while ((pMatch = pRegex.exec(mainContent)) !== null) {
            const text = decodeHtml(pMatch[1]).replace(/\s+/g, ' ').trim();
            if (isUsefulParagraph(text) && !paragraphs.includes(text)) {
              paragraphs.push(text);
            }
          }
        }

        const attachments: Array<{ name: string; url: string; size?: string; type: string }> = [];
        
        // Direct document download links & file extraction (ext: .pdf, .docx, .xlsx, .zip, .rar, .jpg, .png, .webp etc.)
        const directLinkRegex = /<a[^>]+href=["']([^"']*?(?:documents|subdomain_files|\/file\/|\.pdf|\.docx?|\.xlsx?|\.xls|\.zip|\.rar|\.jpg|\.jpeg|\.png|\.webp)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        
        // Helper: Extract meaningful filename from URL when link text is generic
        const extractFileNameFromUrl = (url: string): string => {
          const decoded = decodeURIComponent(url);
          const lastSegment = decoded.split('/').pop() || 'attachment';
          return lastSegment || 'attachment';
        };
        
        // Helper: Determine if link text is generic/meaningless (handles TIKLAYINIZ / tıklayınız)
        const isGenericLinkText = (text: string): boolean => {
          const generic = ['tiklayiniz', 'buraya', 'indir', 'download', 'dosya', 'belge', 'ek', 'dok', 'baglanti', 'link', 'click here', 'here', '...', '>>>', 'ac'];
          const normalized = foldTr(text).trim();
          return generic.some((g) => normalized === g || normalized.startsWith(g + ' '));
        };
        
        // Helper: Determine file type from extension (used for both display and categorization)
        const getFileType = (fileUrl: string, rawName: string): string => {
          const urlExt = fileUrl.split('.').pop()?.toLowerCase() || '';
          const nameExt = rawName.split('.').pop()?.toLowerCase() || '';
          const ext = nameExt || urlExt;
          
          if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
            return 'IMAGE';
          }
          if (['pdf'].includes(ext)) return 'PDF';
          if (['doc', 'docx', 'odt', 'txt', 'rtf'].includes(ext)) return 'DOC';
          if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'SHEET';
          if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'ARCHIVE';
          if (['ppt', 'pptx', 'odp'].includes(ext)) return 'PRESENTATION';
          
          return ext.length <= 4 ? ext.toUpperCase() : 'FILE';
        };
        
        let dlMatch;
        while ((dlMatch = directLinkRegex.exec(mainContent)) !== null) {
          const fileUrl = dlMatch[1].trim();
          const rawName = decodeHtml(dlMatch[2]);
          
          if (!fileUrl.toLowerCase().includes('vpn') && !fileUrl.toLowerCase().includes('file_category_id') && rawName.length > 2) {
            const fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${baseDomain}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            const safeUrl = fullUrl.replace(/ /g, '%20');
            
            // Extract meaningful name: use rawName if not generic, else derive from URL
            let finalName = rawName;
            if (isGenericLinkText(rawName)) {
              finalName = extractFileNameFromUrl(fileUrl);
            }
            
            const fileType = getFileType(fileUrl, rawName);
            
            if (!attachments.some((a) => a.url === safeUrl)) {
              attachments.push({
                name: finalName,
                url: safeUrl,
                size: 'Ek Belge',
                type: fileType,
              });
            }
          }
        }

        // www.firat.edu.tr "Belgeler" table: <tr onclick="get_url('https://.../documents/....pdf')">
        // Copilot mistakenly removed this; ana portal duyuruları sıkça bu formatı kullanır.
        const pushAttachment = (fileUrl: string, rawName: string, sizeLabel?: string) => {
          if (!fileUrl || fileUrl.toLowerCase().includes('vpn') || fileUrl.toLowerCase().includes('file_category_id')) return;
          const fullUrl = fileUrl.startsWith('http')
            ? fileUrl
            : `https://${baseDomain}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
          const safeUrl = fullUrl.replace(/ /g, '%20');
          let finalName = (rawName || '').replace(/\s+/g, ' ').trim();
          if (!finalName || finalName.length < 2 || isGenericLinkText(finalName)) {
            finalName = extractFileNameFromUrl(fileUrl);
          }
          if (!attachments.some((a) => a.url === safeUrl)) {
            attachments.push({
              name: finalName,
              url: safeUrl,
              size: sizeLabel || 'Ek Belge',
              type: getFileType(fileUrl, finalName),
            });
          }
        };

        const getUrlRowRegex =
          /<tr[^>]*onclick=["']get_url\(['"]([^'"]+)['"]\)["'][^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = getUrlRowRegex.exec(mainContent)) !== null) {
          const fileUrl = rowMatch[1].trim();
          const rowHtml = rowMatch[2];
          const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
            decodeHtml(c[1]).replace(/\s+/g, ' ').trim()
          );
          const nameFromTd = cells.find((c) => c && !/^\d{2}-\d{2}-\d{4}/.test(c) && c.length > 1) || '';
          const dateFromTd = cells.find((c) => /^\d{2}-\d{2}-\d{4}/.test(c));
          pushAttachment(fileUrl, nameFromTd, dateFromTd || 'Ek Belge');
        }

        // Fallback: any get_url('...') call (button/span/div) with nearby document URL
        const getUrlLooseRegex = /get_url\(['"]([^'"]+(?:documents|subdomain_files|\.pdf|\.docx?|\.xlsx?|\.zip|\.rar)[^'"]*)['"]\)/gi;
        let looseMatch;
        while ((looseMatch = getUrlLooseRegex.exec(mainContent)) !== null) {
          pushAttachment(looseMatch[1].trim(), '');
        }

        // Embedded web links in explanation text (internal/external a href links)
        if (expMatch) {
          const embeddedLinks = [...expMatch[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
          for (const m of embeddedLinks) {
            const linkUrl = m[1].trim();
            const linkText = decodeHtml(m[2]) || 'İlgili Duyuru / Başvuru Bağlantısı';
            if (linkUrl.startsWith('http') && !linkUrl.includes('vpn') && !attachments.some((a) => a.url === linkUrl)) {
              attachments.push({
                name: linkText.length > 3 ? linkText : 'Başvuru & Detay Bağlantısı',
                url: linkUrl,
                size: 'Harici Web Bağlantısı',
                type: 'LINK',
              });
            }
          }
        }

        // Image (hero image) extraction
        const imgMatch = mainContent.match(/class="new-section-detail-img"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) ||
                         mainContent.match(/<img[^>]+src=["']([^"']*(?:announcements|images\/announcements)[^"']*)["']/i);
        let scrapedImage = '';
        if (imgMatch) {
          const rawImg = imgMatch[1].trim();
          if (!rawImg.includes('firat_logo.png') && !rawImg.includes('logo') && !rawImg.includes('base_images')) {
            scrapedImage = rawImg.startsWith('http') ? rawImg : `https://${baseDomain}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
          }
        }

        // Filter out global VPN footer attachments
        const cleanAttachments = attachments.filter((a) => !a.url.includes('637e1ffe2d40a16692101100') && !a.name.toLowerCase().includes('vpn'));

        // Stub/redirect: www.firat.edu.tr often hides a short "İçin TIKLAYINIZ" body in .post-content
        // that points to ogrencidb / unit announcements-detail. Follow those (max 2 levels).
        let finalParagraphs = paragraphs;

        const resolveHref = (href: string) => {
          const raw = (href || '').trim();
          if (!raw) return '';
          if (raw.startsWith('http')) return raw;
          return `https://${baseDomain}${raw.startsWith('/') ? '' : '/'}${raw}`;
        };

        const findStubRedirectUrl = (): string | null => {
          const scopeHtml = postContentMatch?.[1] || expMatch?.[1] || mainContent;
          const anchors = [...scopeHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
          const candidates: Array<{ url: string; score: number }> = [];

          for (const m of anchors) {
            const fullUrl = resolveHref(m[1]);
            if (!fullUrl || fullUrl === targetUrl) continue;
            if (!/firat\.edu\.tr/i.test(fullUrl)) continue;
            if (!/(?:announcements?-detail|page\/announcement\/)/i.test(fullUrl)) continue;
            // Skip file downloads (those are attachments, not redirects)
            if (/\.(pdf|docx?|xlsx?|xls|zip|rar|jpg|jpeg|png|webp)(\?|#|$)/i.test(fullUrl)) continue;

            const linkText = decodeHtml(m[2]).replace(/\s+/g, ' ').trim();
            let score = 1;
            if (isStubText(linkText)) score += 3;
            if (/announcements?-detail/i.test(fullUrl)) score += 2;
            if (/ogrencidb\.firat\.edu\.tr/i.test(fullUrl)) score += 2;
            candidates.push({ url: fullUrl, score });
          }

          if (candidates.length === 0) return null;
          candidates.sort((a, b) => b.score - a.score);
          return candidates[0].url;
        };

        const joinedBody = finalParagraphs.join(' ');
        const postPlain = postContentMatch
          ? decodeHtml(postContentMatch[1]).replace(/\s+/g, ' ').trim()
          : '';
        const looksLikeStub =
          (finalParagraphs.length <= 2 && joinedBody.length < 180 && isStubText(joinedBody)) ||
          (postPlain.length > 0 && postPlain.length < 180 && isStubText(postPlain)) ||
          (finalParagraphs.length === 0 && cleanAttachments.length === 0 && isStubText(postPlain || joinedBody));

        if (recursionDepth < MAX_RECURSION_DEPTH && looksLikeStub) {
          const redirectUrl = findStubRedirectUrl();
          if (redirectUrl) {
            try {
              console.log(`Stub detected at recursion depth ${recursionDepth}, following redirect to: ${redirectUrl}`);
              return await this.getAnnouncementDetail(
                redirectUrl,
                fallbackTitle || scrapedTitle,
                fallbackUnit,
                fallbackDate || scrapedDate,
                recursionDepth + 1
              );
            } catch (recursionErr) {
              console.log(`Failed to follow stub redirect: ${recursionErr}`);
            }
          }
        }

        if (finalParagraphs.length === 0) {
          if (cleanAttachments.length > 0) {
            finalParagraphs = [
              'Bu duyuru resmi sınav programı veya belge içerikli olup, detaylar aşağıdaki "EKLER VE DOSYALAR" bölümündeki ekli dökümanda sunulmuştur.',
            ];
          } else {
            finalParagraphs = [
              'Duyuru içeriği ilgili birim portalı üzerinden çekilmiştir.',
              'Detaylı bilgi için aşağıdaki "Üniversite Web Sayfasında Aç" butonunu kullanabilirsiniz.',
            ];
          }
        }

        return {
          title: scrapedTitle || fallbackTitle || 'Duyuru Detayı',
          unit: fallbackUnit || 'Fırat Üniversitesi Academic',
          date: fallbackDate || scrapedDate || 'Güncel Duyuru',
          views: scrapedViews || 'Resmi Duyuru',
          paragraphs: finalParagraphs,
          attachments: cleanAttachments,
          link: targetUrl,
          imageUrl: scrapedImage || undefined,
        };
      }
    } catch (e) {
      console.log('Duyuru detay kazıma hatası:', e);
    }

    return {
      title: fallbackTitle || 'Duyuru Detayı',
      unit: fallbackUnit || 'Fırat Üniversitesi Academic',
      date: fallbackDate || 'Güncel Duyuru',
      views: 'Resmi Duyuru',
      paragraphs: [
        'Duyuru metni doğrudan üniversite sayfasından ayrıştırılamadı. Lütfen detayları görüntülemek için resmi duyuru sayfasını açınız.',
      ],
      attachments: [],
      link: linkUrl,
    };
  },

  /**
   * CANLI ALADHAN NAMAZ VAKİTLERİ (N8N Node: Namaz Vakitleri API)
   */
  async getPrayerTimesAsync(date?: Date): Promise<{ times: PrayerTime[]; nextPrayer?: PrayerTime } | null> {
    try {
      // method=13: Diyanet İşleri Başkanlığı hesaplaması (Türkiye resmî vakitleri); tarih verilirse o günün vakitleri
      const dayPath = date
        ? `/${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
        : '';
      const response = await fetch(`https://api.aladhan.com/v1/timingsByCity${dayPath}?city=Elazig&country=Turkey&method=13`);
      if (response.ok) {
        const data = await response.json();
        const timings = data?.data?.timings;
        if (timings) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();

          const timesRaw = [
            { name: 'Fajr', nameTr: 'İmsak', time: timings.Fajr },
            { name: 'Sunrise', nameTr: 'Güneş', time: timings.Sunrise },
            { name: 'Dhuhr', nameTr: 'Öğle', time: timings.Dhuhr },
            { name: 'Asr', nameTr: 'İkindi', time: timings.Asr },
            { name: 'Maghrib', nameTr: 'Akşam', time: timings.Maghrib },
            { name: 'Isha', nameTr: 'Yatsı', time: timings.Isha },
          ];

          let nextIdx = 0;
          let foundNext = false;
          for (let i = 0; i < timesRaw.length; i++) {
            const [h, m] = timesRaw[i].time.split(':').map(Number);
            const prayerMins = h * 60 + m;
            if (prayerMins > currentMinutes) {
              nextIdx = i;
              foundNext = true;
              break;
            }
          }
          if (!foundNext) nextIdx = 0;

          const times = timesRaw.map((t, idx) => ({
            ...t,
            isNext: idx === nextIdx,
          }));

          return {
            times,
            nextPrayer: times[nextIdx],
          };
        }
      }
    } catch (e) {
      console.log('Namaz vakti canlı istek hatası:', e);
    }
    return null;
  },

  /**
   * CANLI FIRAT EDAŞ ELEKTRİK KESİNTİLERİ (N8N Node: HTTP Request -> firatedas.com.tr)
   */
  async getOutages(): Promise<OutageItem[]> {
    try {
      const response = await fetch('https://www.firatedas.com.tr/BilgiDanisma/GetKesintiler?yil=&ay=&il=23&ilce=1298', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const html = await response.text();
        if (html) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
          const rows = [...html.matchAll(trRegex)];
          const merkezKesintiler: OutageItem[] = [];
          const seen = new Set<string>();

          for (const row of rows) {
            const trContent = row[1];
            const tdRegex = /<td[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/td>/gi;
            const cells = [...trContent.matchAll(tdRegex)].map(m => m[1].trim());

            if (cells.length >= 7) {
              const ilce = cells[1].toUpperCase();
              const bolge = cells[6].toUpperCase();
              const tarihStr = cells[2]; // "31.07.2026"

              const parts = tarihStr.split('.');
              if (parts.length === 3) {
                const kesintiTarihi = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                kesintiTarihi.setHours(0, 0, 0, 0);

                if (ilce === 'MERKEZ' && !bolge.includes('KÖYÜ') && !bolge.includes('MEZRA') && kesintiTarihi >= today) {
                  const uniqueKey = `${tarihStr}-${cells[3]}-${bolge}`;
                  if (!seen.has(uniqueKey)) {
                    seen.add(uniqueKey);
                    merkezKesintiler.push({
                      id: String(merkezKesintiler.length + 1),
                      type: 'electric',
                      title: cells[5] || 'Planlı Şebeke Bakımı',
                      region: cells[6],
                      startTime: cells[3],
                      endTime: cells[4],
                      description: `${cells[6]} bölgesinde ${tarihStr} tarihinde ${cells[3]} - ${cells[4]} saatleri arasında planlı kesinti. Neden: ${cells[5]}`,
                    });
                  }
                }
              }
            }
          }

          if (merkezKesintiler.length > 0) {
            return merkezKesintiler;
          }
        }
      }
    } catch (e) {
      console.log('Kesintiler canlı istek hatası:', e);
    }
    return [];
  },
};
