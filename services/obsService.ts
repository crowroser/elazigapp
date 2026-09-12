import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GradeSnapshot, GradeChange, GradeCourseSnapshot } from './prefsService';

/**
 * Fırat Üniversitesi OBS (obs.firat.edu.tr / Proliz OİBS) servisi.
 *
 * Doğrulanmış akış (Eylül 2026, gerçek hesapla test edildi):
 *  - Giriş: CAS (jasig.firat.edu.tr) → ticket → /oibs/std → start.aspx?gkm → index.aspx
 *  - Menü sayfaları: caller.aspx?curPage=N → start.aspx?gkm=… → gerçek sayfa (.aspx)
 *  - Dönem değiştirme: sayfa GET'inin HEMEN ardından aynı sayfaya ASP.NET AJAX postback.
 *    Araya başka sayfa girerse sunucu postback'i reddedip caller.aspx'e yönlendirir.
 *  - Transkript menüsü PDF döndürür; ders geçmişi "Alınan Dersler"in dönemlerinden derlenir.
 *
 * React Native notları:
 *  - RN fetch `redirect:'manual'`ı yok sayar, 3xx'leri otomatik takip eder; `Response.url` son adrestir.
 *  - Android'de çerezler native (WebView CookieManager) depoda tutulur ve otomatik gönderilir;
 *    CAS SSO çerezi (CASTGC) kalıcı olduğu için ikinci girişte CAS formu yerine doğrudan OBS
 *    açılabilir — bu durum "zaten giriş yapılmış" olarak ele alınır.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ObsExam {
  sinavTuru: string;
  alinanNot: string;
  ilanTarihi: string;
  sinifOrtalamasi: string;
}

export interface ObsGrade {
  courseCode: string;
  courseName: string;
  average: number | null;
  letterGrade: string;
  status: string;
  exams: ObsExam[];
  /** rptNotListesi$ctlNN$btnIstatistik için sıra numarası (istatistik yoksa null) */
  statsIndex: number | null;
}

export interface ObsGradeBand {
  letter: string;
  min: string;
  max: string;
  rawMin: string;
  rawMax: string;
  count: number;
}

export interface ObsGradeDistribution {
  title: string; // "Final", "Bütünleme"
  bands: ObsGradeBand[];
  resultStatus: string;
  resultDate: string;
  evaluation: string;
  calculation: string;
  attended: string;
  classAverage: string;
  averageBase: string;
  stdDev: string;
  table: string;
  classLevel: string;
}

export interface ObsExamParticipation {
  name: string;
  weight: string;
  announced: string;
  listed: string;
  attended: string;
  absent: string;
  failedByAbsence: string;
  average: string;
}

export interface ObsGradeStatistics {
  facultyProgram: string;
  instructor: string;
  courseCode: string;
  courseName: string;
  rules: { label: string; value: string }[];
  distributions: ObsGradeDistribution[];
  exams: ObsExamParticipation[];
}

export interface ObsSemester {
  code: string;
  name: string;
}

export interface ObsGradeResult {
  grades: ObsGrade[];
  semesters: ObsSemester[];
  currentSemester: string;
}

export interface ObsStudentInfo {
  studentNo: string;
  fullName: string;
  faculty: string;
  department: string;
  university: string;
  activeSemester: string;
  profilFotoUrl?: string;
}

export interface ObsAcademicSummary {
  agno: number | null;
  ogrenimDurumu: string;
  okuduguDonem: string;
  normalSure: string;
  azamiSure: string;
  kayitTarihi: string;
  kayitNedeni: string;
  onayliDers: string;
  onaysizDers: string;
  sonOnayTarihi: string;
  mufredat: string;
  sinif: string;
  bilgilendirme: string;
  tcKimlikMaskeli: string;
}

export interface ObsAdvisor {
  adSoyad: string;
  fakulte: string;
  bolum: string;
  program: string;
  telefon: string;
  eposta: string;
}

export interface ObsTimetableEntry {
  day: string;
  dayIndex: number; // 0 = Pazartesi
  time: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  room: string;
  instructor: string;
}

export interface ObsTimetableResult {
  entries: ObsTimetableEntry[];
  semesters: ObsSemester[];
  currentSemester: string;
}

export interface ObsTakenCourse {
  code: string;
  name: string;
  section: string;
  credit: number;
  akts: number;
  tu: string;
  instructor: string;
  program: string;
  letterGrade: string;
}

export interface ObsTakenCoursesResult {
  courses: ObsTakenCourse[];
  semesters: ObsSemester[];
  currentSemester: string;
  totalCredit: number;
  totalAkts: number;
}

export interface ObsAttendanceRow {
  code: string;
  name: string;
  tu: string;
  credit: string;
  classYear: string;
  program: string;
  status: string;
  detail: string;
}

export interface ObsAttendanceResult {
  rows: ObsAttendanceRow[];
  semesters: ObsSemester[];
  currentSemester: string;
}

export interface ObsExamScheduleItem {
  examName: string;
  date: string;
  weight: string;
  canEnter: string;
  room: string;
}

export interface ObsExamScheduleGroup {
  courseCode: string;
  courseName: string;
  exams: ObsExamScheduleItem[];
}

export interface ObsExamScheduleResult {
  groups: ObsExamScheduleGroup[];
  semesters: ObsSemester[];
  currentSemester: string;
}

export interface ObsSemesterHistory {
  semester: ObsSemester;
  courses: ObsTakenCourse[];
  totalCredit: number;
  totalAkts: number;
  passed: number;
  failed: number;
}

export interface ObsDashboard {
  student: ObsStudentInfo;
  academic: ObsAcademicSummary | null;
  advisor: ObsAdvisor | null;
}

// ─── F9: Harç Bilgileri ──────────────────────────────────────────────────────

export interface ObsTuitionItem {
  date: string;
  amount: string;
  description: string;
  /** Dönem adı (ör. "2026-2027 Güz Yarıyılı") */
  bank: string;
  kind: 'payment' | 'accrual' | 'other';
  refund: string;
  dueDate: string;
}

export interface ObsTuitionResult {
  accrued: string;
  paid: string;
  balance: string;
  hasDebt: boolean;
  debtNotice?: string;
  items: ObsTuitionItem[];
  semesters: ObsSemester[];
  currentSemester: string;
}

// ─── F9: Akademik Takvim ─────────────────────────────────────────────────────

export interface ObsCalendarItem {
  title: string;
  startDate: string;
  endDate: string;
  rawDate: string;
  isPast: boolean;
  isCurrent: boolean;
}

export interface ObsAcademicCalendarResult {
  title: string;
  items: ObsCalendarItem[];
}

// ─── F9: Müfredat Durum ──────────────────────────────────────────────────────

export interface ObsCurriculumCourse {
  code: string;
  name: string;
  credit: number;
  akts: number;
  isCompulsory: boolean;
  status: 'passed' | 'failed' | 'current' | 'not_taken';
  letterGrade?: string;
}

export interface ObsCurriculumSemester {
  semesterNumber: number;
  title: string;
  courses: ObsCurriculumCourse[];
  totalAkts: number;
  completedAkts: number;
}

export interface ObsCurriculumResult {
  semesters: ObsCurriculumSemester[];
  totalRequiredAkts: number;
  totalCompletedAkts: number;
  completionPercentage: number;
}

// ─── F10: Gelen Mesajlar ─────────────────────────────────────────────────────

export interface ObsMessage {
  id: string;
  sender: string;
  subject: string;
  date: string;
  isRead: boolean;
  selectTarget?: string;
}

export interface ObsMessagesResult {
  messages: ObsMessage[];
  unreadCount: number;
}

