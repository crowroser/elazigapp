/**
 * Bubilet — Elazığ etkinlikleri (doğrulandı 2026-09-11)
 *  - Liste: https://www.bubilet.com.tr/elazig[/etiket/<tag>]  (HTML, data-event-card-kind="grid" kartları)
 *  - Detay: etkinlik sayfasındaki RSC payload'ından "eventId":N
 *  - Seanslar: https://platform.api.bubilet.com.tr/v2/event/{eventId}/city/23/sessions
 *  - Süper Bilet: https://platform.api.bubilet.com.tr/superTicket/city/23/guest
 * platform.api tarayıcı User-Agent'larını 403 ile reddediyor; okhttp/özel UA kabul ediliyor.
 */

const CITY_SLUG = 'elazig';
const CITY_ID = 23;
const SITE = 'https://www.bubilet.com.tr';
const API = 'https://platform.api.bubilet.com.tr';
const CDN = 'https://cdn.bubilet.com.tr';
const UA = 'ElazigSehir/1.0 (Android; +https://elazigkart.elazig.bel.tr)';

export type EventTag = 'tumu' | 'konser' | 'tiyatro' | 'stand-up' | 'festival' | 'cocuk-aktiviteleri' | 'eglence';
export const EVENT_TAGS: { id: EventTag; label: string; icon: string }[] = [
  { id: 'tumu', label: 'Tümü', icon: 'ticket-confirmation-outline' },
  { id: 'konser', label: 'Konser', icon: 'music' },
  { id: 'tiyatro', label: 'Tiyatro', icon: 'drama-masks' },
  { id: 'stand-up', label: 'Stand-up', icon: 'microphone-variant' },
  { id: 'festival', label: 'Festival', icon: 'party-popper' },
  { id: 'cocuk-aktiviteleri', label: 'Çocuk', icon: 'teddy-bear' },
  { id: 'eglence', label: 'Eğlence', icon: 'star-four-points-outline' },
];

export interface CityEvent {
  slug: string;
  title: string;
  venue: string;
  dateText: string; // "07 Kasım Cts 20:30" (site metni)
  price: number | null;
  image: string;
  link: string;
  tag: EventTag;
}

export interface EventSession {
  sessionId: number;
  date: string; // ISO
  venue: string;
  price: number;
  discountedPrice: number;
  remainingTickets: number | null;
  hasSeatSelection: boolean;
  isSoldOut: boolean;
  isSuperTicket: boolean;
  superTicketPrice: number | null;
  sessionName: string;
}

export interface SuperTicketDeal {
  setName: string;
  eventId: number;
  title: string;
  slug: string;
  venue: string;
  sessionDate: string;
  ticketName: string;
  originalPrice: number;
  superPrice: number;
  discountRate: number;
  expireAt: number; // ms
  image: string;
  link: string;
  quota: number;
}

function decode(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const listCache = new Map<EventTag, { at: number; items: CityEvent[] }>();
const CACHE_MS = 5 * 60 * 1000;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers } });
  if (!res.ok) throw new Error(`Bubilet HTTP ${res.status}`);
  return res.text();
}

