import { ApiService, PrayerTime, WeatherData } from './apiService';
import { PrefsService } from './prefsService';
import { ObsService, ObsTimetableEntry, ObsExamScheduleGroup } from './obsService';
import { cached } from './cacheService';

/**
 * "Günün Özeti" (L2) — Samsung Now Brief tarzı günlük özet motoru.
 *
 * Tek bir yerden tüm canlı kaynakları (hava, namaz, OBS ders/sınav, ElazığKart, favori durak,
 * haber, kesinti, yemekhane) toplar ve öncelik sırasına dizilmiş satırlar üretir. Bu satırlar:
 *  - /brief ekranında ve ana sayfa kartında gösterilir,
 *  - Sabah/akşam özet bildiriminin gövdesini oluşturur,
 *  - "Günün Özeti" ana ekran widget'ına (BriefWidgetProvider) basılır.
 *
 * Uydurma veri yok: kaynağı olmayan satır üretilmez.
 */

export type BriefTone = 'primary' | 'success' | 'warning' | 'danger' | 'gold' | 'info' | 'uni';

export interface BriefItem {
  id: string;
  /** Widget/bildirim için emoji, ekran için MaterialCommunityIcons adı */
  emoji: string;
  icon: string;
  title: string;
  subtitle?: string;
  /** Bildirim gövdesi / widget satırı için tek satırlık kısa hal */
  short: string;
  route?: string;
  tone: BriefTone;
  /** Küçük = önce gösterilir */
  priority: number;
}

export interface DailyBrief {
  greeting: string;
  /** "13 Eylül Pazar" */
  dateText: string;
  horizon: 'today' | 'tomorrow';
  items: BriefItem[];
  /** Bildirim gövdesi: en önemli 3-4 satır " · " ile birleşik */
  summaryLine: string;
  builtAt: number;
  /** Bazı kaynaklar önbellekten/eski geldi */
  partial: boolean;
}

export interface BriefBuildOptions {
  /** 'auto': 18:00 sonrası yarına bakar */
  horizon?: 'auto' | 'today' | 'tomorrow';
  /** OBS'ye giriş yapma; yalnızca önbellek kullan (widget senkronu ve arka plan için) */
  quick?: boolean;
}