export interface ObsMessageDetail {
  id: string;
  sender: string;
  subject: string;
  date: string;
  body: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OBS_ORIGIN = 'https://obs.firat.edu.tr';
const OBS_STD = `${OBS_ORIGIN}/oibs/std`;
const CAS_LOGIN_URL = `https://jasig.firat.edu.tr/cas/login?service=${encodeURIComponent(`${OBS_ORIGIN}/oibs/std`)}`;
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const INDEX_REFERER = `${OBS_STD}/index.aspx?curOp=0`;

/** caller.aspx?curPage=N — menü başlıkları bulunamazsa kullanılan doğrulanmış sayfa numaraları */
const PAGE = {
  ozluk: 100,
  danisman: 102,
  alinanDersler: 103,
  harc: 110, // ogrenci_harc_bilgileri_devlet.aspx (doğrulandı)
  sinavTakvimi: 105,
  akademikTakvim: 0, // caller numarası bilinmiyor; menü (gkm) bağlantısı kullanılır
  notListesi: 107,
  dersProgrami: 108,
  transkriptPdf: 109,
  mufredatDurum: 0, // caller numarası bilinmiyor; menü (gkm) bağlantısı kullanılır
  genelBilgiler: 111,
  gelenMesajlar: 0, // caller numarası bilinmiyor; menü (gkm) bağlantısı kullanılır
  devamsizlik: 205,
} as const;

const SECURE_KEY_STUDENT_NO = 'obs_student_no';
const SECURE_KEY_PASSWORD = 'obs_password';

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

// ─── Session State ───────────────────────────────────────────────────────────

let cookieJar = '';
let isSessionValid = false;
let menuUrls: Record<string, string> = {};
let cachedStudent: ObsStudentInfo | null = null;
let cachedAcademic: ObsAcademicSummary | null = null;
let cachedAdvisor: ObsAdvisor | null = null;
let loginPromise: Promise<boolean> | null = null;

// ─── Small helpers ───────────────────────────────────────────────────────────

function extractSetCookies(headers: Headers): string[] {
  const out: string[] = [];
  const anyH = headers as any;
  if (typeof anyH.getSetCookie === 'function') {
    (anyH.getSetCookie() as string[]).forEach((c) => out.push(c));
  } else {
    const raw = headers.get('set-cookie');
    if (raw) raw.split(/,(?=\s*[^;=,]+=[^;=,]+)/).forEach((c) => out.push(c));
  }
  return out
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.includes('='));
}

function rememberCookies(headers: Headers) {
  const map = new Map<string, string>();
  cookieJar.split(';').forEach((p) => {
    const t = p.trim();
    const i = t.indexOf('=');
    if (i > 0) map.set(t.slice(0, i), t.slice(i + 1));
  });
  extractSetCookies(headers).forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) map.set(c.slice(0, i), c.slice(i + 1));
  });
  cookieJar = Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function baseHeaders(referer?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
  };
  if (cookieJar) h.Cookie = cookieJar;
  if (referer) h.Referer = referer;
  return h;
}

function absolutize(url: string, base = `${OBS_STD}/`): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return OBS_ORIGIN + url;
  return base + url;
}

