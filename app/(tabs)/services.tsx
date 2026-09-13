import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  StatusBar,
  Linking,
  Share,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Theme, themedStyles, useAppTheme } from '../../constants/Theme';
import { ApiService, Pharmacy, OutageItem, NewsItem } from '../../services/apiService';
import {
  EventsService,
  CityEvent,
  EventTag,
  EVENT_TAGS,
  EventSession,
  SuperTicketDeal,
} from '../../services/eventsService';
import { PrefsService } from '../../services/prefsService';
import { formatLastUpdated } from '../../services/cacheService';
import { PrayerCard } from '../../components/PrayerCard';
import {
  Card,
  Chip,
  EmptyState,
  IconCircle,
  LoadingState,
  Notice,
  Pill,
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
} from '../../components/ui';

const C = Theme.colors;
export type CityCategoryKey = 'events' | 'news' | 'pharmacy' | 'outages' | 'directory' | 'prayer';

const CATEGORIES: { key: CityCategoryKey; label: string; icon: string }[] = [
  { key: 'events', label: 'Etkinlikler', icon: 'ticket-confirmation-outline' },
  { key: 'news', label: 'Haberler', icon: 'newspaper-variant-outline' },
  { key: 'pharmacy', label: 'Eczane', icon: 'medical-bag' },
  { key: 'outages', label: 'Kesinti', icon: 'flash-alert' },
  { key: 'directory', label: 'Numaralar', icon: 'phone-classic' },
  { key: 'prayer', label: 'Namaz', icon: 'mosque' },
];

const DIRECTORY = [
  { name: 'Elazığ Belediyesi', sub: 'Çağrı merkezi', phone: '153', icon: 'office-building', color: C.primary, bg: C.surfaceVariant },
  { name: 'Acil Çağrı', sub: 'Ambulans · Polis · İtfaiye', phone: '112', icon: 'phone-alert', color: C.danger, bg: C.dangerBg },
  { name: 'Aksa Elektrik', sub: 'Arıza bildirimi', phone: '186', icon: 'flash', color: C.warning, bg: C.warningBg },
  { name: 'Su ve Kanalizasyon', sub: 'Arıza bildirimi', phone: '185', icon: 'water-pump', color: C.info, bg: C.infoBg },
  { name: 'Elazığ Valiliği', sub: 'Açık Kapı', phone: '0424 237 10 00', icon: 'shield-account', color: C.primary, bg: C.surfaceVariant },
  { name: 'FÜ Hastanesi', sub: 'Santral', phone: '0424 233 35 55', icon: 'hospital-building', color: C.uniRed, bg: C.uniRedSoft },
];

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

