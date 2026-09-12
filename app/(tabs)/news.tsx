import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Modal, StatusBar, Linking, Share, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import { ApiService, NewsItem } from '../../services/apiService';
import { EventsService, CityEvent, EventTag, EVENT_TAGS, EventSession, SuperTicketDeal } from '../../services/eventsService';
import { PrefsService } from '../../services/prefsService';
import { formatLastUpdated } from '../../services/cacheService';
import { Card, Chip, EmptyState, LoadingState, Notice, Pill, PrimaryButton, ScreenHeader, SectionTitle } from '../../components/ui';

const C = Theme.colors;
const NEWS_CATS = ['Tümü', 'Şehir', 'Eğitim', 'Kültür', 'Spor'];
const W = Dimensions.get('window').width;
const CARD_W = (W - Theme.spacing.lg * 2 - 12) / 2;

function fmtDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtMoney(n: number) {
  return `₺${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}
function timeLeft(ms: number) {
  const diff = ms - Date.now();
  if (diff <= 0) return 'süresi doldu';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h} sa ${m} dk kaldı` : `${m} dk kaldı`;
}

export default function DiscoverScreen() {
  useAppTheme();
  const [segment, setSegment] = useState<'events' | 'news'>('events');

  // Haberler
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsStale, setNewsStale] = useState(false);
  const [newsAt, setNewsAt] = useState(0);
  const [newsCat, setNewsCat] = useState('Tümü');
  const [query, setQuery] = useState('');
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null);

  // Etkinlikler
  const [events, setEvents] = useState<CityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsStale, setEventsStale] = useState(false);
  const [eventsAt, setEventsAt] = useState(0);
  const [eventsError, setEventsError] = useState('');
  const [tag, setTag] = useState<EventTag>('tumu');
  const [deals, setDeals] = useState<SuperTicketDeal[]>([]);
  const [activeEvent, setActiveEvent] = useState<CityEvent | null>(null);
  const [sessions, setSessions] = useState<EventSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [trackedSlugs, setTrackedSlugs] = useState<string[]>([]);

  const handleToggleTrack = async (e: CityEvent) => {
    const isNowTracked = await PrefsService.toggleTrackEvent({
      slug: e.slug,
      title: e.title,
      link: e.link,
      lastPrice: e.price,
      lastRemaining: null,
      trackedAt: new Date().toISOString(),
    });
    setTrackedSlugs((prev) => (isNowTracked ? [...prev, e.slug] : prev.filter((s) => s !== e.slug)));
  };

  const loadNews = useCallback(async (force = false) => {
    try {
      const res = await ApiService.getNewsWithCache(force);
      setNews(res.data);
      setNewsStale(res.stale);
      setNewsAt(res.at);
    } catch {
      // fallback
    } finally {
      setNewsLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async (t: EventTag, force = false) => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const res = await EventsService.getEventsWithCache(t, force);
      setEvents(res.data);
      setEventsStale(res.stale);
      setEventsAt(res.at);
    } catch (e: any) {
      setEventsError(e?.message || 'Etkinlikler alınamadı.');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
    loadEvents('tumu');
    EventsService.getSuperTickets().then(setDeals);
    PrefsService.getTrackedEvents().then((list) => setTrackedSlugs(list.map((e) => e.slug)));
  }, [loadNews, loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadNews(true),
      loadEvents(tag, true),
      EventsService.getSuperTickets().then(setDeals),
      PrefsService.getTrackedEvents().then((list) => setTrackedSlugs(list.map((e) => e.slug))),
    ]);
    setRefreshing(false);
  };

  const openEvent = async (e: CityEvent) => {
    setActiveEvent(e);
    setSessions(null);
    setSessionsError('');
    try {
      const r = await EventsService.getSessions(e.link);
      setSessions(r.sessions);
    } catch (err: any) {
      setSessionsError(err?.message || 'Seans bilgisi alınamadı.');
    }
  };

  const filteredNews = useMemo(() => {
    const q = query.trim().toLowerCase();
    return news.filter((n) => (newsCat === 'Tümü' || n.category === newsCat) && (!q || n.title.toLowerCase().includes(q) || n.snippet.toLowerCase().includes(q)));
  }, [news, newsCat, query]);

  const dealFor = (e: CityEvent) => deals.find((d) => d.slug === e.slug);

  // ── Etkinlikler ────────────────────────────────────────────────────────────
  const renderEvents = () => (
    <>
      {deals.length > 0 ? (
        <>
          <SectionTitle title="Süper Bilet Fırsatları" subtitle={`${deals[0].setName} · sınırlı süre`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealsRow}>
            {deals.map((d) => (
              <TouchableOpacity key={`${d.eventId}-${d.ticketName}`} style={styles.deal} activeOpacity={0.9} onPress={() => Linking.openURL(d.link)}>
                {d.image ? <Image source={{ uri: d.image }} style={styles.dealImg} /> : <View style={[styles.dealImg, { backgroundColor: C.primaryContainer }]} />}
                <View style={styles.dealBadge}>
                  <Text style={styles.dealBadgeText}>%{d.discountRate} İNDİRİM</Text>
                </View>
                <View style={{ padding: 10, gap: 3 }}>
                  <Text style={styles.dealTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.dealMeta} numberOfLines={1}>{fmtDate(d.sessionDate)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text style={styles.dealOld}>{fmtMoney(d.originalPrice)}</Text>
                    <Text style={styles.dealNew}>{fmtMoney(d.superPrice)}</Text>
                  </View>
                  <Text style={styles.dealLeft}>⏳ {timeLeft(d.expireAt)} · {d.ticketName}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionTitle title="Etkinlik Takvimi" subtitle="Bubilet üzerinden Elazığ" style={{ marginTop: deals.length ? 16 : 8 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {EVENT_TAGS.map((t) => (
          <Chip key={t.id} label={t.label} icon={t.icon} active={tag === t.id} onPress={() => { setTag(t.id); loadEvents(t.id); }} />
        ))}
      </ScrollView>

      {eventsLoading ? (
        <LoadingState label="Etkinlikler alınıyor..." />
      ) : eventsError ? (
        <View style={styles.pad}>
          <Notice tone="danger" text={eventsError} onPress={() => loadEvents(tag, true)} />
        </View>
      ) : events.length === 0 ? (
        <Card style={styles.pad}>
          <EmptyState icon="ticket-outline" title="Bu kategoride etkinlik yok" />
        </Card>
      ) : (
        <View style={styles.grid}>
          {events.map((e) => {
            const deal = dealFor(e);
            const isTracked = trackedSlugs.includes(e.slug);
            return (
              <TouchableOpacity key={e.slug} style={styles.eventCard} activeOpacity={0.9} onPress={() => openEvent(e)}>
                <View style={{ position: 'relative' }}>
                  {e.image ? <Image source={{ uri: e.image }} style={styles.eventImg} /> : <View style={[styles.eventImg, { backgroundColor: C.surfaceVariant }]} />}
                  <TouchableOpacity
                    style={styles.eventHeart}
                    hitSlop={8}
                    onPress={(ev) => {
                      ev.stopPropagation();
                      handleToggleTrack(e);
                    }}
                  >
                    <Ionicons
                      name={isTracked ? 'heart' : 'heart-outline'}
                      size={18}
                      color={isTracked ? C.danger : '#fff'}
                    />
                  </TouchableOpacity>
                </View>
                {deal ? (
                  <View style={styles.eventDeal}>
                    <Text style={styles.eventDealText}>%{deal.discountRate}</Text>
                  </View>
                ) : null}
                <View style={{ padding: 10, gap: 2 }}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{e.title}</Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>{e.venue}</Text>
                  <Text style={styles.eventDate} numberOfLines={1}>{e.dateText}</Text>
                  {e.price != null ? <Text style={styles.eventPrice}>{fmtMoney(e.price)}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );

  // ── Haberler ───────────────────────────────────────────────────────────────
  const featured = !query && newsCat === 'Tümü' ? news[0] : null;
  const rest = featured ? filteredNews.slice(1) : filteredNews;
  const renderNews = () => (
    <>
      <View style={[styles.pad, styles.search]}>
        <Ionicons name="search" size={18} color={C.textMuted} />
        <TextInput style={styles.searchInput} placeholder="Haber ara..." placeholderTextColor={C.textFaint} value={query} onChangeText={setQuery} />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {NEWS_CATS.map((c) => (
          <Chip key={c} label={c} active={newsCat === c} onPress={() => setNewsCat(c)} />
        ))}
      </ScrollView>
      {newsLoading ? (
        <LoadingState label="Haberler alınıyor..." />
      ) : (
        <>
          {featured ? (
            <TouchableOpacity style={styles.featured} activeOpacity={0.92} onPress={() => setActiveNews(featured)}>
              {featured.imageUrl ? <Image source={{ uri: featured.imageUrl }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: C.primaryContainer }]} />}
              <View style={styles.featuredOverlay}>
                <Pill label="SON DAKİKA" color="#fff" bg={C.danger} />
                <Text style={styles.featuredTitle} numberOfLines={3}>{featured.title}</Text>
                <Text style={styles.featuredDate}>{featured.date}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {rest.length === 0 && !featured ? (
            <Card style={styles.pad}>
              <EmptyState icon="newspaper-variant-outline" title="Haber bulunamadı" />
            </Card>
          ) : (
            <View style={[styles.pad, { gap: 10 }]}>
              {rest.map((n) => (
                <Card key={n.id} onPress={() => setActiveNews(n)} padded={false} style={styles.newsCard}>
                  {n.imageUrl ? <Image source={{ uri: n.imageUrl }} style={styles.thumb} /> : null}
                  <View style={{ flex: 1, padding: 12, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Pill label={n.category} />
                      <Text style={styles.meta}>{n.date}</Text>
                    </View>
                    <Text style={styles.newsTitle} numberOfLines={2}>{n.title}</Text>
                    <Text style={styles.meta} numberOfLines={2}>{n.snippet}</Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={C.background} />
      <ScreenHeader title="Keşfet" subtitle="Etkinlikler ve şehir haberleri" />
      {segment === 'events' && eventsStale && (
        <View style={{ paddingHorizontal: Theme.spacing.lg, paddingTop: 4 }}>
          <Notice tone="info" text={`Çevrimdışı — son güncelleme ${formatLastUpdated(eventsAt)}`} />
        </View>
      )}
      {segment === 'news' && newsStale && (
        <View style={{ paddingHorizontal: Theme.spacing.lg, paddingTop: 4 }}>
          <Notice tone="info" text={`Çevrimdışı — son güncelleme ${formatLastUpdated(newsAt)}`} />
        </View>
      )}
      <View style={styles.segment}>
        {(['events', 'news'] as const).map((s) => (
          <TouchableOpacity key={s} style={[styles.segBtn, segment === s && styles.segBtnActive]} onPress={() => setSegment(s)} activeOpacity={0.85}>
            <MaterialCommunityIcons name={s === 'events' ? 'ticket-confirmation-outline' : 'newspaper-variant-outline'} size={16} color={segment === s ? '#fff' : C.textMuted} />
            <Text style={[styles.segText, segment === s && styles.segTextActive]}>{s === 'events' ? 'Etkinlikler' : 'Haberler'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}>
        {segment === 'events' ? renderEvents() : renderNews()}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Etkinlik detayı */}
      <Modal visible={!!activeEvent} animationType="slide" onRequestClose={() => setActiveEvent(null)}>
        {activeEvent ? (
          <SafeAreaView style={styles.safe} edges={['top']}>
            <ScreenHeader
              title="Etkinlik"
              subtitle="Bubilet · Elazığ"
              onBack={() => setActiveEvent(null)}
              right={
                <TouchableOpacity
                  onPress={() => handleToggleTrack(activeEvent)}
                  style={styles.iconBtn}
                >
                  <Ionicons
                    name={trackedSlugs.includes(activeEvent.slug) ? 'heart' : 'heart-outline'}
                    size={20}
                    color={trackedSlugs.includes(activeEvent.slug) ? C.danger : C.primary}
                  />
                </TouchableOpacity>
              }
            />
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              {activeEvent.image ? <Image source={{ uri: activeEvent.image }} style={styles.detailImg} /> : null}
              <View style={[styles.pad, { gap: 12, marginTop: 14 }]}>
                <Text style={styles.detailTitle}>{activeEvent.title}</Text>
                <View style={{ gap: 4 }}>
                  <Text style={styles.detailMeta}>📍 {activeEvent.venue}</Text>
                  <Text style={styles.detailMeta}>📅 {activeEvent.dateText}</Text>
                </View>
                {dealFor(activeEvent) ? (
                  <Notice tone="success" text={`Süper Bilet: ${dealFor(activeEvent)!.ticketName} ${fmtMoney(dealFor(activeEvent)!.originalPrice)} → ${fmtMoney(dealFor(activeEvent)!.superPrice)} (${timeLeft(dealFor(activeEvent)!.expireAt)})`} />
                ) : null}
                <SectionTitle title="Seanslar ve Biletler" style={{ paddingHorizontal: 0, marginTop: 4, marginBottom: 0 }} />
                {sessionsError ? (
                  <Notice tone="warning" text={sessionsError} />
                ) : !sessions ? (
                  <LoadingState label="Bilet durumu alınıyor..." />
                ) : sessions.length === 0 ? (
                  <Notice tone="info" text="Bu etkinlik için açık seans görünmüyor." />
                ) : (
                  <View style={{ gap: 8 }}>
                    {sessions.map((s) => {
                      const low = s.remainingTickets != null && s.remainingTickets > 0 && s.remainingTickets <= 20;
                      const hasDiscount = s.discountedPrice < s.price;
                      return (
                        <Card key={s.sessionId} style={{ gap: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <Text style={styles.sessionDate}>{fmtDate(s.date)}</Text>
                            {s.isSoldOut ? (
                              <Pill label="TÜKENDİ" color="#fff" bg={C.danger} />
                            ) : low ? (
                              <Pill label={`Son ${s.remainingTickets} bilet`} color={C.warning} bg={C.warningBg} />
                            ) : s.remainingTickets != null ? (
                              <Pill label={`${s.remainingTickets} bilet`} color={C.success} bg={C.successBg} />
                            ) : null}
                          </View>
                          {s.sessionName ? <Text style={styles.meta}>{s.sessionName}</Text> : null}
                          <Text style={styles.meta}>{s.venue}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                            {hasDiscount ? <Text style={styles.dealOld}>{fmtMoney(s.price)}</Text> : null}
                            <Text style={styles.sessionPrice}>{fmtMoney(hasDiscount ? s.discountedPrice : s.price)}</Text>
                            {s.isSuperTicket && s.superTicketPrice ? <Pill label={`Süper ${fmtMoney(s.superTicketPrice)}`} color={C.success} bg={C.successBg} /> : null}
                            {s.hasSeatSelection ? <Text style={styles.meta}>· koltuk seçimli</Text> : null}
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                )}
                <PrimaryButton label="Bubilet'te bilet al" icon="open-outline" onPress={() => Linking.openURL(activeEvent.link)} />
              </View>
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>

      {/* Haber detayı */}
      <Modal visible={!!activeNews} animationType="slide" onRequestClose={() => setActiveNews(null)}>
        {activeNews ? (
          <SafeAreaView style={styles.safe} edges={['top']}>
            <ScreenHeader
              title="Haber"
              subtitle="Elazığ Son Haber"
              onBack={() => setActiveNews(null)}
              right={
                <TouchableOpacity onPress={() => Share.share({ title: activeNews.title, message: `${activeNews.title}\n\n${activeNews.link}` }).catch(() => {})} style={styles.iconBtn}>
                  <Ionicons name="share-social-outline" size={20} color={C.primary} />
                </TouchableOpacity>
              }
            />
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              {activeNews.imageUrl ? <Image source={{ uri: activeNews.imageUrl }} style={styles.detailImg} /> : null}
              <View style={[styles.pad, { gap: 12, marginTop: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pill label={activeNews.category} />
                  <Text style={styles.meta}>{activeNews.date}</Text>
                </View>
                <Text style={styles.detailTitle}>{activeNews.title}</Text>
                <Text style={styles.detailBody}>{activeNews.snippet}</Text>
                <PrimaryButton label="Kaynağında oku" icon="open-outline" onPress={() => Linking.openURL(activeNews.link)} />
              </View>
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { paddingBottom: 16 },
  pad: { marginHorizontal: Theme.spacing.lg },
  segment: { flexDirection: 'row', marginHorizontal: Theme.spacing.lg, marginBottom: 6, backgroundColor: C.surface, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.cardBorder, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  segBtnActive: { backgroundColor: C.primary },
  segText: { ...Theme.text.small, color: C.textMuted, fontWeight: '700' },
  segTextActive: { color: '#fff' },
  chips: { paddingHorizontal: Theme.spacing.lg, gap: 8, paddingBottom: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },

  dealsRow: { paddingHorizontal: Theme.spacing.lg, gap: 12 },
  deal: { width: 230, backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden', ...Theme.shadows.sm },
  dealImg: { width: '100%', height: 120, backgroundColor: C.surfaceSubtle },
  dealBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: C.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  dealBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  dealTitle: { ...Theme.text.h3, color: C.textPrimary },
  dealMeta: { ...Theme.text.small, color: C.textMuted },
  dealOld: { fontSize: 12, color: C.textFaint, textDecorationLine: 'line-through' },
  dealNew: { fontSize: 17, fontWeight: '800', color: C.success },
  dealLeft: { fontSize: 11, color: C.warning, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: Theme.spacing.lg },
  eventCard: { width: CARD_W, backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden', ...Theme.shadows.sm },
  eventHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  eventImg: { width: '100%', height: CARD_W * 0.625, backgroundColor: C.surfaceSubtle },
  eventDeal: { position: 'absolute', top: 8, left: 8, backgroundColor: C.danger, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  eventDealText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  eventTitle: { ...Theme.text.small, color: C.textPrimary, fontWeight: '700', lineHeight: 16, minHeight: 32 },
  eventMeta: { fontSize: 11, color: C.textMuted },
  eventDate: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  eventPrice: { fontSize: 14, fontWeight: '800', color: C.primary, marginTop: 2 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, height: 46, marginTop: 6, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, color: C.textPrimary },
  featured: { marginHorizontal: Theme.spacing.lg, marginBottom: 12, borderRadius: Theme.radius.lg, overflow: 'hidden', height: 210, ...Theme.shadows.md },
  featuredOverlay: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 6, backgroundColor: 'rgba(10,27,51,0.55)' },
  featuredTitle: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  featuredDate: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  newsCard: { flexDirection: 'row', overflow: 'hidden' },
  thumb: { width: 104, minHeight: 104, backgroundColor: C.surfaceSubtle },
  newsTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700', lineHeight: 19 },
  meta: { ...Theme.text.small, color: C.textMuted },

  detailImg: { width: '100%', height: 220, backgroundColor: C.surfaceSubtle },
  detailTitle: { ...Theme.text.h1, color: C.textPrimary, lineHeight: 30 },
  detailMeta: { ...Theme.text.body, color: C.textSecondary },
  detailBody: { ...Theme.text.body, color: C.textSecondary, lineHeight: 22 },
  sessionDate: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700', flex: 1 },
  sessionPrice: { fontSize: 18, fontWeight: '800', color: C.primary },
}));