function decodeEntities(text: string): string {
  return (text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&uuml;/g, 'ü')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&ouml;/g, 'ö')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&Ccedil;/g, 'Ç');
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** HTML'i satır satır düz metne çevirir (etiket sınırlarında satır sonu) */
function toLines(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function hiddenValue(html: string, name: string): string {
  const m = html.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'));
  return m ? m[1] : '';
}

/** Yalnızca cmbDonemler <select>'inin seçeneklerini döner */
function parseSemesters(html: string): { semesters: ObsSemester[]; selected: string } {
  const sel = html.match(/<select[^>]*(?:id|name)=["'][^"']*cmbDonemler[^"']*["'][^>]*>([\s\S]*?)<\/select>/i);
  const semesters: ObsSemester[] = [];
  let selected = '';
  if (!sel) return { semesters, selected };
  const re = /<option\s+([^>]*?)value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(sel[1])) !== null) {
    const code = m[2].trim();
    const name = textOf(m[3]);
    if (!code || !name) continue;
    if (/\bselected\b/i.test(m[1]) && !selected) selected = code;
    semesters.push({ code, name });
  }
  return { semesters, selected };
}

/** ASP.NET AJAX UpdatePanel delta çözücü (…|len|updatePanel|UpdatePanel1|<html>|…) */
function unwrapUpdatePanel(raw: string, panelId = 'UpdatePanel1'): string {
  const marker = `updatePanel|${panelId}|`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return raw;
  const parts = raw.substring(0, idx).split('|');
  const length = parseInt(parts[parts.length - 2], 10);
  const start = idx + marker.length;
  return isNaN(length) ? raw.substring(start) : raw.substring(start, start + length);
}

function isCasLoginPage(html: string): boolean {
  return /id=["']fm1["']/i.test(html) || /name=["']lt["']\s+value=/i.test(html);
}

function isObsAuthenticatedPage(html: string): boolean {
  return (
    html.includes('lblOgrenciAdSoyad') ||
    html.includes('menu_close(') ||
    html.includes('nav-treeview') ||
    html.includes('rptNotListesi') ||
    html.includes('cmbDonemler') ||
    html.includes('rpt-panel')
  );
}

function extractCasError(html: string): string {
  const m =
    html.match(/<div[^>]*id=["']msg["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*class=["'][^"']*\berrors\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  return m ? textOf(m[1]) : '';
}

// ─── HTTP layer ──────────────────────────────────────────────────────────────

interface PageResponse {
  status: number;
  url: string;
  html: string;
}

/** 3xx zincirini takip ederek sayfayı getirir (RN'de zaten otomatik; Node'da elle) */
async function fetchPage(url: string, referer?: string, maxHops = 8): Promise<PageResponse> {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const resp = await fetch(current, { headers: baseHeaders(referer), redirect: 'manual' as any });
    rememberCookies(resp.headers);
    const loc = resp.headers.get('location');
    if ([301, 302, 303, 307, 308].includes(resp.status) && loc) {
      current = absolutize(loc, current.substring(0, current.lastIndexOf('/') + 1));
      continue;
    }
    const html = await resp.text();
    return { status: resp.status, url: (resp as any).url || current, html };
  }
  throw new Error('OBS çok fazla yönlendirme yaptı.');
}

/**
 * OBS bazı geçişlerde "Yönlendirme Yapılıyor" başlıklı, JS ile kendini start.aspx?gkm=…'e
 * POST eden bir ara sayfa döndürür. Bu formu elle gönderip hedef sayfayı getirir.
 */
async function followAutoPostForm(page: PageResponse): Promise<PageResponse> {
  const form = page.html.match(/<form[^>]*method=["']post["'][^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
  if (!form || !/start\.aspx\?gkm=/i.test(form[1])) return page;
  const action = absolutize(decodeEntities(form[1]).replace(/^\.\//, ''), page.url.substring(0, page.url.lastIndexOf('/') + 1));
  const body = new URLSearchParams();
  const inputRe = /<input[^>]*type=["']hidden["'][^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi;
  let m;
  while ((m = inputRe.exec(form[2])) !== null) body.append(m[1], decodeEntities(m[2]));
  const resp = await fetch(action, {
    method: 'POST',
    headers: { ...baseHeaders(page.url), 'Content-Type': 'application/x-www-form-urlencoded', Origin: OBS_ORIGIN },
    body: body.toString(),
    redirect: 'manual' as any,
  });
  rememberCookies(resp.headers);
  const loc = resp.headers.get('location');
  if ([301, 302, 303, 307, 308].includes(resp.status) && loc) return fetchPage(absolutize(loc), page.url);
  return { status: resp.status, url: (resp as any).url || action, html: await resp.text() };
}

/** OBS'ye giriş (CAS). Aynı anda birden fazla çağrı tek girişe indirgenir. (kuyruk dışı iç sürüm) */
function loginRaw(studentNo: string, password: string): Promise<boolean> {
  if (loginPromise) return loginPromise;
  loginPromise = casLogin(studentNo, password).finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

/** Kayıtlı kimlikle giriş (kuyruk dışı iç sürüm; sayfa akışlarının içinden çağrılır) */
async function autoLoginRaw(): Promise<boolean> {
  const creds = await ObsService.getCredentials();
  if (!creds) return false;
  try {
    return await loginRaw(creds.studentNo, creds.password);
  } catch {
    return false;
  }
}

/** caller.aspx?curPage=N üzerinden bir OBS sayfasını açar (oturum düşmüşse yeniden giriş dener) */
async function openPage(menuTitle: string, curPage: number, retry = true): Promise<PageResponse> {
  if (!isSessionValid) {
    const ok = await autoLoginRaw();
    if (!ok) throw new Error('OBS oturumu başlatılamadı. Lütfen tekrar giriş yapın.');
  }
  const url = menuUrls[menuTitle] || (curPage > 0 ? `${OBS_STD}/caller.aspx?curPage=${curPage}` : '');
  if (!url) throw new Error(`OBS menüsünde "${menuTitle}" bağlantısı bulunamadı.`);
  const page = await fetchPage(url, INDEX_REFERER);
  if (isCasLoginPage(page.html) || (!isObsAuthenticatedPage(page.html) && page.html.length < 3000)) {
    isSessionValid = false;
    if (retry) {
      const ok = await autoLoginRaw();
      if (ok) return openPage(menuTitle, curPage, false);
    }
    throw new Error('OBS oturumu sona erdi. Lütfen tekrar giriş yapın.');
  }
  // Menüde gkm URL'i yoksa (fallback ile açıldıysa) gerçek sayfa URL'ini not et
  return page;
}

/**
 * Delta yanıtındaki |hiddenField|__VIEWSTATE|…| alanlarını gizli input olarak HTML'e ekler;
 * böylece aynı sayfaya art arda postback yapılabilir (ViewState her postback'te değişir).
 */
function pageFromDelta(page: PageResponse, raw: string): PageResponse {
  const panel = unwrapUpdatePanel(raw);
  let hidden = '';
  const re = /\|(\d+)\|hiddenField\|([^|]+)\|/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const len = parseInt(m[1], 10);
    const start = m.index + m[0].length;
    const val = raw.substring(start, start + len);
    hidden += `<input type="hidden" name="${m[2]}" value="${val}" />`;
  }
  return { status: 200, url: page.url, html: panel + hidden };
}

/** Sayfa GET'inin hemen ardından ASP.NET AJAX (UpdatePanel) postback'i yapar; panel HTML'ini döner */
async function postback(
  page: PageResponse,
  target: string,
  value: string,
  extra: Record<string, string> = {}
): Promise<string> {
  const next = await postbackPage(page, target, value, extra);
  return next.html;
}

/** postback() ile aynı, ancak zincirlenebilir PageResponse döner (raw delta `.raw` içinde) */
async function postbackPage(
  page: PageResponse,
  target: string,
  value: string,
  extra: Record<string, string> = {}
): Promise<PageResponse & { raw: string }> {
  const body = new URLSearchParams();
  body.append('ScriptManager1', `UpdatePanel1|${target}`);
  body.append('__EVENTTARGET', target);
  body.append('__EVENTARGUMENT', '');
  body.append('__LASTFOCUS', '');
  body.append('__VIEWSTATE', hiddenValue(page.html, '__VIEWSTATE'));
  body.append('__VIEWSTATEGENERATOR', hiddenValue(page.html, '__VIEWSTATEGENERATOR'));
  const ev = hiddenValue(page.html, '__EVENTVALIDATION');
  if (ev) body.append('__EVENTVALIDATION', ev);
  body.append('__SCROLLPOSITIONX', '0');
  body.append('__SCROLLPOSITIONY', '0');
  if (value) body.append(target, value);
  Object.entries(extra).forEach(([k, v]) => body.append(k, v));
  body.append('__ASYNCPOST', 'true');

  const resp = await fetch(page.url, {
    method: 'POST',
    headers: {
      ...baseHeaders(page.url),
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: OBS_ORIGIN,
      'X-Requested-With': 'XMLHttpRequest',
      'X-MicrosoftAjax': 'Delta=true',
    },
    body: body.toString(),
  });
  rememberCookies(resp.headers);
  const raw = await resp.text();
  if (raw.includes('|pageRedirect|') || raw.includes('Object moved')) {
    throw new Error('OBS sayfa durumu değişti, lütfen tekrar deneyin.');
  }
  return { ...pageFromDelta(page, raw), raw };
}

/**
 * Dönem seçmeli sayfalar için ortak akış:
 * sayfayı aç → istenen dönem seçili değilse postback ile değiştir → panel HTML'ini döndür
 */
async function loadSemesterPage(
  menuTitle: string,
  curPage: number,
  semesterCode?: string
): Promise<{ html: string; semesters: ObsSemester[]; current: string; page: PageResponse }> {
  const page = await openPage(menuTitle, curPage);
  const { semesters, selected } = parseSemesters(page.html);
  const target = semesterCode || selected || semesters[0]?.code || '';
  if (target && target !== selected && semesters.some((s) => s.code === target)) {
    const next = await postbackPage(page, 'cmbDonemler', target);
    return { html: next.html, semesters, current: target, page: next };
  }
  return { html: page.html, semesters, current: target, page };
}

// ─── Login ───────────────────────────────────────────────────────────────────

function parseIndex(html: string, studentNo: string) {
  const get = (id: string) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/(?:span|label|div|a)>`, 'i'));
    return m ? textOf(m[1]) : '';
  };
  const adSoyadRaw = get('lblOgrenciAdSoyad') || get('lblOgrenciAdSoyad2');
  const fullName = adSoyadRaw.replace(/^\d+\s*-\s*/, '').trim();
  const fakulteBolum = get('lblOgrenciFakulte');
  const [faculty, department] = fakulteBolum.includes('/')
    ? fakulteBolum.split('/').map((s) => s.trim())
    : [fakulteBolum, ''];
  const photo = html.match(/zfs\.aspx\?gkm=([a-zA-Z0-9%_-]+)/i);

  cachedStudent = {
    studentNo,
    fullName: fullName || studentNo,
    faculty,
    department,
    university: get('lblUniAd'),
    activeSemester: get('lblAktifDonem'),
    profilFotoUrl: photo ? `${OBS_ORIGIN}/oibs/zfs.aspx?gkm=${photo[1]}` : undefined,
  };

  // Menü: <a onclick="menu_close(this,'/oibs/start.aspx?gkm=…')"> … <p>Başlık</p>
  menuUrls = {};
  const leaf = /<a\b[^>]*?(?:onclick=["']menu_close\(this,\s*['"]([^'"]+)['"]\)|href=['"]([^'"]+)['"])[^>]*>(?:(?!<\/a>)[\s\S])*?<p[^>]*>\s*([^<]+?)\s*<\/p>/gi;
  let m;
  while ((m = leaf.exec(html)) !== null) {
    const raw = m[1] || m[2];
    const title = decodeEntities(m[3]).trim();
    if (raw && raw !== '#' && title && !menuUrls[title]) menuUrls[title] = absolutize(raw);
  }
}

async function casLogin(studentNo: string, password: string): Promise<boolean> {
  isSessionValid = false;
  cachedStudent = null;
  cachedAcademic = null;
  cachedAdvisor = null;
  menuUrls = {};

  // 1) CAS giriş sayfası. SSO çerezi (CASTGC) hâlâ geçerliyse CAS formu göstermeden
  //    ticket ile OBS'ye yollar; OBS de mevcut oturum varsa ara (auto-post) sayfa döndürebilir.
  let casPage = await fetchPage(CAS_LOGIN_URL);
  if (!isCasLoginPage(casPage.html)) {
    let landing = casPage;
    if (!isObsAuthenticatedPage(landing.html)) landing = await followAutoPostForm(landing);
    if (!isObsAuthenticatedPage(landing.html)) landing = await fetchPage(`${OBS_STD}/index.aspx?curOp=0`, `${OBS_STD}/`);
    if (isObsAuthenticatedPage(landing.html) && !isCasLoginPage(landing.html)) {
      parseIndex(landing.html, studentNo);
      isSessionValid = true;
      return true;
    }
    // SSO ile oturum kurulamadı → CAS'tan taze form iste
    casPage = await fetchPage(`${CAS_LOGIN_URL}&renew=true`);
  }

  const lt = casPage.html.match(/name=["']lt["']\s+value=["']([^"']+)["']/i)?.[1];
  const execution = casPage.html.match(/name=["']execution["']\s+value=["']([^"']+)["']/i)?.[1];
  if (!lt || !execution) {
    throw new Error('Fırat Üniversitesi CAS giriş sayfasına ulaşılamadı. Lütfen daha sonra tekrar deneyin.');
  }
  // Form action jsessionid taşır: "/cas/login;jsessionid=…?service=…" — CAS origin'ine göre mutlaklaştır
  const action = casPage.html.match(/<form[^>]*id=["']fm1["'][^>]*action=["']([^"']+)["']/i)?.[1];
  const actionDecoded = action ? decodeEntities(action) : '';
  const postUrl = !actionDecoded
    ? CAS_LOGIN_URL
    : /^https?:\/\//i.test(actionDecoded)
    ? actionDecoded
    : 'https://jasig.firat.edu.tr' + (actionDecoded.startsWith('/') ? actionDecoded : '/cas/' + actionDecoded);

  // 2) Kimlik bilgilerini gönder
  const form = new URLSearchParams();
  form.append('username', studentNo.trim());
  form.append('password', password);
  form.append('lt', lt);
  form.append('execution', execution);
  form.append('_eventId', 'submit');
  form.append('submit', 'GİRİŞ');

  const postResp = await fetch(postUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders(CAS_LOGIN_URL),
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://jasig.firat.edu.tr',
    },
    body: form.toString(),
    redirect: 'manual' as any,
  });
  rememberCookies(postResp.headers);

  let landing: PageResponse;
  const loc = postResp.headers.get('location');
  if ([301, 302, 303, 307, 308].includes(postResp.status) && loc) {
    landing = await fetchPage(absolutize(loc), 'https://jasig.firat.edu.tr/cas/login');
  } else if (postResp.ok) {
    landing = { status: postResp.status, url: (postResp as any).url || postUrl, html: await postResp.text() };
  } else {
    throw new Error(`OBS sunucusu yanıt veremedi (HTTP ${postResp.status}).`);
  }

  // 3) Sonuç
  if (isCasLoginPage(landing.html) && !isObsAuthenticatedPage(landing.html)) {
    throw new Error(
      extractCasError(landing.html) ||
        'Kullanıcı Kodu veya Parola bilginizde yanlışlık var. Lütfen kontrol edip tekrar deneyiniz.'
    );
  }
  if (!isObsAuthenticatedPage(landing.html)) landing = await followAutoPostForm(landing);
  if (!isObsAuthenticatedPage(landing.html)) {
    // Oturum çerezleri native depoda olabilir — index.aspx'i doğrudan iste
    landing = await fetchPage(`${OBS_STD}/index.aspx?curOp=0`, `${OBS_STD}/`);
    if (!isObsAuthenticatedPage(landing.html)) {
      throw new Error(extractCasError(landing.html) || 'OBS oturumu açılamadı. Lütfen tekrar deneyin.');
    }
  }

  parseIndex(landing.html, studentNo);
  isSessionValid = true;
  return true;
}

// ─── Parsers (gerçek HTML'e göre doğrulandı) ─────────────────────────────────

function parseGrades(html: string): ObsGrade[] {
  const grades: ObsGrade[] = [];
  const sections = html.split(/class=['"][^'"]*\bex-gh\b[^'"]*['"]/i);
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const titleTd = sec.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (!titleTd) continue;
    // "MAT220(1) - Diferansiyel Denk. | Ort: 36 Not: FF Durumu: Kaldı İstatistik"
    const title = textOf(titleTd[1]);
    const left = title.split('|')[0].trim();
    const dash = left.indexOf(' - ');
    const courseCode = dash > 0 ? left.substring(0, dash).trim() : left;
    const courseName = dash > 0 ? left.substring(dash + 3).trim() : '';

    const avgM = sec.match(/class=['"]avg-badge['"][^>]*>([^<]*)</i) || title.match(/Ort:\s*(\d+)/i);
    const average = avgM && avgM[1].trim() !== '' && !isNaN(Number(avgM[1])) ? Number(avgM[1]) : null;
    const gradeM = sec.match(/class=['"]grade-badge['"][^>]*>([^<]*)</i) || title.match(/Not:\s*([A-Z-]{1,3})/i);
    const letterGrade = gradeM ? gradeM[1].trim() : '--';
    // Etiketler ayrı span'larda olduğu için "Durumu : Kaldı İstatistik" şeklinde gelir
    const durumM = title.match(/Durumu\s*:\s*([^|]+?)(?:\s+İstatistik|$)/i);
    const status = durumM ? durumM[1].trim() : '';

    const exams: ObsExam[] = [];
    const rowRe = /<tr[^>]*class=['"][^'"]*\bex-i\b[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(sec)) !== null) {
      const cols: string[] = [];
      const colRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let c;
      while ((c = colRe.exec(r[1])) !== null) cols.push(textOf(c[1]));
      if (cols.length >= 4 && cols[0] && cols[0] !== 'Sınav Adı') {
        exams.push({ sinavTuru: cols[0], alinanNot: cols[1] || '', ilanTarihi: cols[2] || '', sinifOrtalamasi: cols[3] || '' });
      }
    }
    const statsM = sec.match(/rptNotListesi_btnIstatistik_(\d+)/);
    grades.push({
      courseCode,
      courseName,
      average,
      letterGrade: letterGrade || '--',
      status,
      exams,
      statsIndex: statsM ? parseInt(statsM[1], 10) : null,
    });
  }
  return grades;
}

/** new_not_giris_istatistik.aspx — satır tabanlı ayrıştırma (etiket/değer çiftleri) */
function parseGradeStatistics(html: string): ObsGradeStatistics {
  const lines = toLines(html).split('\n').map((l) => l.trim()).filter(Boolean);
  const after = (label: string, from = 0): string => {
    const i = lines.findIndex((l, idx) => idx >= from && l === label);
    return i >= 0 && i + 1 < lines.length ? lines[i + 1] : '';
  };
  const isLetter = (s: string) => /^(AA|BA|BB|CB|CC|DC|DD|FD|FF|F|D|G|K|DZ|YT|YZ)$/.test(s);

  const rulesLabels = ['Yönetmelik/Müfredat Adı', 'Bağıl Değer. Katma Limiti', 'Ham Başarı Notu Alt Limiti', 'En Az Ham Başarı Ort./Harf', 'Geçme Notu'];
  const rules = rulesLabels.map((label) => ({ label, value: after(label) })).filter((r) => r.value && !rulesLabels.includes(r.value));

  // Dağılım blokları: "... Harf Aralıkları Dağılımı" başlığından sonra 6 sütunlu satırlar
  const distributions: ObsGradeDistribution[] = [];
  lines.forEach((l, idx) => {
    if (!/Harf Aralıkları Dağılımı$/.test(l)) return;
    const title = l.replace(/Harf Aralıkları Dağılımı$/, '').trim();
    let i = idx + 1;
    while (i < lines.length && !isLetter(lines[i]) && i < idx + 10) i++;
    const bands: ObsGradeBand[] = [];
    const num = (s: string | undefined) => !!s && /^[\d.,]+$/.test(s);
    while (i < lines.length && isLetter(lines[i])) {
      if (num(lines[i + 1]) && num(lines[i + 2]) && num(lines[i + 3]) && num(lines[i + 4]) && num(lines[i + 5])) {
        bands.push({ letter: lines[i], min: lines[i + 1], max: lines[i + 2], rawMin: lines[i + 3], rawMax: lines[i + 4], count: parseInt(lines[i + 5], 10) || 0 });
        i += 6;
      } else if (num(lines[i + 1]) && num(lines[i + 2])) {
        // 3 sütunlu satır (ör. "D 0 3": devamsız/değerlendirme dışı öğrenci sayısı)
        bands.push({ letter: lines[i], min: lines[i + 1], max: '', rawMin: '', rawMax: '', count: parseInt(lines[i + 2], 10) || 0 });
        i += 3;
      } else break;
    }
    const examTitle = lines[i] && !lines[i].includes(':') && lines[i + 1] === 'Sonuç Durumu' ? lines[i] : title;
    const f = (label: string) => after(label, i);
    distributions.push({
      title: examTitle || title || 'Dağılım',
      bands,
      resultStatus: f('Sonuç Durumu'),
      resultDate: f('Sonuç Durum Tarihi'),
      evaluation: f('Değerlendirme Şekli'),
      calculation: f('Hesap Şekli'),
      attended: f('Sınava Katılan Öğrenci Sayısı'),
      classAverage: f('Sınıf Ortalaması'),
      averageBase: f('Sınıf Ort.Katılan Öğr.Sayısı'),
      stdDev: f('Standart Sapma'),
      table: f('Hesap Tablosu'),
      classLevel: f('Sınıf Düzeyi'),
    });
  });

  // Sınav bazlı katılım: "<Ad>", "(%40)", "İlan Edildi:…", ardından etiket/değer çiftleri
  const exams: ObsExamParticipation[] = [];
  lines.forEach((l, idx) => {
    if (!/^\(%\d+\)/.test(l) || idx === 0) return;
    const name = lines[idx - 1];
    const f = (label: string) => after(label, idx);
    exams.push({
      name,
      weight: l.replace(/[()]/g, '').trim(),
      announced: (lines[idx + 1] || '').replace(/^İlan Edildi:\s*/, ''),
      listed: f('Sınav listesinde yer alan toplam öğrenci sayısı'),
      attended: f('Sınava giren öğrenci sayısı'),
      absent: f('Sınava girmeyen öğrenci sayısı'),
      failedByAbsence: f('Sınavda Devamsızlıktan Kaldı seçilen öğrenci sayısı'),
      average: f('Sınava giren öğrencilerin not ortalaması'),
    });
  });

  return {
    facultyProgram: after('Fakülte Program'),
    instructor: after('Öğretim Elemanı'),
    courseCode: after('Ders Kodu'),
    courseName: after('Ders Adı'),
    rules,
    distributions,
    exams,
  };
}

function parseTimetable(html: string): ObsTimetableEntry[] {
  const entries: ObsTimetableEntry[] = [];
  const rowRe = /<tr[^>]*id=["']rptTimeSlots_trSlot_\d+["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(html)) !== null) {
    const time = textOf(row[1].match(/class=["']tt-saat-txt["'][^>]*>([^<]*)</i)?.[1] || '');
    const [startTime, endTime] = time.split('-').map((s) => s.trim());
    const cellRe = /<td[^>]*class=["']pivot-cell["'][^>]*data-label=["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cellRe.exec(row[1])) !== null) {
      const day = decodeEntities(cell[1]).trim();
      const blockRe = /<div class=['"]course-info['"]>([\s\S]*?)<\/div>\s*<\/div>/gi;
      let block;
      while ((block = blockRe.exec(cell[2])) !== null) {
        const b = block[1];
        const code = textOf(b.match(/class=["'][^"']*course-code[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
        if (!code) continue;
        entries.push({
          day,
          dayIndex: Math.max(0, DAY_NAMES.indexOf(day)),
          time,
          startTime: startTime || '',
          endTime: endTime || '',
          courseCode: code,
          courseName: textOf(b.match(/class=["'][^"']*course-name[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''),
          room: textOf(b.match(/class=["']course-room["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''),
          instructor: textOf(b.match(/class=["']course-instructor["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''),
        });
      }
    }
  }
  entries.sort((a, b) => a.dayIndex - b.dayIndex || a.startTime.localeCompare(b.startTime));
  return entries;
}

function parseTakenCourses(html: string): ObsTakenCourse[] {
  const courses: ObsTakenCourse[] = [];
  const items = html.split(/class=["']course-card-item["']/i);
  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    const code = textOf(it.match(/class=["']course-code["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    if (!code) continue;
    const details: Record<string, string> = {};
    const dRe = /class=["']detail-label["'][^>]*>([\s\S]*?)<\/span>\s*<span class=["']detail-value["'][^>]*>([\s\S]*?)<\/span>/gi;
    let d;
    while ((d = dRe.exec(it)) !== null) details[textOf(d[1]).replace(/:$/, '')] = textOf(d[2]);
    courses.push({
      code,
      name: textOf(it.match(/class=["']course-name["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''),
      section: details['Şube'] || '',
      credit: Number(details['Kredi'] || 0) || 0,
      akts: Number(details['AKTS'] || 0) || 0,
      tu: details['T+U'] || '',
      instructor: textOf(it.match(/class=["']instructor-name["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''),
      program: textOf(it.match(/class=["']program-name["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''),
      letterGrade: textOf(it.match(/class=["']grade-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '') || '--',
    });
  }
  return courses;
}

function parseAttendance(html: string): ObsAttendanceRow[] {
  const rows: ObsAttendanceRow[] = [];
  // Satır: <div class="row rpt-row"> <div class="col-1">…</div> … <div class="col-2 …"><span>durum</span><a title="detay"/></div> </div>
  const parts = html.split(/<div class=["']row rpt-row["']>/i);
  for (let i = 1; i < parts.length; i++) {
    const cols: string[] = parts[i]
      .split(/<div class=["']col-[^"']*["'][^>]*>/i)
      .slice(1)
      .map((seg) => seg.replace(/<\/div>\s*(?:<\/div>\s*)*$/i, '').replace(/<\/div>[\s\S]*$/i, ''));
    if (cols.length < 6) continue;
    const last = cols[cols.length - 1];
    const detail = decodeEntities(last.match(/title=["']([^"']+)["']/i)?.[1] || '').replace(/\\n/g, ' ').trim();
    rows.push({
      code: textOf(cols[0]),
      name: textOf(cols[1]),
      tu: textOf(cols[2]),
      credit: textOf(cols[3]),
      classYear: textOf(cols[4]),
      program: textOf(cols[5]),
      status: textOf(last.match(/<span[^>]*class=["']text-right["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || last),
      detail,
    });
  }
  return rows.filter((x) => x.code && x.code !== 'Ders Kodu');
}

function parseExamSchedule(html: string): ObsExamScheduleGroup[] {
  const groups: ObsExamScheduleGroup[] = [];
  const parts = html.split(/class=["']exam-group-container["']/i);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const title = textOf(p.match(/class=["']exam-course-code["'][^>]*>([\s\S]*?)<\/span>\s*<\/span>/i)?.[1] || '');
    if (!title) continue;
    const dash = title.indexOf(' - ');
    const exams: ObsExamScheduleItem[] = [];
    const rowRe = /<tr[^>]*class=["'][^"']*exam-group-item[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(p)) !== null) {
      const cells: Record<string, string> = {};
      const cRe = /<td[^>]*data-label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi;
      let c;
      while ((c = cRe.exec(r[1])) !== null) cells[decodeEntities(c[1])] = textOf(c[2]);
      if (!cells['Sınav Adı']) continue;
      exams.push({
        examName: cells['Sınav Adı'],
        date: cells['Tarihi'] || '',
        weight: cells['E.Oran'] || '',
        // Başlık "Sınava Girebilir?" ama hücrenin data-label'ı "Sınav Listesine Dahil"
        canEnter: cells['Sınav Listesine Dahil'] || cells['Sınava Girebilir?'] || '',
        room: cells['Derslik'] || '',
      });
    }
    groups.push({
      courseCode: dash > 0 ? title.substring(0, dash).trim() : title,
      courseName: dash > 0 ? title.substring(dash + 3).trim() : '',
      exams,
    });
  }
  return groups;
}

function parseAcademicSummary(html: string): ObsAcademicSummary {
  const text = toLines(html);
  const field = (label: string): string => {
    const m = text.match(new RegExp(`${label}:\\s*\\n?\\s*([^\\n]+)`));
    return m ? m[1].trim() : '';
  };
  const agnoStr = field('AGNO').replace(',', '.');
  const agno = agnoStr ? parseFloat(agnoStr) : NaN;
  const sinifM = text.match(/Dönem \/ Sınıf:\s*\n?\s*([^\n]+)/);
  const bilgi = text.match(/Bilgilendirme\s*\n([^\n]+)/);
  return {
    agno: isNaN(agno) ? null : agno,
    ogrenimDurumu: field('Öğrenim Durumu'),
    okuduguDonem: field('Okuduğu Dönem'),
    normalSure: field('Normal Süre'),
    azamiSure: field('Azami Süre'),
    kayitTarihi: field('Kayıt Tarihi'),
    kayitNedeni: field('Kayıt Nedeni'),
    onayliDers: field('Onaylı Ders'),
    onaysizDers: field('Onaysız Ders'),
    sonOnayTarihi: field('Son Onay Tarihi'),
    mufredat: field('Müfredat'),
    sinif: sinifM ? sinifM[1].trim() : '',
    bilgilendirme: bilgi ? bilgi[1].trim() : '',
    tcKimlikMaskeli: field('T\\.C\\. Kimlik No'),
  };
}

function parseAdvisor(html: string): ObsAdvisor | null {
  const text = toLines(html);
  const after = (label: string): string => {
    const m = text.match(new RegExp(`(?:^|\\n)${label}\\s*\\n\\s*([^\\n]+)`));
    return m ? m[1].trim() : '';
  };
  const adSoyad = after('Adı Soyadı');
  if (!adSoyad) return null;
  return {
    adSoyad,
    fakulte: after('Fakülte'),
    bolum: after('Bölüm'),
    program: after('Program'),
    telefon: after('Telefon'),
    eposta: after('E-Posta'),
  };
}

// ─── F8: Grade change detection ─────────────────────────────────────────────

export function diffGrades(
  prev: GradeSnapshot | null | undefined,
  currentGrades: ObsGrade[],
  semesterCode: string
): { changes: GradeChange[]; snapshot: GradeSnapshot } {
  const currentCourseMap: Record<string, GradeCourseSnapshot> = {};
  for (const g of currentGrades) {
    const exams: Record<string, string> = {};
    for (const ex of g.exams) {
      if (ex.sinavTuru && ex.alinanNot) {
        exams[ex.sinavTuru.trim()] = ex.alinanNot.trim();
      }
    }
    currentCourseMap[g.courseCode] = {
      courseName: g.courseName,
      letterGrade: g.letterGrade || '--',
      average: g.average,
      exams,
    };
  }

  const newSnapshot: GradeSnapshot = {
    ...(prev || {}),
    [semesterCode]: currentCourseMap,
  };

  if (!prev || !prev[semesterCode]) {
    return { changes: [], snapshot: newSnapshot };
  }

  const prevSemester = prev[semesterCode];
  const changes: GradeChange[] = [];

  for (const [code, curr] of Object.entries(currentCourseMap)) {
    const p = prevSemester[code];
    if (!p) continue;

    // Harf notu değişimi
    if (curr.letterGrade !== '--' && curr.letterGrade !== '' && curr.letterGrade !== p.letterGrade) {
      changes.push({
        courseCode: code,
        courseName: curr.courseName,
        kind: 'letter',
        label: 'Harf Notu',
        oldValue: p.letterGrade,
        newValue: curr.letterGrade,
      });
    }

    // Sınav notu değişimleri
    for (const [examName, score] of Object.entries(curr.exams)) {
      const prevScore = p.exams[examName];
      if (score && score !== prevScore) {
        changes.push({
          courseCode: code,
          courseName: curr.courseName,
          kind: 'exam',
          label: examName,
          oldValue: prevScore || '—',
          newValue: score,
        });
      }
    }
  }

  return { changes, snapshot: newSnapshot };
}

// ─── F9 & F10 Parsers ─────────────────────────────────────────────────────────

/** Bir HTML parçasındaki data-label="X" hücrelerini {X: metin} olarak döner */
function dataLabelCells(rowHtml: string): Record<string, string> {
  const cells: Record<string, string> = {};
  const re = /<td[^>]*data-label=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowHtml)) !== null) cells[decodeEntities(m[1]).trim()] = textOf(m[2]);
  return cells;
}

/**
 * ogrenci_harc_bilgileri_devlet.aspx (doğrulandı 2026-09-12)
 * Özet: <span id="lblTutarOncekiDonemBakiye|lblTutarAktifDonemBorc|lblTutarAktifDonemAlacak|lblTutarGenelBakiye">
 * Hareketler: rptDonemler_lblDonemAd_N başlığı + data-label'lı satırlar (Tipi, Türü, Tutar, İade Tutar, Tahakkuk/Vade/Ödeme Tarihi)
 */
function parseTuition(html: string): Omit<ObsTuitionResult, 'semesters' | 'currentSemester'> {
  const span = (id: string) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/span>`, 'i'));
    return m ? textOf(m[1]) : '';
  };
  const money = (s: string) => (s ? s.replace(/\s*TL$/i, '').trim() : '');
  const prevBalance = money(span('lblTutarOncekiDonemBakiye'));
  const accrued = money(span('lblTutarAktifDonemBorc'));
  const paid = money(span('lblTutarAktifDonemAlacak'));
  const generalBalance = money(span('lblTutarGenelBakiye'));

  const toNum = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;
  // Genel bakiye boşsa: önceki bakiye + dönemlik ücret - ödenen
  const balanceNum = generalBalance ? toNum(generalBalance) : toNum(prevBalance) + toNum(accrued) - toNum(paid);
  const balance = generalBalance || `${balanceNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hasDebt = balanceNum > 0.005;

  const items: ObsTuitionItem[] = [];
  // Dönem başlıklarına göre böl: her parçada o dönemin hareket satırları var
  const parts = html.split(/id=["']rptDonemler_lblDonemAd_\d+["'][^>]*>/i);
  for (let i = 1; i < parts.length; i++) {
    const semesterName = textOf(parts[i].substring(0, parts[i].indexOf('</span>')));
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(parts[i])) !== null) {
      if (/<th\b/i.test(r[1])) continue;
      const c = dataLabelCells(r[1]);
      if (!c['Tutar'] && !c['Türü']) continue;
      const kind = c['Türü'] || '';
      items.push({
        date: c['Ödeme Tarihi'] || c['Tahakkuk Tarihi'] || '',
        amount: c['Tutar'] ? `${c['Tutar']} TL` : '',
        description: [c['Tipi'], kind].filter(Boolean).join(' · '),
        bank: semesterName,
        kind: /ödeme/i.test(kind) ? 'payment' : /tahakkuk/i.test(kind) ? 'accrual' : 'other',
        refund: c['İade Tutar'] || '',
        dueDate: c['Vade Tarihi'] || '',
      });
    }
  }

  return {
    accrued: accrued ? `${accrued} TL` : '0,00 TL',
    paid: paid ? `${paid} TL` : '0,00 TL',
    balance: `${balance} TL`,
    hasDebt,
    debtNotice: hasDebt ? `Ödenmemiş harç borcunuz bulunmaktadır: ${balance} TL` : undefined,
    items,
  };
}

/**
 * st_akademik_takvim.aspx (doğrulandı 2026-09-12)
 * <tr class="ProlizMGrid-row"> data-label="Takvim Adı" | "Başlangıç Tarihi" | "Bitiş Tarihi" (bitiş boş olabilir)
 */
function parseAcademicCalendar(html: string): ObsAcademicCalendarResult {
  const items: ObsCalendarItem[] = [];
  const now = new Date();
  const parseDate = (s: string, endOfDay = false): Date | null => {
    const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (m[4]) d.setHours(parseInt(m[4], 10), parseInt(m[5], 10), 0, 0);
    else if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
  };
  const rowRe = /<tr[^>]*class=["'][^"']*ProlizMGrid-row[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(html)) !== null) {
    const c = dataLabelCells(r[1]);
    const title = c['Takvim Adı'] || '';
    const startDate = c['Başlangıç Tarihi'] || '';
    const endDate = c['Bitiş Tarihi'] || '';
    if (!title || !startDate) continue;
    const s = parseDate(startDate);
    const e = endDate ? parseDate(endDate, true) : null;
    let isPast = false;
    let isCurrent = false;
    if (e) {
      isPast = now > e;
      isCurrent = !!s && now >= s && now <= e;
    } else if (s) {
      // Tek tarihli olaylar (ör. notların yayınlanması): gün geçtiyse geçmiş, bugünse güncel
      const dayEnd = new Date(s);
      dayEnd.setHours(23, 59, 59, 999);
      isPast = now > dayEnd;
      isCurrent = now >= s && now <= dayEnd;
    }
    items.push({
      title,
      startDate,
      endDate,
      rawDate: endDate ? `${startDate} – ${endDate}` : startDate,
      isPast,
      isCurrent,
    });
  }
  // Güncel olanlar en üstte, sonra gelecek, en sonda geçmiş
  items.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || Number(a.isPast) - Number(b.isPast));
  return { title: 'Akademik Takvim', items };
}

/**
 * ogrenci_mufredat_ders.aspx (doğrulandı 2026-09-12)
 * Gruplar: <div class='card-header' …>N. Sınıf &#160;Güz|Bahar</div>
 * Satır: <div class="row data-row"> sol (müfredat: rptDers_lblDersKod_N, ad, Z/S, krd, akts) + sağ (alınan: dönem, kod, ad, Z/S, krd, akts, harf)
 * Özet: lblToplamKrediAKTSBilgileriSag (Alınan Kredi/AKTS, Genel Not Ort, Sınıf), lblToplamKrediAKTSBilgileri (Başarılı Kredi/AKTS)
 */
function parseCurriculum(html: string): ObsCurriculumResult {
  const PASS = /^(AA|BA|BB|CB|CC|DC|DD|G|B|YT|M)$/i;
  const FAIL = /^(FF|FD|F|K|DZ|YZ)$/i;
  const cols = (fragment: string): string[] =>
    Array.from(fragment.matchAll(/<div class=['"]col-md-\d+ col-\d+[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi)).map((m) => textOf(m[1]));

  const semesters: ObsCurriculumSemester[] = [];
  const groups = html.split(/class=['"]card-header['"]/i);
  for (let gi = 1; gi < groups.length; gi++) {
    const g = groups[gi];
    const head = textOf(g.substring(0, Math.min(g.length, 800)));
    const tm = head.match(/(\d+)\.\s*Sınıf\s*(Güz|Bahar|Yaz)/i);
    if (!tm) continue;
    const classYear = parseInt(tm[1], 10);
    const term = tm[2];
    const semesterNumber = (classYear - 1) * 2 + (/güz/i.test(term) ? 1 : 2);
    const rows = g.split(/class=["']row data-row["']/i).slice(1);
    const courses: ObsCurriculumCourse[] = [];
    let totalAkts = 0;
    let completedAkts = 0;
    for (const row of rows) {
      const leftEnd = row.indexOf('<!-- Sağ taraf');
      const left = leftEnd > 0 ? row.substring(0, leftEnd) : row;
      const right = leftEnd > 0 ? row.substring(leftEnd) : '';
      const code = textOf(left.match(/rptDers_lblDersKod_\d+["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
      if (!code) continue;
      const lc = cols(left); // [kod, ad, Z/S, krd, akts]
      const name = lc[1] || '';
      const zs = lc[2] || '';
      const credit = parseFloat((lc[3] || '0').replace(',', '.')) || 0;
      const akts = parseFloat((lc[4] || '0').replace(',', '.')) || 0;
      const rc = cols(right); // [dönem, kod, ad, Z/S, krd, akts, harf] — alınmamışsa boş
      const letter = (rc[6] || '').replace(/[^A-ZÇĞİÖŞÜ-]/g, '').trim();
      let status: ObsCurriculumCourse['status'] = 'not_taken';
      if (rc.length > 0 && rc[0]) {
        if (PASS.test(letter)) status = 'passed';
        else if (FAIL.test(letter)) status = 'failed';
        else status = 'current';
      }
      if (status === 'passed') completedAkts += akts;
      totalAkts += akts;
      courses.push({ code, name, credit, akts, isCompulsory: /^Z/i.test(zs), status, letterGrade: letter || undefined });
    }
    if (courses.length > 0) {
      semesters.push({ semesterNumber, title: `${classYear}. Sınıf ${term}`, courses, totalAkts, completedAkts });
    }
  }
  semesters.sort((a, b) => a.semesterNumber - b.semesterNumber);

  const totalRequiredAkts = semesters.reduce((a, s) => a + s.totalAkts, 0);
  // Resmî özet (varsa) hesaplanan değeri doğrular
  const summaryDone = html.match(/Başarılı Olunan[\s\S]*?AKTS\s*(\d+)/i);
  const totalCompletedAkts = summaryDone ? parseInt(summaryDone[1], 10) : semesters.reduce((a, s) => a + s.completedAkts, 0);
  const completionPercentage = totalRequiredAkts > 0 ? Math.min(100, Math.round((totalCompletedAkts / totalRequiredAkts) * 100)) : 0;

  return { semesters, totalRequiredAkts, totalCompletedAkts, completionPercentage };
}

function parseMessages(html: string): ObsMessagesResult {
  const messages: ObsMessage[] = [];
  let unreadCount = 0;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(html)) !== null) {
    const rowHtml = r[1];
    if (/<th\b/i.test(rowHtml)) continue;
    const cols: string[] = [];
    const colRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let c;
    while ((c = colRe.exec(rowHtml)) !== null) cols.push(textOf(c[1]));

    const targetM = rowHtml.match(/__doPostBack\(['"]([^'"]+)['"]/);
    const selectTarget = targetM ? targetM[1] : '';

    if (cols.length >= 3) {
      const isUnread = /font-weight:\s*bold|fw-bold|unread|fa-envelope\b/i.test(rowHtml) && !/fa-envelope-open/i.test(rowHtml);
      if (isUnread) unreadCount++;

      const sender = cols.length >= 4 ? cols[1] : cols[0];
      const subject = cols.length >= 4 ? cols[2] : cols[1];
      const date = cols.length >= 4 ? cols[3] : cols[2];

      if (sender && subject) {
        messages.push({
          id: selectTarget || `msg-${messages.length}`,
          sender,
          subject,
          date,
          isRead: !isUnread,
          selectTarget: selectTarget || undefined,
        });
      }
    }
  }

  return { messages, unreadCount };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const ObsService = {
  // Kimlik bilgisi saklama (cihazda şifreli)
  async saveCredentials(studentNo: string, password: string): Promise<void> {
    if (Platform.OS === 'web') {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(SECURE_KEY_STUDENT_NO, studentNo);
      await AsyncStorage.setItem(SECURE_KEY_PASSWORD, password);
      return;
    }
    await SecureStore.setItemAsync(SECURE_KEY_STUDENT_NO, studentNo);
    await SecureStore.setItemAsync(SECURE_KEY_PASSWORD, password);
  },

  async getCredentials(): Promise<{ studentNo: string; password: string } | null> {
    try {
      let studentNo: string | null;
      let password: string | null;
      if (Platform.OS === 'web') {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        studentNo = await AsyncStorage.getItem(SECURE_KEY_STUDENT_NO);
        password = await AsyncStorage.getItem(SECURE_KEY_PASSWORD);
      } else {
        studentNo = await SecureStore.getItemAsync(SECURE_KEY_STUDENT_NO);
        password = await SecureStore.getItemAsync(SECURE_KEY_PASSWORD);
      }
      return studentNo && password ? { studentNo, password } : null;
    } catch {
      return null;
    }
  },

  async clearCredentials(): Promise<void> {
    this.logout();
    try {
      if (Platform.OS === 'web') {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.removeItem(SECURE_KEY_STUDENT_NO);
        await AsyncStorage.removeItem(SECURE_KEY_PASSWORD);
      } else {
        await SecureStore.deleteItemAsync(SECURE_KEY_STUDENT_NO);
        await SecureStore.deleteItemAsync(SECURE_KEY_PASSWORD);
      }
    } catch {
      // önemsiz
    }
  },

  isLoggedIn(): boolean {
    return isSessionValid;
  },

  /** OBS'ye giriş (CAS). Aynı anda birden fazla çağrı tek girişe indirgenir. */
  async login(studentNo: string, password: string): Promise<boolean> {
    return loginRaw(studentNo, password);
  },

  async autoLogin(): Promise<boolean> {
    return autoLoginRaw();
  },

  logout(): void {
    cookieJar = '';
    isSessionValid = false;
    menuUrls = {};
    cachedStudent = null;
    cachedAcademic = null;
    cachedAdvisor = null;
  },

  getCachedStudent(): ObsStudentInfo | null {
    return cachedStudent;
  },

  /** Öğrenci + akademik özet (duyuru paneli) + danışman */
  async getDashboard(force = false): Promise<ObsDashboard> {
    if (!isSessionValid || !cachedStudent) {
      const ok = await autoLoginRaw();
      if (!ok || !cachedStudent) throw new Error('OBS oturumu başlatılamadı. Lütfen tekrar giriş yapın.');
    }
    if (force || !cachedAcademic) {
      try {
        const p = await fetchPage(`${OBS_STD}/duyuru_new.aspx`, INDEX_REFERER);
        if (!isCasLoginPage(p.html)) cachedAcademic = parseAcademicSummary(p.html);
      } catch (e) {
        console.log('OBS akademik özet alınamadı:', e);
      }
    }
    if (force || !cachedAdvisor) {
      try {
        const p = await openPage('Danışman Bilgileri', PAGE.danisman);
        cachedAdvisor = parseAdvisor(p.html);
      } catch (e) {
        console.log('OBS danışman alınamadı:', e);
      }
    }
    return { student: cachedStudent!, academic: cachedAcademic, advisor: cachedAdvisor };
  },

  /**
   * Not listesi. Dönem verilmezse sayfada seçili dönem; o dönem boşsa (yeni yarıyıl)
   * verisi olan ilk önceki döneme otomatik geçer.
   */
  async getGrades(semesterCode?: string): Promise<ObsGradeResult> {
    const first = await loadSemesterPage('Not Listesi', PAGE.notListesi, semesterCode);
    let grades = parseGrades(first.html);
    let current = first.current;

    if (!semesterCode && grades.length === 0 && first.semesters.length > 1) {
      const idx = first.semesters.findIndex((s) => s.code === current);
      for (let i = idx + 1; i < Math.min(first.semesters.length, idx + 3); i++) {
        const next = await loadSemesterPage('Not Listesi', PAGE.notListesi, first.semesters[i].code);
        const g = parseGrades(next.html);
        if (g.length > 0) {
          grades = g;
          current = next.current;
          break;
        }
      }
    }
    return { grades, semesters: first.semesters, currentSemester: current };
  },

  /**
   * Bir dersin sınav istatistikleri (harf dağılımı, sınıf ortalaması, katılım).
   * Akış: not listesi (dönem) → btnIstatistik postback → GET /oibs/start.aspx → istatistik sayfası
   */
  async getGradeStatistics(semesterCode: string, statsIndex: number): Promise<ObsGradeStatistics> {
    const res = await loadSemesterPage('Not Listesi', PAGE.notListesi, semesterCode);
    const target = `rptNotListesi$ctl${String(statsIndex).padStart(2, '0')}$btnIstatistik`;
    const delta = await postbackPage(res.page, target, '', { cmbDonemler: res.current });
    if (!/prolizPopup|start\.aspx/i.test(delta.raw)) {
      throw new Error('Bu ders için istatistik bulunamadı.');
    }
    const stats = await fetchPage(`${OBS_ORIGIN}/oibs/start.aspx`, res.page.url);
    if (!stats.html.includes('Sınav İstatistikleri') && !stats.html.includes('grdExamRules')) {
      throw new Error('İstatistik sayfası açılamadı.');
    }
    return parseGradeStatistics(stats.html);
  },

  async getTimetable(semesterCode?: string): Promise<ObsTimetableResult> {
    const res = await loadSemesterPage('Ders Programı', PAGE.dersProgrami, semesterCode);
    let entries = parseTimetable(res.html);
    let current = res.current;
    if (!semesterCode && entries.length === 0 && res.semesters.length > 1) {
      // Yeni yarıyılda program henüz yoksa bir önceki dönemi göster
      const alt = res.semesters.find((s) => s.code !== current);
      if (alt) {
        const r2 = await loadSemesterPage('Ders Programı', PAGE.dersProgrami, alt.code);
        const e2 = parseTimetable(r2.html);
        if (e2.length > 0) {
          entries = e2;
          current = r2.current;
        }
      }
    }
    return { entries, semesters: res.semesters, currentSemester: current };
  },

  async getTakenCourses(semesterCode?: string): Promise<ObsTakenCoursesResult> {
    const res = await loadSemesterPage('Alınan Dersler', PAGE.alinanDersler, semesterCode);
    const courses = parseTakenCourses(res.html);
    return {
      courses,
      semesters: res.semesters,
      currentSemester: res.current,
      totalCredit: courses.reduce((a, c) => a + c.credit, 0),
      totalAkts: courses.reduce((a, c) => a + c.akts, 0),
    };
  },

  /** Tüm dönemlerin ders geçmişi (transkript yerine; menüdeki transkript PDF'dir) */
  async getCourseHistory(onProgress?: (done: number, total: number) => void): Promise<ObsSemesterHistory[]> {
    const firstRes = await loadSemesterPage('Alınan Dersler', PAGE.alinanDersler);
    const history: ObsSemesterHistory[] = [];
    const build = (sem: ObsSemester, courses: ObsTakenCourse[]): ObsSemesterHistory => ({
      semester: sem,
      courses,
      totalCredit: courses.reduce((a, c) => a + c.credit, 0),
      totalAkts: courses.reduce((a, c) => a + c.akts, 0),
      passed: courses.filter((c) => /^(AA|BA|BB|CB|CC|DC|DD|G|B)$/.test(c.letterGrade)).length,
      failed: courses.filter((c) => /^(FF|FD|F|K|DZ)$/.test(c.letterGrade)).length,
    });
    const semesters = firstRes.semesters;
    for (let i = 0; i < semesters.length; i++) {
      const sem = semesters[i];
      let html = '';
      if (sem.code === firstRes.current) html = firstRes.html;
      else {
        const r = await loadSemesterPage('Alınan Dersler', PAGE.alinanDersler, sem.code);
        html = r.html;
      }
      history.push(build(sem, parseTakenCourses(html)));
      onProgress?.(i + 1, semesters.length);
    }
    return history;
  },

  async getAttendance(semesterCode?: string): Promise<ObsAttendanceResult> {
    const res = await loadSemesterPage('Devamsızlık Durumu', PAGE.devamsizlik, semesterCode);
    return { rows: parseAttendance(res.html), semesters: res.semesters, currentSemester: res.current };
  },

  async getExamSchedule(semesterCode?: string): Promise<ObsExamScheduleResult> {
    const res = await loadSemesterPage('Sınav Takvimi', PAGE.sinavTakvimi, semesterCode);
    return { groups: parseExamSchedule(res.html), semesters: res.semesters, currentSemester: res.current };
  },

  /** Transkript PDF adresi (menüden; oturum çerezi gerektirir) */
  getTranscriptPdfUrl(): string {
    return menuUrls['Transkript'] || `${OBS_STD}/caller.aspx?curPage=${PAGE.transkriptPdf}`;
  },

  // ─── F9: Harç Bilgileri ───────────────────────────────────────────────────
  async getTuition(semesterCode?: string): Promise<ObsTuitionResult> {
    const res = await loadSemesterPage('Harç Bilgileri', PAGE.harc, semesterCode);
    const parsed = parseTuition(res.html);
    return {
      ...parsed,
      semesters: res.semesters,
      currentSemester: res.current,
    };
  },

  // ─── F9: Akademik Takvim ──────────────────────────────────────────────────
  async getAcademicCalendar(): Promise<ObsAcademicCalendarResult> {
    const page = await openPage('Akademik Takvim', PAGE.akademikTakvim);
    return parseAcademicCalendar(page.html);
  },

  // ─── F9: Müfredat Durum ───────────────────────────────────────────────────
  async getCurriculum(): Promise<ObsCurriculumResult> {
    const page = await openPage('Müfredat Durum', PAGE.mufredatDurum);
    return parseCurriculum(page.html);
  },

  // ─── F10: Gelen Mesajlar ──────────────────────────────────────────────────
  async getMessages(): Promise<ObsMessagesResult> {
    const page = await openPage('Gelen Mesajlar', PAGE.gelenMesajlar);
    return parseMessages(page.html);
  },

  async getMessageDetail(msg: ObsMessage): Promise<ObsMessageDetail> {
    let body = '';
    if (msg.selectTarget) {
      try {
        const page = await openPage('Gelen Mesajlar', PAGE.gelenMesajlar);
        const res = await postbackPage(page, msg.selectTarget, '');
        body = toLines(res.html);
      } catch {
        body = 'Mesaj içeriği yüklenemedi.';
      }
    }
    return {
      id: msg.id,
      sender: msg.sender,
      subject: msg.subject,
      date: msg.date,
      body: body || 'Mesaj içeriği bulunamadı.',
    };
  },
};

/**
 * OBS oturumu tek bir çerez kavanozu/ViewState üzerinden yürür ve her postback ilgili sayfanın GET'inden
 * hemen sonra yapılmalıdır. Ana sayfa (ders programı), bildirim senkronu ve OBS ekranı aynı anda istek
 * atabildiğinden sayfa akışları burada sıraya alınır: bir çağrı bitmeden diğeri başlamaz.
 */
let obsQueue: Promise<unknown> = Promise.resolve();
function serialized<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    const run = obsQueue.then(() => fn(...args));
    obsQueue = run.catch(() => undefined);
    return run;
  }) as T;
}
(
  [
    'login',
    'autoLogin',
    'getDashboard',
    'getGrades',
    'getGradeStatistics',
    'getTimetable',
    'getTakenCourses',
    'getCourseHistory',
    'getAttendance',
    'getExamSchedule',
    'getTuition',
    'getAcademicCalendar',
    'getCurriculum',
    'getMessages',
    'getMessageDetail',
  ] as const
).forEach((name) => {
  const original = (ObsService as any)[name].bind(ObsService);
  (ObsService as any)[name] = serialized(original);
});