export default function ServicesScreen() {
  useAppTheme();
  const router = useRouter();
  const [selectedCat, setSelectedCat] = useState<CityCategoryKey>('events');

  // Eczane ve Kesintiler
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmaciesStale, setPharmaciesStale] = useState(false);
  const [pharmaciesAt, setPharmaciesAt] = useState(0);
  const [outages, setOutages] = useState<OutageItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  // Haberler
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsCat, setNewsCat] = useState('Tümü');
  const [newsQuery, setNewsQuery] = useState('');
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null);

  // Etkinlikler
  const [events, setEvents] = useState<CityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventTag, setEventTag] = useState<EventTag>('tumu');
  const [deals, setDeals] = useState<SuperTicketDeal[]>([]);
  const [activeEvent, setActiveEvent] = useState<CityEvent | null>(null);
  const [sessions, setSessions] = useState<EventSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState('');
  const [trackedSlugs, setTrackedSlugs] = useState<string[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  // Tercih edilen son kategoriyi yükle
  useEffect(() => {
    PrefsService.getCityCategory().then((cat) => {
      if (cat && CATEGORIES.some((c) => c.key === cat)) {
        setSelectedCat(cat as CityCategoryKey);
      }
    });
  }, []);

  const changeCategory = (cat: CityCategoryKey) => {
    setSelectedCat(cat);
    PrefsService.setCityCategory(cat);
  };

  const loadData = useCallback(async (force = false) => {
    const [pRes, oRes, nRes, eRes, dealsRes, tracked] = await Promise.all([
      ApiService.getPharmaciesWithCache(force).catch(() => ({ data: [], stale: true, at: 0 })),
      ApiService.getOutages().catch(() => []),
      ApiService.getNewsWithCache(force).catch(() => ({ data: [] as NewsItem[], stale: true, at: 0 })),
      EventsService.getEventsWithCache(eventTag, force).catch(() => ({ data: [] as CityEvent[], stale: true, at: 0 })),
      EventsService.getSuperTickets().catch(() => []),
      PrefsService.getTrackedEvents().catch(() => []),
    ]);

    setPharmacies(pRes.data);
    setPharmaciesStale(pRes.stale);
    setPharmaciesAt(pRes.at);
    setOutages(oRes);
    setServicesLoading(false);

    setNews(nRes.data);
    setNewsLoading(false);

    setEvents(eRes.data);
    setEventsLoading(false);

    setDeals(dealsRes);
    setTrackedSlugs(tracked.map((t) => t.slug));
  }, [eventTag]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  const navigatePharmacy = (p: Pharmacy) =>
    Linking.openURL(
      p.lat && p.lng
        ? `https://www.google.com/maps?q=${p.lat},${p.lng}`
        : `https://maps.google.com/?q=${encodeURIComponent(`${p.name} ${p.address} Elazığ`)}`
    );

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

  const dealFor = (e: CityEvent) => deals.find((d) => d.slug === e.slug);

  const filteredNews = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return news.filter(
      (n) =>
        (newsCat === 'Tümü' || n.category === newsCat) &&
        (!q || n.title.toLowerCase().includes(q) || n.snippet.toLowerCase().includes(q))
    );
  }, [news, newsCat, newsQuery]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={C.background} />

      <ScreenHeader
        title="Şehir"
        subtitle="Etkinlik, haber, nöbetçi eczane ve şehir rehberi"
        right={
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications' as any)}>
            <Ionicons name="notifications-outline" size={20} color={C.primary} />
          </TouchableOpacity>
        }
      />

      {/* Top category chips strip per DESIGN_PLAN §5 */}
      <View style={styles.catChipsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipsScroll}>
          {CATEGORIES.map((c) => {
            const active = selectedCat === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => changeCategory(c.key)}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons
                  name={c.icon as any}
                  size={16}
                  color={active ? '#fff' : C.textMuted}
                />
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.primary]}
            tintColor={C.primary}
          />
        }
      >
        {/* 1. ETKİNLİKLER */}
        {selectedCat === 'events' ? (
          <View style={styles.section}>
            {deals.length > 0 && (
              <>
                <SectionTitle title="Süper Bilet Fırsatları" subtitle={`${deals[0].setName} · sınırlı süre`} style={styles.sectionTitle} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealsRow}>
                  {deals.map((d) => (
                    <TouchableOpacity
                      key={`${d.eventId}-${d.ticketName}`}
                      style={styles.deal}
                      activeOpacity={0.9}
                      onPress={() => Linking.openURL(d.link)}
                    >
                      {d.image ? <Image source={{ uri: d.image }} style={styles.dealImg} /> : <View style={[styles.dealImg, { backgroundColor: C.surfaceSubtle }]} />}
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
            )}

            <SectionTitle title="Elazığ Etkinlikleri" subtitle="Konser, tiyatro, festival" style={styles.sectionTitle} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagChips}>
              {EVENT_TAGS.map((t) => (
                <Chip
                  key={t.id}
                  label={t.label}
                  active={eventTag === t.id}
                  onPress={() => setEventTag(t.id)}
                />
              ))}
            </ScrollView>

            {eventsLoading ? (
              <LoadingState label="Etkinlikler alınıyor..." />
            ) : events.length === 0 ? (
              <Card>
                <EmptyState icon="calendar-blank-outline" title="Etkinlik bulunamadı" description="Bu kategoride güncel etkinlik kaydı bulunmuyor." />
              </Card>
            ) : (
              <View style={styles.grid}>
                {events.map((e) => {
                  const deal = dealFor(e);
                  const isTracked = trackedSlugs.includes(e.slug);
                  return (
                    <TouchableOpacity key={e.slug} style={styles.eventCard} activeOpacity={0.88} onPress={() => openEvent(e)}>
                      <TouchableOpacity
                        style={styles.eventHeart}
                        onPress={() => handleToggleTrack(e)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name={isTracked ? 'heart' : 'heart-outline'} size={18} color={isTracked ? C.danger : '#fff'} />
                      </TouchableOpacity>
                      {e.image ? <Image source={{ uri: e.image }} style={styles.eventImg} /> : <View style={styles.eventImg} />}
                      {deal && (
                        <View style={styles.eventDeal}>
                          <Text style={styles.eventDealText}>SÜPER BİLET</Text>
                        </View>
                      )}
                      <View style={{ padding: 10, gap: 4 }}>
                        <Text style={styles.eventTitle} numberOfLines={2}>{e.title}</Text>
                        <Text style={styles.eventMeta} numberOfLines={1}>📍 {e.venue}</Text>
                        <Text style={styles.eventDate} numberOfLines={1}>📅 {e.dateText}</Text>
                        <Text style={styles.eventPrice}>{e.price != null ? fmtMoney(e.price) : 'Ücretsiz'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* 2. HABERLER */}
        {selectedCat === 'news' ? (
          <View style={styles.section}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={C.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Haberlerde ara..."
                placeholderTextColor={C.textMuted}
                value={newsQuery}
                onChangeText={setNewsQuery}
              />
              {newsQuery.length > 0 && (
                <TouchableOpacity onPress={() => setNewsQuery('')}>
                  <Ionicons name="close-circle" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagChips}>
              {NEWS_CATS.map((cat) => (
                <Chip key={cat} label={cat} active={newsCat === cat} onPress={() => setNewsCat(cat)} />
              ))}
            </ScrollView>

            {newsLoading ? (
              <LoadingState label="Haberler alınıyor..." />
            ) : filteredNews.length === 0 ? (
              <Card>
                <EmptyState icon="newspaper-variant-outline" title="Haber bulunamadı" description="Aramanıza uygun haber bulunamadı." />
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredNews.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.newsCard, { backgroundColor: C.surface, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: C.cardBorder }]}
                    onPress={() => setActiveNews(item)}
                    activeOpacity={0.85}
                  >
                    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : null}
                    <View style={{ flex: 1, padding: 12, gap: 6, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Pill label={item.category} color={C.primary} bg={C.surfaceVariant} />
                        <Text style={styles.meta}>{item.date}</Text>
                      </View>
                      <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.meta} numberOfLines={2}>{item.snippet}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* 3. ECZANE */}
        {selectedCat === 'pharmacy' ? (
          <View style={styles.section}>
            <SectionTitle
              title="Bugün Nöbetçi Eczaneler"
              subtitle={pharmaciesAt ? `Elazığ Belediyesi listesi · ${formatLastUpdated(pharmaciesAt)}` : 'Elazığ Belediyesi listesi'}
              style={styles.sectionTitle}
            />
            {pharmaciesStale && (
              <Notice tone="info" text={`Çevrimdışı — son güncelleme ${formatLastUpdated(pharmaciesAt)}`} />
            )}
            {servicesLoading ? (
              <LoadingState label="Eczaneler alınıyor..." />
            ) : pharmacies.length === 0 ? (
              <Card>
                <EmptyState icon="medical-bag" title="Liste alınamadı" description="Nöbet listesi güncellenirken sorun oluştu; yenileyin." />
              </Card>
            ) : (
              pharmacies.map((p) => (
                <Card key={p.id} style={{ gap: 10 }}>
                  <View style={styles.row}>
                    <IconCircle name="plus-thick" color={C.danger} bg={C.dangerBg} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>{p.name}</Text>
                      <Text style={styles.sub}>{[p.district, p.dutyHours].filter(Boolean).join(' · ') || 'Elazığ'}</Text>
                    </View>
                    <Pill label="24 SAAT" color={C.danger} bg={C.dangerBg} />
                  </View>
                  <View style={styles.row}>
                    <Ionicons name="location-outline" size={15} color={C.textMuted} />
                    <Text style={[styles.sub, { flex: 1 }]}>{p.address}</Text>
                  </View>
                  <View style={styles.btnRow}>
                    {p.phone ? (
                      <PrimaryButton label="Ara" icon="call" onPress={() => call(p.phone)} style={{ flex: 1 }} />
                    ) : null}
                    <PrimaryButton
                      label="Yol Tarifi"
                      icon="navigate-outline"
                      variant="outline"
                      onPress={() => navigatePharmacy(p)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </Card>
              ))
            )}
          </View>
        ) : null}

        {/* 4. KESİNTİLER */}
        {selectedCat === 'outages' ? (
          <View style={styles.section}>
            <SectionTitle title="Elektrik & Su Kesintileri" subtitle="Planlı şebeke çalışmaları" style={styles.sectionTitle} />
            {servicesLoading ? (
              <LoadingState label="Kesintiler alınıyor..." />
            ) : outages.length === 0 ? (
              <Card>
                <EmptyState
                  icon="check-circle-outline"
                  title="Aktif kesinti yok"
                  description="Elazığ genelinde planlı elektrik veya su kesintisi bulunmuyor."
                  tint={C.success}
                />
              </Card>
            ) : (
              outages.map((o) => (
                <Card key={o.id} style={{ gap: 8 }}>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Pill
                      label={o.type === 'electric' ? '⚡ Elektrik' : '💧 Su'}
                      color={o.type === 'electric' ? C.warning : C.info}
                      bg={o.type === 'electric' ? C.warningBg : C.infoBg}
                    />
                    <Text style={styles.sub}>{o.startTime} – {o.endTime}</Text>
                  </View>
                  <Text style={styles.title}>{o.title}</Text>
                  {o.region ? <Text style={styles.sub}>📍 {o.region}</Text> : null}
                  {o.description ? <Text style={styles.desc}>{o.description}</Text> : null}
                </Card>
              ))
            )}
          </View>
        ) : null}

        {/* 5. NUMARALAR */}
        {selectedCat === 'directory' ? (
          <View style={styles.section}>
            <SectionTitle title="Önemli Numaralar" subtitle="Dokunarak doğrudan arayın" style={styles.sectionTitle} />
            <View style={styles.dirGrid}>
              {DIRECTORY.map((d) => (
                <TouchableOpacity key={d.phone} style={styles.dirCard} onPress={() => call(d.phone)} activeOpacity={0.85}>
                  <IconCircle name={d.icon} color={d.color} bg={d.bg} size={44} />
                  <Text style={styles.dirName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.dirSub} numberOfLines={1}>{d.sub}</Text>
                  <Text style={styles.dirPhone}>{d.phone}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Notice tone="info" text="Acil durumlarda 112 tek numaradan ambulans, polis ve itfaiyeye ulaşırsınız." />
          </View>
        ) : null}

        {/* 6. NAMAZ */}
        {selectedCat === 'prayer' ? (
          <View style={styles.section}>
            <SectionTitle title="Namaz Vakitleri" subtitle="Elazığ için günlük vakitler" style={styles.sectionTitle} />
            <PrayerCard />
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Etkinlik Detay Modalı */}
      <Modal visible={!!activeEvent} animationType="slide" onRequestClose={() => setActiveEvent(null)}>
        {activeEvent && (
          <SafeAreaView style={styles.safe} edges={['top']}>
            <ScreenHeader
              title="Etkinlik"
              subtitle="Bubilet · Elazığ"
              onBack={() => setActiveEvent(null)}
              right={
                <TouchableOpacity onPress={() => handleToggleTrack(activeEvent)} style={styles.iconBtn}>
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
                {dealFor(activeEvent) && (
                  <Notice
                    tone="success"
                    text={`Süper Bilet: ${dealFor(activeEvent)!.ticketName} ${fmtMoney(dealFor(activeEvent)!.originalPrice)} → ${fmtMoney(dealFor(activeEvent)!.superPrice)} (${timeLeft(dealFor(activeEvent)!.expireAt)})`}
                  />
                )}
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
                            {s.isSuperTicket && s.superTicketPrice ? (
                              <Pill label={`Süper ${fmtMoney(s.superTicketPrice)}`} color={C.success} bg={C.successBg} />
                            ) : null}
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
        )}
      </Modal>

      {/* Haber Detay Modalı */}
      <Modal visible={!!activeNews} animationType="slide" onRequestClose={() => setActiveNews(null)}>
        {activeNews && (
          <SafeAreaView style={styles.safe} edges={['top']}>
            <ScreenHeader
              title="Haber"
              subtitle="Elazığ Son Haber"
              onBack={() => setActiveNews(null)}
              right={
                <TouchableOpacity
                  onPress={() => Share.share({ title: activeNews.title, message: `${activeNews.title}\n\n${activeNews.link}` }).catch(() => {})}
                  style={styles.iconBtn}
                >
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
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    content: { paddingBottom: 28 },
    pad: { marginHorizontal: Theme.spacing.lg },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },

    catChipsContainer: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
      backgroundColor: C.surface,
    },
    catChipsScroll: {
      paddingHorizontal: Theme.spacing.lg,
      gap: 8,
    },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: C.surfaceVariant,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    catChipActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    catChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textMuted,
    },
    catChipTextActive: {
      color: '#fff',
    },

    section: { paddingHorizontal: Theme.spacing.lg, gap: 10 },
    sectionTitle: { paddingHorizontal: 0, marginTop: 14, marginBottom: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { ...Theme.text.h3, color: C.textPrimary },
    sub: { ...Theme.text.small, color: C.textMuted, lineHeight: 17 },
    desc: { ...Theme.text.small, color: C.textSecondary, lineHeight: 18 },
    btnRow: { flexDirection: 'row', gap: 8 },
    dirGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    dirCard: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      padding: 14,
      gap: 4,
      ...Theme.shadows.sm,
    },
    dirName: { ...Theme.text.h3, color: C.textPrimary, marginTop: 6 },
    dirSub: { fontSize: 11, color: C.textMuted },
    dirPhone: { fontSize: 14, fontWeight: '800', color: C.primary, marginTop: 2 },

    tagChips: { gap: 8, paddingBottom: 6 },
    dealsRow: { gap: 12, paddingBottom: 4 },
    deal: {
      width: 230,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      overflow: 'hidden',
      ...Theme.shadows.sm,
    },
    dealImg: { width: '100%', height: 120, backgroundColor: C.surfaceSubtle },
    dealBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: C.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    dealBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
    dealTitle: { ...Theme.text.h3, color: C.textPrimary },
    dealMeta: { ...Theme.text.small, color: C.textMuted },
    dealOld: { fontSize: 12, color: C.textFaint, textDecorationLine: 'line-through' },
    dealNew: { fontSize: 17, fontWeight: '800', color: C.success },
    dealLeft: { fontSize: 11, color: C.warning, fontWeight: '700' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    eventCard: {
      width: CARD_W,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 1,
      borderColor: C.cardBorder,
      overflow: 'hidden',
      ...Theme.shadows.sm,
    },
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
    eventDeal: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: C.danger,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
    },
    eventDealText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    eventTitle: { ...Theme.text.small, color: C.textPrimary, fontWeight: '700', lineHeight: 16, minHeight: 32 },
    eventMeta: { fontSize: 11, color: C.textMuted },
    eventDate: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
    eventPrice: { fontSize: 14, fontWeight: '800', color: C.primary, marginTop: 2 },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.md,
      borderWidth: 1,
      borderColor: C.cardBorder,
      paddingHorizontal: 12,
      height: 46,
      marginTop: 6,
      marginBottom: 6,
    },
    searchInput: { flex: 1, fontSize: 14, color: C.textPrimary },
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
  })
);
