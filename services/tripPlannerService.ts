import { ApiService, RouteStopItem, RouteVariantStops, TransitNetworkRoute } from './apiService';

export interface TripLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface TripLeg {
  type: 'walk' | 'bus';
  durationMinutes: number;
  distanceMeters: number;
  instruction: string;
  lineNo?: string;
  lineName?: string;
  fromStationName?: string;
  toStationName?: string;
  stopCount?: number;
  /** Dönüş yönü sunucuda yok; gidiş dizilimi ters çevrilerek türetildi */
  inferred?: boolean;
  coordinates?: Array<{ latitude: number; longitude: number; routeDirection?: 'F' | 'B' }>;
}

export interface TripPlan {
  id: string;
  title: string;
  totalDurationMinutes: number;
  walkingDistanceMeters: number;
  transferCount: number;
  legs: TripLeg[];
  summary: string;
  recommended?: boolean;
}

/** Koordinatlar ElazığKart durak verisinden (aynı adlı duraklar) alınmıştır */
export const POPULAR_DESTINATIONS: TripLocation[] = [
  { name: 'Fırat Üniversitesi Rektörlük', lat: 38.6782, lng: 39.2016 },
  { name: 'Fırat Üniversitesi Mühendislik', lat: 38.676, lng: 39.192 },
  { name: 'Fırat Üniversitesi Hastanesi', lat: 38.6799, lng: 39.2072 },
  { name: 'Fethi Sekin Şehir Hastanesi', lat: 38.692, lng: 39.269 },
  { name: 'Valilik / Şehir Merkezi', lat: 38.6753, lng: 39.2105 },
  { name: 'Öğretmenevi', lat: 38.6755, lng: 39.217 },
  { name: 'Ahmet Aytar Meydanı', lat: 38.6748, lng: 39.214 },
  { name: 'Kültür Park', lat: 38.6715, lng: 39.2079 },
  { name: 'Gar (Tren İstasyonu)', lat: 38.6657, lng: 39.2228 },
  { name: 'Elbüs Garajı', lat: 38.6786, lng: 39.2411 },
  { name: 'Yeni Terminal (Otogar)', lat: 38.6509, lng: 39.1925 },
  { name: 'Harput', lat: 38.7047, lng: 39.2517 },
  { name: 'Hilalkent', lat: 38.6487, lng: 39.122 },
  { name: 'Doğukent', lat: 38.6829, lng: 39.2624 },
  { name: 'Ataşehir', lat: 38.6601, lng: 39.1719 },
  { name: 'Abdullahpaşa', lat: 38.6578, lng: 39.1488 },
];

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

// ---- Ayarlar: mesafeler gerçek durak diziliminden, süreler mesafeye dayalı tahmin ----
const WALK_M_PER_MIN = 80; // ~5 km/sa
const BUS_M_PER_MIN = 330; // şehir içi ortalama ~20 km/sa
const BUS_WAIT_MIN = 4; // ilk otobüsü bekleme
const TRANSFER_WAIT_MIN = 6; // aktarma bekleme
const MAX_WALK_TO_STOP = 1000; // yürünebilir durak yarıçapı (m)
const MAX_CANDIDATE_STOPS = 8; // başlangıç/varış için değerlendirilecek durak sayısı
const TRANSFER_WALK_M = 250; // iki hat durağı bu mesafedeyse aktarma yapılabilir
const MIN_BUS_LEG_M = 300; // bundan kısa otobüs bacağı önerilmez
const INFERRED_NOTE = ' (dönüş yönü durakları tahmini)';

const walkMins = (m: number) => Math.max(1, Math.ceil(m / WALK_M_PER_MIN));
const busMins = (m: number, stopCount: number) => Math.max(3, Math.ceil(m / BUS_M_PER_MIN) + Math.ceil(stopCount * 0.35));