function parseCards(html: string, tag: EventTag): CityEvent[] {
  const out: CityEvent[] = [];
  const seen = new Set<string>();
  const parts = html.split('data-event-card-kind="grid"');
  for (let i = 1; i < parts.length; i++) {
    const card = parts[i];
    const link = card.match(/href="(\/[^"#]*\/etkinlik\/[^"#]*)"/i)?.[1];
    if (!link) continue;
    const slug = link.split('/etkinlik/')[1] || link;
    if (seen.has(slug)) continue;
    const title = decode(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || card.match(/title="([^"]+)"/i)?.[1] || '');
    if (!title) continue;
    // h3'ten sonraki iki <p>: mekan, tarih
    // Not: <path …> SVG etiketleri <p ile başladığından yalnızca gerçek <p> / <p …> eşleştirilir.
    // Kart varyantına göre mekan ya <a href="/mekan/…"> içinde ya da başlıktan sonraki ilk <p>'de gelir;
    // tarih her zaman son <p>.
    const ps = Array.from(card.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)).map((m) => decode(m[1]));
    const venueA = decode(card.match(/href="\/mekan\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const venue = venueA || (ps.length >= 2 ? ps[0] : '');
    const dateText = ps.length > 0 ? ps[ps.length - 1] : '';
    const priceM = card.match(/<span[^>]*>\s*<span[^>]*>\s*<span[^>]*>([\d.,]+)<\/span>/i) || card.match(/>([\d.]+(?:,\d+)?)<\/span>\s*(?:<\/span>)*\s*<span[^>]*>₺/i);
    const priceStr = priceM ? priceM[1].replace(/\./g, '').replace(',', '.') : '';
    const price = priceStr ? parseFloat(priceStr) : null;
    const image = card.match(/src="(https:\/\/cdn\.bubilet\.com\.tr\/[^"]+)"/i)?.[1] || '';
    seen.add(slug);
    out.push({
      slug,
      title,
      venue,
      dateText,
      price: price != null && !isNaN(price) ? price : null,
      image: image.replace(/width=\d+/, 'width=640'),
      link: SITE + link,
      tag,
    });
  }
  return out;
}

export const EventsService = {
  /** Şehir / etiket sayfasındaki etkinlikler (5 dk önbellek) */
  async getEvents(tag: EventTag = 'tumu', force = false): Promise<CityEvent[]> {
    const cached = listCache.get(tag);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.items;
    const url = tag === 'tumu' ? `${SITE}/${CITY_SLUG}` : `${SITE}/${CITY_SLUG}/etiket/${tag}`;
    const html = await fetchText(url);
    const items = parseCards(html, tag);
    listCache.set(tag, { at: Date.now(), items });
    return items;
  },

  /** Etkinlik sayfasından eventId, ardından seans/bilet API'si */
  async getSessions(link: string): Promise<{ eventId: number; sessions: EventSession[] }> {
    const html = await fetchText(link);
    const idM =
      html.match(/["'\\]*eventId["'\\]*\s*:\s*(\d+)/i) ||
      html.match(/["'\\]*fileEventId["'\\]*\s*:\s*(\d+)/i) ||
      html.match(/\/event\/(\d+)\//i);
    if (!idM) throw new Error('Etkinlik kimliği bulunamadı.');
    const eventId = parseInt(idM[1], 10);
    const raw = await fetchText(`${API}/v2/event/${eventId}/city/${CITY_ID}/sessions?_t=${Date.now()}`, {
      Accept: 'application/json',
      Origin: SITE,
      Referer: `${SITE}/`,
    });
    const data = JSON.parse(raw);
    const list: any[] = Array.isArray(data?.sessions) ? data.sessions : [];
    const sessions: EventSession[] = list.map((s) => {
      const remaining = s.remainingTickets != null ? Number(s.remainingTickets) : null;
      return {
        sessionId: Number(s.sessionId),
        date: s.date || '',
        venue: s.venueName || '',
        price: Number(s.price ?? 0),
        discountedPrice: Number(s.discountedPrice ?? s.price ?? 0),
        remainingTickets: remaining,
        hasSeatSelection: !!s.hasSeatSelection,
        isSoldOut: !!s.isMarkedSoldOut || remaining === 0,
        isSuperTicket: !!s.isSuperTicket,
        superTicketPrice: s.superTicketDiscountedPrice != null ? Number(s.superTicketDiscountedPrice) : null,
        sessionName: s.sessionName || s.subheading || '',
      };
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    return { eventId, sessions };
  },

  /** Süper Bilet (sınırlı süreli indirim) fırsatları */
  async getSuperTickets(): Promise<SuperTicketDeal[]> {
    try {
      const raw = await fetchText(`${API}/superTicket/city/${CITY_ID}/guest`, { Accept: 'application/json' });
      const data = JSON.parse(raw);
      const def = data?.superTicketDefinition;
      const details: any[] = Array.isArray(def?.details) ? def.details : [];
      const expireAt = data?.expireAt ? Number(data.expireAt) * 1000 : 0;
      return details
        .map((d) => {
          const img = (d.eventImages || []).find((i: any) => i.displayArea === 'yatayResim') || (d.eventImages || [])[0];
          const original = Number(d.originalPrice ?? 0);
          const superPrice = Number(d.superTicketDiscountedPrice ?? 0);
          return {
            setName: def?.name || 'Süper Bilet',
            eventId: Number(d.eventId),
            title: String(d.eventName || '').trim(),
            slug: d.eventSlug || '',
            venue: d.venueName || '',
            sessionDate: d.sessionDate || '',
            ticketName: d.ticketName || '',
            originalPrice: original,
            superPrice,
            discountRate: original > 0 ? Math.round(((original - superPrice) / original) * 100) : 0,
            expireAt,
            image: img?.url ? `${CDN}/cdn-cgi/image/width=640,quality=80${img.url}` : '',
            link: `${SITE}/${CITY_SLUG}/etkinlik/${d.eventSlug || ''}`,
            quota: Number(d.overAllQuota ?? 0),
          } as SuperTicketDeal;
        })
        .filter((d) => d.title && d.superPrice > 0);
    } catch (e) {
      console.log('Süper bilet API hatası:', e);
      return [];
    }
  },
};