const OBS_TT_CACHE = 'brief_obs_timetable_v3';
const OBS_EXAM_CACHE = 'brief_obs_exams_v3';
const OBS_TTL = 12 * 60 * 60 * 1000;

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** "DD.MM.YYYY HH:mm" → Date */
function parseObsDate(s: string): Date | null {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMoney(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} ₺`;
}

async function loadObs(
  quick: boolean
): Promise<{ entries: ObsTimetableEntry[]; exams: ObsExamScheduleGroup[]; partial: boolean; timetableUnpublished: boolean }> {
  const creds = await ObsService.getCredentials().catch(() => null);
  if (!creds?.studentNo) return { entries: [], exams: [], partial: false, timetableUnpublished: false };

  let loggedIn: boolean | null = null;
  const ensureLogin = async () => {
    if (quick) throw new Error('quick');
    if (loggedIn == null) loggedIn = await ObsService.autoLogin().catch(() => false);
    if (!loggedIn) throw new Error('OBS oturumu yok');
  };

  let partial = false;
  let entries: ObsTimetableEntry[] = [];
  let exams: ObsExamScheduleGroup[] = [];
  let timetableUnpublished = false;
  try {
    // Boş sonuç da anlamlı (program henüz yayınlanmadı) → cacheService'in boş-dizi kontrolüne takılmasın diye nesne saklanır
    const r = await cached(OBS_TT_CACHE, OBS_TTL, async () => {
      await ensureLogin();
      const tt = await ObsService.getTimetable();
      return { entries: tt.entries, notPublished: !!tt.notPublished, semester: tt.currentSemester };
    });
    entries = r.data?.entries || [];
    timetableUnpublished = !!r.data?.notPublished;
    partial = partial || r.stale;
  } catch {}
  try {
    const r = await cached(OBS_EXAM_CACHE, OBS_TTL, async () => {
      await ensureLogin();
      return (await ObsService.getExamSchedule()).groups;
    });
    exams = r.data || [];
    partial = partial || r.stale;
  } catch {}
  return { entries, exams, partial, timetableUnpublished };
}

export const BriefService = {
  async buildBrief(opts: BriefBuildOptions = {}): Promise<DailyBrief> {
    const now = new Date();
    const quick = !!opts.quick;
    const horizon: 'today' | 'tomorrow' =
      opts.horizon === 'today' || opts.horizon === 'tomorrow' ? opts.horizon : now.getHours() >= 18 ? 'tomorrow' : 'today';
    const target = new Date(now);
    if (horizon === 'tomorrow') target.setDate(target.getDate() + 1);
    const targetDayIndex = (target.getDay() + 6) % 7; // 0 = Pazartesi (OBS)
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let partial = false;
    const items: BriefItem[] = [];

    const [weather, prayer, obs, lastBalance, cardNo, favStop, news, outages, unseen, displayName, menu] = await Promise.all([
      ApiService.getWeather().catch(() => null) as Promise<WeatherData | null>,
      ApiService.getPrayerTimesAsync(horizon === 'tomorrow' ? target : undefined).catch(() => null),
      loadObs(quick),
      PrefsService.getLastBalance().catch(() => null),
      PrefsService.getElazigKartNo().catch(() => ''),
      PrefsService.getFavoriteStop().catch(() => null),
      ApiService.getNews().catch(() => []),
      ApiService.getOutages().catch(() => []),
      PrefsService.getUnseenGrades().catch(() => []),
      PrefsService.getDisplayName().catch(() => ''),
      ApiService.getDiningMenu().catch(() => null),
    ]);
    partial = partial || obs.partial;

    // ── 1. Sınavlar (bugün/yarın → en yüksek öncelik; 7 gün içinde → düşük) ──
    const upcomingExams: { course: string; name: string; date: Date; room: string }[] = [];
    for (const g of obs.exams) {
      for (const e of g.exams) {
        const d = parseObsDate(e.date);
        if (!d || d.getTime() < now.getTime() - 60 * 60 * 1000) continue;
        upcomingExams.push({ course: g.courseName || g.courseCode, name: e.examName, date: d, room: e.room });
      }
    }
    upcomingExams.sort((a, b) => a.date.getTime() - b.date.getTime());
    const examOnTarget = upcomingExams.filter((e) => sameDay(e.date, target));
    if (examOnTarget.length > 0) {
      const e = examOnTarget[0];
      const time = `${String(e.date.getHours()).padStart(2, '0')}:${String(e.date.getMinutes()).padStart(2, '0')}`;
      items.push({
        id: 'exam',
        emoji: '📝',
        icon: 'calendar-alert',
        title: `${horizon === 'tomorrow' ? 'Yarın' : 'Bugün'} sınav: ${e.course}`,
        subtitle: `${e.name} · ${time}${e.room ? ` · ${e.room}` : ''}${examOnTarget.length > 1 ? ` · +${examOnTarget.length - 1} sınav daha` : ''}`,
        short: `${horizon === 'tomorrow' ? 'Yarın' : 'Bugün'} sınav ${time}: ${e.course}`,
        route: '/obs',
        tone: 'danger',
        priority: 1,
      });
    } else if (upcomingExams.length > 0) {
      const e = upcomingExams[0];
      const days = Math.ceil((e.date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (days <= 7) {
        items.push({
          id: 'exam-soon',
          emoji: '📝',
          icon: 'calendar-clock',
          title: `${days} gün sonra sınav: ${e.course}`,
          subtitle: `${e.name} · ${e.date.getDate()} ${MONTHS[e.date.getMonth()]}${e.room ? ` · ${e.room}` : ''}`,
          short: `${days} gün sonra sınav: ${e.course}`,
          route: '/obs',
          tone: 'uni',
          priority: 40,
        });
      }
    }

    // ── 2. Dersler ────────────────────────────────────────────────────────────
    const lessons = obs.entries
      .filter((e) => e.dayIndex === targetDayIndex && toMinutes(e.startTime) != null)
      .sort((a, b) => (toMinutes(a.startTime) || 0) - (toMinutes(b.startTime) || 0));
    if (lessons.length > 0) {
      const remaining = horizon === 'today' ? lessons.filter((l) => (toMinutes(l.endTime) ?? toMinutes(l.startTime) ?? 0) >= nowMin) : lessons;
      if (remaining.length > 0) {
        const first = remaining[0];
        const isNowOngoing = horizon === 'today' && (toMinutes(first.startTime) ?? 0) <= nowMin;
        items.push({
          id: 'lesson',
          emoji: '📚',
          icon: 'book-clock-outline',
          title: isNowOngoing ? `Şu an: ${first.courseName}` : `${horizon === 'tomorrow' ? 'Yarın ilk ders' : 'Sıradaki ders'} ${first.startTime}`,
          subtitle: `${isNowOngoing ? `${first.endTime}'e kadar` : first.courseName}${first.room ? ` · ${first.room}` : ''} · ${lessons.length} ders`,
          short: `${lessons.length} ders, ${isNowOngoing ? 'şu an' : horizon === 'tomorrow' ? 'yarın ilk' : 'sıradaki'} ${first.startTime} ${first.courseName}`,
          route: '/obs',
          tone: 'uni',
          priority: 5,
        });
      } else {
        items.push({
          id: 'lesson-done',
          emoji: '✅',
          icon: 'check-circle-outline',
          title: 'Bugünkü dersler bitti',
          subtitle: `${lessons.length} ders tamamlandı`,
          short: 'Bugünkü dersler bitti',
          route: '/obs',
          tone: 'success',
          priority: 60,
        });
      }
    } else if (obs.timetableUnpublished) {
      items.push({
        id: 'lesson-unpublished',
        emoji: '📭',
        icon: 'calendar-remove-outline',
        title: 'Ders programı henüz yayınlanmadı',
        subtitle: 'OBS güncel yarıyıl için program girmemiş — yayınlanınca burada görünür',
        short: 'Ders programı henüz yayınlanmadı',
        route: '/obs',
        tone: 'info',
        priority: 35,
      });
    } else if (obs.entries.length > 0) {
      items.push({
        id: 'lesson-free',
        emoji: '🎉',
        icon: 'party-popper',
        title: `${horizon === 'tomorrow' ? 'Yarın' : 'Bugün'} ders yok`,
        short: `${horizon === 'tomorrow' ? 'Yarın' : 'Bugün'} ders yok`,
        route: '/obs',
        tone: 'success',
        priority: 55,
      });
    }

    // ── 3. Görülmemiş notlar ────────────────────────────────────────────────
    if (unseen.length > 0) {
      items.push({
        id: 'grades',
        emoji: '🆕',
        icon: 'clipboard-check-outline',
        title: unseen.length === 1 ? `Yeni not: ${unseen[0].courseCode}` : `${unseen.length} yeni not açıklandı`,
        subtitle: unseen.length === 1 ? `${unseen[0].label}: ${unseen[0].newValue}` : unseen.map((u) => u.courseCode).slice(0, 3).join(', '),
        short: unseen.length === 1 ? `Yeni not: ${unseen[0].courseCode} ${unseen[0].newValue}` : `${unseen.length} yeni not`,
        route: '/obs',
        tone: 'warning',
        priority: 8,
      });
    }

    // ── 4. Favori durak canlı varış (yalnızca bugün ve hızlı modda değil) ────
    if (favStop && horizon === 'today') {
      const buses = quick ? [] : await ApiService.getStationRemainingTime(favStop.id).catch(() => []);
      const b = buses[0];
      if (b && b.remainingTimeCurr != null) {
        items.push({
          id: 'bus',
          emoji: '🚌',
          icon: 'bus-clock',
          title: `Hat ${b.busLineNo} · ${b.remainingTimeCurr} dk`,
          subtitle: `${favStop.name}${b.busLineLongName ? ` · ${b.busLineLongName}` : ''}`,
          short: `Hat ${b.busLineNo} ${b.remainingTimeCurr} dk (${favStop.name})`,
          route: `/(tabs)/transit?stopId=${encodeURIComponent(favStop.id)}`,
          tone: 'primary',
          priority: 10,
        });
      }
    }

    // ── 5. ElazığKart bakiyesi ──────────────────────────────────────────────
    let balance: number | null = null;
    let balanceStale = false;
    if (cardNo && !quick) {
      const res = await ApiService.queryCardBalance(cardNo).catch(() => null);
      if (res?.success && res.bakiye != null) balance = res.bakiye;
    }
    if (balance == null && lastBalance) {
      balance = lastBalance.balance;
      balanceStale = true;
    }
    if (balance != null) {
      const low = balance < 20;
      items.push({
        id: 'balance',
        emoji: low ? '⚠️' : '💳',
        icon: 'credit-card-chip-outline',
        title: `ElazığKart ${formatMoney(balance)}`,
        subtitle: low ? 'Bakiye düşük — dolum bayilerini göster' : balanceStale ? 'Son sorgudan' : 'Güncel bakiye',
        short: `Bakiye ${formatMoney(balance)}${low ? ' (düşük)' : ''}`,
        route: low ? '/fillingcenters' : '/(tabs)/index',
        tone: low ? 'danger' : 'primary',
        priority: low ? 6 : 30,
      });
    }

    // ── 6. Namaz vakti ──────────────────────────────────────────────────────
    if (prayer?.times?.length) {
      let next: PrayerTime | undefined = horizon === 'today' ? prayer.nextPrayer : prayer.times.find((t) => t.name === 'Fajr') || prayer.times[0];
      if (next && !/sunrise|güneş/i.test(next.name)) {
        let short = `${next.nameTr || next.name} ${next.time}`;
        let subtitle = 'Elazığ';
        if (horizon === 'today') {
          const nm = toMinutes(next.time);
          if (nm != null) {
            let diff = nm - nowMin;
            if (diff < 0) diff += 24 * 60;
            const txt = diff >= 60 ? `${Math.floor(diff / 60)} sa ${diff % 60} dk` : `${diff} dk`;
            subtitle = `${txt} kaldı · Elazığ`;
            short = `${next.nameTr || next.name} ${next.time} (${txt})`;
          }
        }
        items.push({
          id: 'prayer',
          emoji: '🕌',
          icon: 'mosque',
          title: `${next.nameTr || next.name} · ${next.time}`,
          subtitle,
          short,
          route: '/brief',
          tone: 'gold',
          priority: 20,
        });
      }
    }

    // ── 7. Hava durumu ──────────────────────────────────────────────────────
    if (weather) {
      const cold = weather.tempC <= 3;
      const rainy = /yağmur|kar|sağanak|fırtına|rain|snow|storm|drizzle/i.test(`${weather.conditionTr} ${weather.conditionText}`);
      items.push({
        id: 'weather',
        emoji: rainy ? '🌧️' : cold ? '🥶' : '☀️',
        icon: rainy ? 'weather-pouring' : cold ? 'snowflake' : 'weather-partly-cloudy',
        title: `${Math.round(weather.tempC)}°C · ${weather.conditionTr || weather.conditionText}`,
        subtitle: `${rainy ? 'Şemsiye almayı unutma · ' : ''}Nem %${weather.humidity} · Rüzgar ${Math.round(weather.windKph)} km/s`,
        short: `${Math.round(weather.tempC)}° ${weather.conditionTr || weather.conditionText}${rainy ? ' (şemsiye!)' : ''}`,
        route: '/(tabs)/index',
        tone: rainy ? 'info' : 'warning',
        priority: rainy ? 12 : 25,
      });
    }

    // ── 8. Planlı kesinti (bugün/yarın) ──────────────────────────────────────
    // Tarih yalnızca description içinde ("... 31.07.2026 tarihinde ..."); startTime/endTime "HH:mm"
    const outage = outages.find((o) => {
      const d = parseObsDate(o.description || '') || parseObsDate(o.startTime || '');
      return d ? sameDay(d, target) : false;
    });
    if (outage) {
      items.push({
        id: 'outage',
        emoji: '⚡',
        icon: 'flash-alert-outline',
        title: `${horizon === 'tomorrow' ? 'Yarın' : 'Bugün'} elektrik kesintisi`,
        subtitle: `${outage.region} · ${outage.startTime}–${outage.endTime}`,
        short: `Kesinti: ${outage.region}`,
        route: '/(tabs)/index',
        tone: 'warning',
        priority: 15,
      });
    }

    // ── 9. Yemekhane (yalnızca öğrenciler ve bugün) ────────────────────────
    if (obs.entries.length > 0 && horizon === 'today' && menu && menu.lunch?.length) {
      const names = menu.lunch.map((m) => m.name).filter(Boolean);
      if (names.length) {
        items.push({
          id: 'dining',
          emoji: '🍽️',
          icon: 'silverware-fork-knife',
          title: 'Yemekhane menüsü',
          subtitle: names.slice(0, 4).join(' · '),
          short: `Yemek: ${names.slice(0, 2).join(', ')}`,
          route: '/(tabs)/university',
          tone: 'success',
          priority: 45,
        });
      }
    }

    // ── 10. Manşet ─────────────────────────────────────────────────────────
    if (news[0]) {
      items.push({
        id: 'news',
        emoji: '📰',
        icon: 'newspaper-variant-outline',
        title: news[0].title,
        subtitle: news[0].category || 'Şehir haberleri',
        short: news[0].title,
        route: '/(tabs)/news',
        tone: 'info',
        priority: 50,
      });
    }

    items.sort((a, b) => a.priority - b.priority);

    const firstName = (displayName || '').trim().split(' ')[0];
    const greeting = `${greetingFor(now)}${firstName ? `, ${firstName}` : ''}`;
    const dateText = `${target.getDate()} ${MONTHS[target.getMonth()]} ${DAY_NAMES[target.getDay()]}`;
    const summaryLine = items
      .filter((i) => i.id !== 'news')
      .slice(0, 4)
      .map((i) => i.short)
      .join(' · ');

    return { greeting, dateText, horizon, items, summaryLine, builtAt: Date.now(), partial };
  },

  /**
   * Haftalık ders programının native tarafa yazılacak kompakt hali (LiveNotifications.KEY_LESSONS_JSON):
   * [{ d: 0=Pazartesi, s: "HH:mm", e: "HH:mm", c: ders adı, r: derslik }].
   * OBS hesabı yoksa ya da program yayınlanmamışsa "[]"; quick modda önbellek de yoksa null
   * (bilinmiyor → native taraftaki eski program ezilmesin).
   */
  async getLessonsJson(opts: { quick?: boolean } = {}): Promise<string | null> {
    const creds = await ObsService.getCredentials().catch(() => null);
    if (!creds?.studentNo) return '[]';
    const obs = await loadObs(!!opts.quick);
    if (obs.entries.length === 0 && !obs.timetableUnpublished) return null;
    const rows = obs.entries
      .filter((e) => toMinutes(e.startTime) != null)
      .map((e) => ({ d: e.dayIndex, s: e.startTime, e: e.endTime, c: e.courseName || e.courseCode, r: e.room || '' }));
    return JSON.stringify(rows);
  },

  /** Widget'a basılacak düz anahtar/değer haritası (BriefWidgetProvider ile uyumlu) */
  toWidgetData(brief: DailyBrief): Record<string, string> {
    const data: Record<string, string> = {
      brief_title: brief.greeting,
      brief_subtitle: `${brief.horizon === 'tomorrow' ? 'Yarın · ' : ''}${brief.dateText}`,
    };
    for (let i = 0; i < 4; i++) {
      const it = brief.items[i];
      data[`brief_icon_${i + 1}`] = it ? it.emoji : '';
      data[`brief_line_${i + 1}`] = it ? it.short : '';
    }
    return data;
  },
};