/** Ağdaki bir durağın hangi hat/varyant/sırada geçtiği */
interface StopOccurrence {
  route: TransitNetworkRoute;
  variant: RouteVariantStops;
  index: number;
}

interface Candidate {
  stop: RouteStopItem;
  dist: number; // kullanıcı noktasına yürüme mesafesi
  occurrences: StopOccurrence[];
}

function pathDistance(stops: RouteStopItem[], from: number, to: number): number {
  let d = 0;
  for (let i = from; i < to; i++) {
    d += haversineDistanceMeters(stops[i].latitude, stops[i].longitude, stops[i + 1].latitude, stops[i + 1].longitude);
  }
  return d;
}

const RING_CLOSE_M = 1500;

/**
 * Ring sefer: tek varyantlı ve son durağı ilk durağına yakın hat (son duraktan sonra ilk durağa devam eder).
 */
function isRing(route: TransitNetworkRoute): boolean {
  const real = route.variants.filter((v) => !v.inferred);
  if (real.length !== 1) return false;
  const stops = real[0].stops;
  if (stops.length < 3) return false;
  const first = stops[0];
  const last = stops[stops.length - 1];
  return haversineDistanceMeters(first.latitude, first.longitude, last.latitude, last.longitude) <= RING_CLOSE_M;
}

/**
 * Sunucu bazı hatlar için yalnızca gidiş dizilimini yayınlıyor (ör. 56–59 Şehir Hastanesi hatları).
 * Uçları uzak olan tek yönlü hatlar için dönüş yönü, gidiş dizilimi ters çevrilerek türetilir ve
 * `inferred` olarak işaretlenir; kullanıcıya "dönüş yönü tahmini" notuyla gösterilir.
 */
function withInferredReturns(network: TransitNetworkRoute[]): TransitNetworkRoute[] {
  return network.map((route) => {
    if (route.variants.length !== 1 || isRing(route)) return route;
    const g = route.variants[0];
    if (g.stops.length < 3) return route;
    const reversed: RouteVariantStops = {
      variantId: -g.variantId,
      direction: 'D',
      title: `${g.title} (dönüş)`,
      inferred: true,
      stops: [...g.stops].reverse().map((s, i) => ({ ...s, sequence: i + 1, direction: 'D' })),
    };
    return { ...route, variants: [g, reversed] };
  });
}

/** Durak dizisini `start` binişten başlayacak şekilde döner (ring hatta başa sarar) */
function fromIndex(stops: RouteStopItem[], start: number, ring: boolean): RouteStopItem[] {
  return ring ? [...stops.slice(start), ...stops.slice(0, start)] : stops.slice(start);
}

/** Durak dizisini `end` inişte bitecek şekilde döner (ring hatta başa sarar) */
function untilIndex(stops: RouteStopItem[], end: number, ring: boolean): RouteStopItem[] {
  return ring ? [...stops.slice(end + 1), ...stops.slice(0, end + 1)] : stops.slice(0, end + 1);
}

function pathCoords(stops: RouteStopItem[], from: number, to: number, dir: 'F' | 'B' = 'F') {
  return stops.slice(from, to + 1).map((s) => ({ latitude: s.latitude, longitude: s.longitude, routeDirection: dir }));
}

function walkLeg(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }, dist: number, instruction: string): TripLeg {
  return { type: 'walk', durationMinutes: walkMins(dist), distanceMeters: dist, instruction, coordinates: [from, to] };
}

const ll = (p: TripLocation) => ({ latitude: p.lat, longitude: p.lng });
const display = (r: TransitNetworkRoute) => ({ lineNo: r.hatNo ? `Hat ${r.hatNo}` : `Hat ${r.kod}`, lineName: r.aciklama || r.kod });

/** Ağdan, verilen noktaya yürünebilir mesafedeki durakları (hat geçiş bilgisiyle) döner */
function nearestCandidates(network: TransitNetworkRoute[], p: TripLocation): Candidate[] {
  const byStop = new Map<number, Candidate>();
  for (const route of network) {
    for (const variant of route.variants) {
      variant.stops.forEach((stop, index) => {
        let c = byStop.get(stop.stopId);
        if (!c) {
          const dist = haversineDistanceMeters(p.lat, p.lng, stop.latitude, stop.longitude);
          if (dist > MAX_WALK_TO_STOP) return;
          c = { stop, dist, occurrences: [] };
          byStop.set(stop.stopId, c);
        }
        c.occurrences.push({ route, variant, index });
      });
    }
  }
  return Array.from(byStop.values())
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_CANDIDATE_STOPS);
}

export const TripPlannerService = {
  /** Hat ağını arka planda ısıtır (ekran açılınca çağrılır; planlama anında bekleme olmasın) */
  async warmUp(onProgress?: (done: number, total: number) => void): Promise<void> {
    try {
      await ApiService.getTransitNetwork(onProgress);
    } catch {
      // sessiz: planTrip tekrar dener
    }
  },

  /**
   * İki nokta arasında yürüyüş + otobüs (doğrudan veya 1 aktarma) rota planlarını hesaplar.
   * Veri: ElazığKart wheremybus hat ağı (her hattın yön varyantları ve sıralı durakları, 7 gün önbellek).
   * Eşleştirme durak kimliği ve gerçek sıralama üzerinden yapılır; süreler mesafeye dayalı tahmindir.
   */
  async planTrip(origin: TripLocation, destination: TripLocation, onProgress?: (msg: string) => void): Promise<TripPlan[]> {
    const directDist = haversineDistanceMeters(origin.lat, origin.lng, destination.lat, destination.lng);
    const plans: TripPlan[] = [];

    // 1. Kısa mesafelerde (<= 2 km) yürüyüş planı
    if (directDist <= 2000) {
      const mins = walkMins(directDist);
      plans.push({
        id: 'pure_walk',
        title: 'Yürüyüş',
        totalDurationMinutes: mins,
        walkingDistanceMeters: directDist,
        transferCount: 0,
        summary: `${directDist} metre yürüyüş`,
        legs: [walkLeg(ll(origin), ll(destination), directDist, `${destination.name} yönüne yürüyün (${directDist} m)`)],
      });
    }

    // 2. Hat ağı
    onProgress?.('Hat ağı yükleniyor…');
    const raw = await ApiService.getTransitNetwork((done, total) => onProgress?.(`Hat güzergahları alınıyor (${done}/${total})…`));
    if (raw.length === 0) return finalize(plans);
    const network = withInferredReturns(raw);

    onProgress?.('Rotalar hesaplanıyor…');
    const originCands = nearestCandidates(network, origin);
    const destCands = nearestCandidates(network, destination);
    if (originCands.length === 0 || destCands.length === 0) return finalize(plans);

    // 3. DOĞRUDAN: aynı varyantta binişten sonra iniş durağı (ring hatlarda başa sararak)
    const bestDirect = new Map<string, TripPlan>();
    for (const oc of originCands) {
      for (const o of oc.occurrences) {
        const ring = isRing(o.route);
        const seq = fromIndex(o.variant.stops, o.index, ring); // seq[0] = biniş
        for (const dc of destCands) {
          for (const d of dc.occurrences) {
            if (d.variant !== o.variant) continue;
            const n = o.variant.stops.length;
            const k = ring ? (d.index - o.index + n) % n : d.index - o.index;
            if (k <= 0) continue;
            const busDist = pathDistance(seq, 0, k);
            if (busDist < MIN_BUS_LEG_M) continue;
            const bMins = busMins(busDist, k);
            const total = walkMins(oc.dist) + BUS_WAIT_MIN + bMins + walkMins(dc.dist);
            const { lineNo, lineName } = display(o.route);
            const from = seq[0];
            const to = seq[k];
            const plan: TripPlan = {
              id: `direct_${o.route.kod}_${o.variant.variantId}_${from.stopId}_${to.stopId}`,
              title: `${lineNo} (Aktarmasız)`,
              totalDurationMinutes: total,
              walkingDistanceMeters: oc.dist + dc.dist,
              transferCount: 0,
              summary: `${from.stopName} → ${to.stopName} · ${k} durak`,
              legs: [
                walkLeg(ll(origin), from, oc.dist, `${from.stopName} durağına yürüyün (${oc.dist} m)`),
                {
                  type: 'bus',
                  durationMinutes: bMins + BUS_WAIT_MIN,
                  distanceMeters: busDist,
                  lineNo,
                  lineName,
                  fromStationName: from.stopName,
                  toStationName: to.stopName,
                  stopCount: k,
                  instruction: `${lineNo} (${lineName}) ile ${k} durak gidip ${to.stopName} durağında inin${o.variant.inferred ? INFERRED_NOTE : ''}`,
                  inferred: o.variant.inferred,
                  coordinates: pathCoords(seq, 0, k),
                },
                walkLeg(to, ll(destination), dc.dist, `${destination.name} hedefine yürüyün (${dc.dist} m)`),
              ],
            };
            const prev = bestDirect.get(o.route.kod);
            if (!prev || plan.totalDurationMinutes < prev.totalDurationMinutes) bestDirect.set(o.route.kod, plan);
          }
        }
      }
    }
    plans.push(...bestDirect.values());

    // 4. 1 AKTARMALI: hat1 (binişten sonra) ile hat2 (inişten önce) aynı ya da yakın durakta kesişir
    if (bestDirect.size < 3) {
      const bestTransfer = new Map<string, TripPlan>();
      const seenPair = new Set<string>();
      for (const oc of originCands) {
        for (const o of oc.occurrences) {
          const s1 = fromIndex(o.variant.stops, o.index, isRing(o.route)); // s1[0] = biniş
          for (const dc of destCands) {
            for (const d of dc.occurrences) {
              if (d.route === o.route) continue;
              const pairKey = `${o.variant.variantId}:${o.index}>${d.variant.variantId}:${d.index}`;
              if (seenPair.has(pairKey)) continue;
              seenPair.add(pairKey);

              const s2 = untilIndex(d.variant.stops, d.index, isRing(d.route)); // s2[son] = iniş
              const last = s2.length - 1;
              // s2'nin inişten önceki durakları: id → en geç indeks
              const s2Index = new Map<number, number>();
              for (let j = 0; j < last; j++) s2Index.set(s2[j].stopId, j);

              let best: { i: number; j: number; walk: number; cost: number } | null = null;
              for (let i = 1; i < s1.length; i++) {
                const a = s1[i];
                const sameId = s2Index.get(a.stopId);
                if (sameId !== undefined) {
                  const cost = pathDistance(s1, 0, i) + pathDistance(s2, sameId, last);
                  if (!best || cost < best.cost) best = { i, j: sameId, walk: 0, cost };
                  continue;
                }
                for (let j = 0; j < last; j++) {
                  const b = s2[j];
                  const walk = haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
                  if (walk > TRANSFER_WALK_M) continue;
                  const cost = pathDistance(s1, 0, i) + pathDistance(s2, j, last) + walk * 3;
                  if (!best || cost < best.cost) best = { i, j, walk, cost };
                }
              }
              if (!best) continue;
              const bus1 = pathDistance(s1, 0, best.i);
              const bus2 = pathDistance(s2, best.j, last);
              if (bus1 < MIN_BUS_LEG_M || bus2 < MIN_BUS_LEG_M) continue;

              const n1 = best.i;
              const n2 = last - best.j;
              const b1 = busMins(bus1, n1);
              const b2 = busMins(bus2, n2);
              const tWalk = best.walk;
              const total = walkMins(oc.dist) + BUS_WAIT_MIN + b1 + (tWalk ? walkMins(tWalk) : 0) + TRANSFER_WAIT_MIN + b2 + walkMins(dc.dist);
              const d1 = display(o.route);
              const d2 = display(d.route);
              const legs: TripLeg[] = [
                walkLeg(ll(origin), s1[0], oc.dist, `${s1[0].stopName} durağına yürüyün (${oc.dist} m)`),
                {
                  type: 'bus',
                  durationMinutes: b1 + BUS_WAIT_MIN,
                  distanceMeters: bus1,
                  lineNo: d1.lineNo,
                  lineName: d1.lineName,
                  fromStationName: s1[0].stopName,
                  toStationName: s1[best.i].stopName,
                  stopCount: n1,
                  instruction: `${d1.lineNo} (${d1.lineName}) ile ${n1} durak gidip ${s1[best.i].stopName} durağında inin${o.variant.inferred ? INFERRED_NOTE : ''}`,
                  inferred: o.variant.inferred,
                  coordinates: pathCoords(s1, 0, best.i),
                },
              ];
              if (tWalk > 0) legs.push(walkLeg(s1[best.i], s2[best.j], tWalk, `${s2[best.j].stopName} durağına yürüyün (${tWalk} m)`));
              legs.push(
                {
                  type: 'bus',
                  durationMinutes: b2 + TRANSFER_WAIT_MIN,
                  distanceMeters: bus2,
                  lineNo: d2.lineNo,
                  lineName: d2.lineName,
                  fromStationName: s2[best.j].stopName,
                  toStationName: s2[last].stopName,
                  stopCount: n2,
                  instruction: `${s2[best.j].stopName} durağından ${d2.lineNo} (${d2.lineName}) hattına binip ${n2} durak sonra ${s2[last].stopName} durağında inin${d.variant.inferred ? INFERRED_NOTE : ''}`,
                  inferred: d.variant.inferred,
                  coordinates: pathCoords(s2, best.j, last, 'B'),
                },
                walkLeg(s2[last], ll(destination), dc.dist, `${destination.name} hedefine yürüyün (${dc.dist} m)`)
              );
              const plan: TripPlan = {
                id: `transfer_${o.route.kod}_${o.variant.variantId}_${d.route.kod}_${d.variant.variantId}`,
                title: `${d1.lineNo} ➔ ${d2.lineNo} (1 Aktarma)`,
                totalDurationMinutes: total,
                walkingDistanceMeters: oc.dist + tWalk + dc.dist,
                transferCount: 1,
                summary: `${s1[best.i].stopName} durağında ${d1.lineNo}'den ${d2.lineNo}'ye aktarma`,
                legs,
              };
              const key = `${o.route.kod}>${d.route.kod}`;
              const prev = bestTransfer.get(key);
              if (!prev || plan.totalDurationMinutes < prev.totalDurationMinutes) bestTransfer.set(key, plan);
            }
          }
        }
      }
      plans.push(
        ...Array.from(bestTransfer.values())
          .sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)
          .slice(0, 4)
      );
    }

    return finalize(plans);
  },
};

/** Sıralama: aktarmasız ve kısa süreli önde; en iyi plan "önerilen" */
function finalize(plans: TripPlan[]): TripPlan[] {
  plans.sort((a, b) => {
    if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
    if (a.totalDurationMinutes !== b.totalDurationMinutes) return a.totalDurationMinutes - b.totalDurationMinutes;
    return a.walkingDistanceMeters - b.walkingDistanceMeters;
  });
  // Yürüyüş planı, otobüs alternatifinden belirgin yavaşsa öne çıkmasın
  const walk = plans.find((p) => p.id === 'pure_walk');
  const bestBus = plans.find((p) => p.id !== 'pure_walk');
  const recommended = walk && bestBus && walk.totalDurationMinutes > bestBus.totalDurationMinutes + 5 ? bestBus : plans[0];
  plans.forEach((p) => (p.recommended = p === recommended));
  return plans.slice(0, 6);
}
