import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  RefreshControl,
  StatusBar,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme, themedStyles, useAppTheme } from '../constants/Theme';
import {
  ObsService,
  ObsDashboard,
  ObsGradeResult,
  ObsTimetableResult,
  ObsTakenCoursesResult,
  ObsAttendanceResult,
  ObsExamScheduleResult,
  ObsSemesterHistory,
  ObsSemester,
  ObsGradeStatistics,
  ObsTuitionResult,
  ObsAcademicCalendarResult,
  ObsCurriculumResult,
  ObsMessagesResult,
  ObsMessage,
  ObsMessageDetail,
  diffGrades,
} from '../services/obsService';
import { PrefsService, GradeChange } from '../services/prefsService';
import { Card, Chip, Pill, StatTile, EmptyState, LoadingState, PrimaryButton, Notice, ScreenHeader, IconCircle } from '../components/ui';

const C = Theme.colors;
const RED = C.uniRed;

type TabKey =
  | 'notlar'
  | 'program'
  | 'dersler'
  | 'sinavlar'
  | 'harc'
  | 'takvim'
  | 'mufredat'
  | 'mesajlar'
  | 'devamsizlik'
  | 'gecmis'
  | 'danisman';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'notlar', label: 'Notlar', icon: 'clipboard-text-outline' },
  { key: 'program', label: 'Ders Programı', icon: 'calendar-clock' },
  { key: 'dersler', label: 'Dersler', icon: 'book-open-variant' },
  { key: 'sinavlar', label: 'Sınavlar', icon: 'calendar-star' },
  { key: 'harc', label: 'Harç Bilgileri', icon: 'cash-multiple' },
  { key: 'takvim', label: 'Akademik Takvim', icon: 'calendar-text' },
  { key: 'mufredat', label: 'Müfredat', icon: 'chart-donut' },
  { key: 'mesajlar', label: 'Gelen Mesajlar', icon: 'email-outline' },
  { key: 'devamsizlik', label: 'Devamsızlık', icon: 'account-clock-outline' },
  { key: 'gecmis', label: 'Ders Geçmişi', icon: 'history' },
  { key: 'danisman', label: 'Danışman', icon: 'account-tie-outline' },
];

function gradeTone(letter: string): { fg: string; bg: string } {
  if (/^(AA|BA)$/.test(letter)) return { fg: C.success, bg: C.successBg };
  if (/^(BB|CB|CC)$/.test(letter)) return { fg: C.prayerGold, bg: C.prayerBg };
  if (/^(DC|DD)$/.test(letter)) return { fg: C.warning, bg: C.warningBg };
  if (/^(FF|FD|F|DZ|K)$/.test(letter)) return { fg: C.danger, bg: C.dangerBg };
  return { fg: C.textMuted, bg: C.surfaceSubtle };
}

function shortSemester(name: string) {
  return name.replace(/Yarıyılı/i, '').replace(/DÖNEMİ/i, '').trim();
}

export default function ObsScreen() {
  useAppTheme();
  const router = useRouter();
  const [phase, setPhase] = useState<'checking' | 'login' | 'ready'>('checking');
  const [studentNo, setStudentNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [dashboard, setDashboard] = useState<ObsDashboard | null>(null);
  const [tab, setTab] = useState<TabKey>('notlar');
  const [refreshing, setRefreshing] = useState(false);

  // Sekme verileri
  const [grades, setGrades] = useState<ObsGradeResult | null>(null);
  const [timetable, setTimetable] = useState<ObsTimetableResult | null>(null);
  const [courses, setCourses] = useState<ObsTakenCoursesResult | null>(null);
  const [attendance, setAttendance] = useState<ObsAttendanceResult | null>(null);
  const [exams, setExams] = useState<ObsExamScheduleResult | null>(null);
  const [history, setHistory] = useState<ObsSemesterHistory[] | null>(null);
  const [historyProgress, setHistoryProgress] = useState('');
  const [tuition, setTuition] = useState<ObsTuitionResult | null>(null);
  const [calendar, setCalendar] = useState<ObsAcademicCalendarResult | null>(null);
  const [curriculum, setCurriculum] = useState<ObsCurriculumResult | null>(null);
  const [messages, setMessages] = useState<ObsMessagesResult | null>(null);
  const [unseenGrades, setUnseenGrades] = useState<GradeChange[]>([]);
  const [tabBusy, setTabBusy] = useState(false);
  const [tabError, setTabError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Sınav istatistikleri & Mesaj modalı
  const [stats, setStats] = useState<ObsGradeStatistics | null>(null);
  const [statsBusy, setStatsBusy] = useState<number | null>(null);
  const [statsError, setStatsError] = useState('');
  const [statsVisible, setStatsVisible] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<ObsMessageDetail | null>(null);
  const [msgModalVisible, setMsgModalVisible] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);

  const openStats = async (statsIndex: number) => {
    if (!grades) return;
    setStatsBusy(statsIndex);
    setStatsError('');
    try {
      const s = await ObsService.getGradeStatistics(grades.currentSemester, statsIndex);
      setStats(s);
      setStatsVisible(true);
    } catch (e: any) {
      setStatsError(e?.message || 'İstatistik alınamadı.');
      setStats(null);
      setStatsVisible(true);
    } finally {
      setStatsBusy(null);
    }
  };

  // ── Oturum ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const creds = await ObsService.getCredentials();
      if (creds) {
        setStudentNo(creds.studentNo);
        try {
          await ObsService.login(creds.studentNo, creds.password);
          await loadDashboard();
          setPhase('ready');
          return;
        } catch (e: any) {
          setLoginError(e?.message || '');
        }
      }
      setPhase('login');
    })();
  }, []);

  const loadDashboard = async (force = false) => {
    const d = await ObsService.getDashboard(force);
    setDashboard(d);
  };

  const handleLogin = async () => {
    if (!studentNo.trim() || !password) {
      Alert.alert('Eksik Bilgi', 'Öğrenci numarası ve OBS şifrenizi girin.');
      return;
    }
    setLoginBusy(true);
    setLoginError('');
    try {
      await ObsService.login(studentNo.trim(), password);
      if (remember) await ObsService.saveCredentials(studentNo.trim(), password);
      await loadDashboard(true);
      setPhase('ready');
      setPassword('');
    } catch (e: any) {
      const msg: string = e?.message || '';
      setLoginError(
        /Network request failed|fetch/i.test(msg)
          ? 'OBS sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol edin.'
          : msg || 'Giriş yapılamadı.'
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('OBS Çıkışı', 'Kayıtlı OBS bilgileriniz cihazdan silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await ObsService.clearCredentials();
          setDashboard(null);
          setGrades(null);
          setTimetable(null);
          setCourses(null);
          setAttendance(null);
          setExams(null);
          setTuition(null);
          setCalendar(null);
          setCurriculum(null);
          setMessages(null);
          setHistory(null);
          setPassword('');
          setPhase('login');
        },
      },
    ]);
  };

  useEffect(() => {
    PrefsService.getUnseenGrades().then(setUnseenGrades).catch(() => {});
  }, []);

  // ── Sekme verisi ──────────────────────────────────────────────────────────
  const loadTab = useCallback(
    async (key: TabKey, semester?: string, force = false) => {
      setTabError('');
      const has =
        (key === 'notlar' && grades) ||
        (key === 'program' && timetable) ||
        (key === 'dersler' && courses) ||
        (key === 'devamsizlik' && attendance) ||
        (key === 'sinavlar' && exams) ||
        (key === 'harc' && tuition) ||
        (key === 'takvim' && calendar) ||
        (key === 'mufredat' && curriculum) ||
        (key === 'mesajlar' && messages) ||
        (key === 'gecmis' && history) ||
        key === 'danisman';
      if (has && !semester && !force) return;
      setTabBusy(true);
      try {
        if (key === 'notlar') {
          const res = await ObsService.getGrades(semester);
          setGrades(res);
          try {
            const prevSnap = await PrefsService.getGradeSnapshot();
            const { changes, snapshot } = diffGrades(prevSnap, res.grades, res.currentSemester);
            await PrefsService.setGradeSnapshot(snapshot);
            if (changes.length > 0) {
              const currentUnseen = await PrefsService.getUnseenGrades();
              const updated = [...currentUnseen, ...changes];
              await PrefsService.setUnseenGrades(updated);
              setUnseenGrades(updated);
            }
          } catch {}
        }
        else if (key === 'program') setTimetable(await ObsService.getTimetable(semester));
        else if (key === 'dersler') setCourses(await ObsService.getTakenCourses(semester));
        else if (key === 'devamsizlik') setAttendance(await ObsService.getAttendance(semester));
        else if (key === 'sinavlar') setExams(await ObsService.getExamSchedule(semester));
        else if (key === 'harc') setTuition(await ObsService.getTuition(semester));
        else if (key === 'takvim') setCalendar(await ObsService.getAcademicCalendar());
        else if (key === 'mufredat') setCurriculum(await ObsService.getCurriculum());
        else if (key === 'mesajlar') setMessages(await ObsService.getMessages());
        else if (key === 'gecmis') {
          setHistory(await ObsService.getCourseHistory((d, t) => setHistoryProgress(`${d}/${t} dönem`)));
          setHistoryProgress('');
        }
      } catch (e: any) {
        setTabError(e?.message || 'Veri alınamadı.');
      } finally {
        setTabBusy(false);
      }
    },
    [grades, timetable, courses, attendance, exams, tuition, calendar, curriculum, messages, history]
  );

  useEffect(() => {
    if (phase === 'ready') loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadDashboard(true);
      await loadTab(tab, undefined, true);
    } catch {}
    setRefreshing(false);
  };

  // ── Görünümler ────────────────────────────────────────────────────────────
  const SemesterBar = ({ semesters, current, onSelect }: { semesters: ObsSemester[]; current: string; onSelect: (c: string) => void }) =>
    semesters.length > 0 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semBar}>
        {semesters.map((s) => (
          <Chip key={s.code} label={shortSemester(s.name)} active={s.code === current} tint={RED} onPress={() => onSelect(s.code)} />
        ))}
      </ScrollView>
    ) : null;

  const renderGrades = () => {
    if (!grades) return null;
    return (
      <>
        <SemesterBar semesters={grades.semesters} current={grades.currentSemester} onSelect={(c) => loadTab('notlar', c)} />
        {grades.grades.length === 0 ? (
          <EmptyState icon="clipboard-text-off-outline" title="Bu dönem için not kaydı yok" description="Yarıyıl yeni başlamış olabilir; başka bir dönem seçin." tint={RED} />
        ) : (
          <View style={styles.list}>
            {grades.grades.map((g, i) => {
              const key = `g-${i}`;
              const open = expanded === key;
              const tone = gradeTone(g.letterGrade);
              const isUnseen = unseenGrades.some((u) => u.courseCode === g.courseCode);
              return (
                <Card
                  key={key}
                  style={styles.item}
                  onPress={async () => {
                    setExpanded(open ? null : key);
                    if (isUnseen) {
                      await PrefsService.clearUnseenForCourse(g.courseCode);
                      const remaining = await PrefsService.getUnseenGrades();
                      setUnseenGrades(remaining);
                    }
                  }}
                >
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.itemTitle}>{g.courseName || g.courseCode}</Text>
                        {isUnseen ? <Pill label="YENİ" color={C.accentDark} bg={C.accentBg} /> : null}
                      </View>
                      <Text style={styles.itemSub}>{g.courseCode}</Text>
                      <View style={styles.metaRow}>
                        {g.average != null ? <Pill label={`Ort ${g.average}`} color={C.textSecondary} bg={C.surfaceSubtle} /> : null}
                        {g.status ? (
                          <Pill
                            label={g.status}
                            color={/geçti/i.test(g.status) ? C.success : /kaldı/i.test(g.status) ? C.danger : C.textMuted}
                            bg={/geçti/i.test(g.status) ? C.successBg : /kaldı/i.test(g.status) ? C.dangerBg : C.surfaceSubtle}
                          />
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.gradeBox, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.gradeText, { color: tone.fg }]}>{g.letterGrade}</Text>
                    </View>
                  </View>
                  {open && g.exams.length > 0 ? (
                    <View style={styles.examTable}>
                      <View style={styles.examHead}>
                        <Text style={[styles.examCell, styles.examHeadText, { flex: 2 }]}>Sınav</Text>
                        <Text style={[styles.examCell, styles.examHeadText, { textAlign: 'center' }]}>Not</Text>
                        <Text style={[styles.examCell, styles.examHeadText, { textAlign: 'center' }]}>Sınıf Ort.</Text>
                        <Text style={[styles.examCell, styles.examHeadText, { flex: 1.4, textAlign: 'right' }]}>Tarih</Text>
                      </View>
                      {g.exams.map((ex, k) => (
                        <View key={k} style={styles.examRow}>
                          <Text style={[styles.examCell, { flex: 2, fontWeight: '600', color: C.textPrimary }]}>{ex.sinavTuru}</Text>
                          <Text style={[styles.examCell, { textAlign: 'center', fontWeight: '800', color: RED }]}>{ex.alinanNot || '-'}</Text>
                          <Text style={[styles.examCell, { textAlign: 'center' }]}>{ex.sinifOrtalamasi || '-'}</Text>
                          <Text style={[styles.examCell, { flex: 1.4, textAlign: 'right' }]}>{ex.ilanTarihi || '-'}</Text>
                        </View>
                      ))}
                    </View>
                  ) : open ? (
                    <Text style={styles.itemNote}>Henüz açıklanmış sınav notu yok.</Text>
                  ) : null}
                  {open && g.statsIndex != null ? (
                    <PrimaryButton
                      label="Sınav İstatistikleri"
                      icon="stats-chart-outline"
                      variant="outline"
                      tint={RED}
                      loading={statsBusy === g.statsIndex}
                      onPress={() => openStats(g.statsIndex!)}
                      style={{ marginTop: 10, paddingVertical: 10 }}
                    />
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderTimetable = () => {
    if (!timetable) return null;
    const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const byDay = days.map((d, i) => ({ day: d, items: timetable.entries.filter((e) => e.dayIndex === i) })).filter((d) => d.items.length > 0);
    const todayIdx = (new Date().getDay() + 6) % 7;
    return (
      <>
        <SemesterBar semesters={timetable.semesters} current={timetable.currentSemester} onSelect={(c) => loadTab('program', c)} />
        {byDay.length === 0 ? (
          <EmptyState icon="calendar-blank-outline" title="Ders programı bulunamadı" description="Bu dönem için tanımlı program yok." tint={RED} />
        ) : (
          <View style={styles.list}>
            {byDay.map(({ day, items }) => {
              const isToday = days[todayIdx] === day;
              return (
                <Card key={day} style={styles.item} padded={false}>
                  <View style={[styles.dayHead, isToday && { backgroundColor: RED }]}>
                    <Text style={[styles.dayHeadText, isToday && { color: C.textWhite }]}>{day}</Text>
                    {isToday ? <Text style={styles.todayTag}>BUGÜN</Text> : null}
                  </View>
                  {items.map((e, i) => (
                    <View key={i} style={[styles.ttRow, i < items.length - 1 && styles.ttRowBorder]}>
                      <View style={styles.ttTime}>
                        <Text style={styles.ttStart}>{e.startTime}</Text>
                        <Text style={styles.ttEnd}>{e.endTime}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{e.courseName}</Text>
                        <Text style={styles.itemSub}>
                          {e.courseCode}
                          {e.room ? ` · ${e.room}` : ''}
                          {e.instructor ? ` · ${e.instructor}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderCourses = () => {
    if (!courses) return null;
    return (
      <>
        <SemesterBar semesters={courses.semesters} current={courses.currentSemester} onSelect={(c) => loadTab('dersler', c)} />
        <View style={styles.statRow}>
          <StatTile label="Ders" value={courses.courses.length} color={RED} />
          <StatTile label="Kredi" value={courses.totalCredit} color={RED} />
          <StatTile label="AKTS" value={courses.totalAkts} color={RED} />
        </View>
        {courses.courses.length === 0 ? (
          <EmptyState icon="book-off-outline" title="Ders kaydı bulunamadı" tint={RED} />
        ) : (
          <View style={styles.list}>
            {courses.courses.map((c, i) => {
              const tone = gradeTone(c.letterGrade);
              return (
                <Card key={i} style={styles.item}>
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{c.name}</Text>
                      <Text style={styles.itemSub}>
                        {c.code}
                        {c.section ? ` (${c.section})` : ''} · {c.credit} kredi · {c.akts} AKTS{c.tu ? ` · ${c.tu}` : ''}
                      </Text>
                      {c.instructor ? <Text style={styles.itemNote}>{c.instructor}</Text> : null}
                    </View>
                    <View style={[styles.gradeBox, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.gradeText, { color: tone.fg }]}>{c.letterGrade}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderAttendance = () => {
    if (!attendance) return null;
    return (
      <>
        <SemesterBar semesters={attendance.semesters} current={attendance.currentSemester} onSelect={(c) => loadTab('devamsizlik', c)} />
        {attendance.rows.length === 0 ? (
          <EmptyState icon="account-check-outline" title="Devamsızlık kaydı yok" tint={RED} />
        ) : (
          <View style={styles.list}>
            {attendance.rows.map((r, i) => {
              const key = `a-${i}`;
              const open = expanded === key;
              const warn = /saat|%/.test(r.status) && !/yapılmamış/i.test(r.status);
              return (
                <Card key={key} style={styles.item} onPress={() => setExpanded(open ? null : key)}>
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{r.name}</Text>
                      <Text style={styles.itemSub}>
                        {r.code} · {r.tu} · {r.credit} kredi
                      </Text>
                    </View>
                    <Pill label={r.status || '-'} color={warn ? C.warning : C.textMuted} bg={warn ? C.warningBg : C.surfaceSubtle} style={{ maxWidth: 150 }} />
                  </View>
                  {open && r.detail ? <Text style={styles.itemNote}>{r.detail}</Text> : null}
                </Card>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderExams = () => {
    if (!exams) return null;
    return (
      <>
        <SemesterBar semesters={exams.semesters} current={exams.currentSemester} onSelect={(c) => loadTab('sinavlar', c)} />
        {exams.groups.length === 0 ? (
          <EmptyState icon="calendar-remove-outline" title="Sınav takvimi bulunamadı" tint={RED} />
        ) : (
          <View style={styles.list}>
            {exams.groups.map((g, i) => (
              <Card key={i} style={styles.item}>
                <Text style={styles.itemTitle}>{g.courseName || g.courseCode}</Text>
                <Text style={styles.itemSub}>{g.courseCode}</Text>
                <View style={{ marginTop: 8, gap: 6 }}>
                  {g.exams.map((e, k) => {
                    const announced = e.date && !/açıklanmadı/i.test(e.date);
                    return (
                      <View key={k} style={styles.examLine}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examName}>{e.examName}</Text>
                          <Text style={styles.itemSub}>
                            {e.weight ? `Ağırlık ${e.weight}` : ''}
                            {e.room ? ` · ${e.room}` : ''}
                            {e.canEnter ? ` · Girebilir: ${e.canEnter}` : ''}
                          </Text>
                        </View>
                        <Pill label={announced ? e.date : 'Tarih açıklanmadı'} color={announced ? RED : C.textMuted} bg={announced ? C.uniRedSoft : C.surfaceSubtle} />
                      </View>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>
        )}
      </>
    );
  };

  const renderHistory = () => {
    if (!history) return null;
    const totalAkts = history.reduce((a, h) => a + h.totalAkts, 0);
    const totalCourses = history.reduce((a, h) => a + h.courses.length, 0);
    const totalPassed = history.reduce((a, h) => a + h.passed, 0);
    return (
      <>
        <View style={styles.statRow}>
          <StatTile label="Toplam Ders" value={totalCourses} color={RED} />
          <StatTile label="Geçilen" value={totalPassed} color={C.success} />
          <StatTile label="Toplam AKTS" value={totalAkts} color={RED} />
        </View>
        <View style={styles.list}>
          {history.map((h) => {
            const key = `h-${h.semester.code}`;
            const open = expanded === key;
            return (
              <Card key={key} style={styles.item} onPress={() => setExpanded(open ? null : key)}>
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{h.semester.name}</Text>
                    <Text style={styles.itemSub}>
                      {h.courses.length} ders · {h.totalCredit} kredi · {h.totalAkts} AKTS
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={`${h.passed} geçti`} color={C.success} bg={C.successBg} />
                    {h.failed > 0 ? <Pill label={`${h.failed} kaldı`} color={C.danger} bg={C.dangerBg} /> : null}
                  </View>
                </View>
                {open ? (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {h.courses.map((c, i) => {
                      const tone = gradeTone(c.letterGrade);
                      return (
                        <View key={i} style={styles.histRow}>
                          <Text style={[styles.itemSub, { flex: 1, color: C.textPrimary }]} numberOfLines={1}>
                            {c.code} · {c.name}
                          </Text>
                          <Text style={[styles.histGrade, { color: tone.fg }]}>{c.letterGrade}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
        <Text style={styles.footNote}>Resmî transkript OBS'de PDF olarak sunulur; buradaki geçmiş "Alınan Dersler" kayıtlarından derlenmiştir.</Text>
      </>
    );
  };

  const renderAdvisor = () => {
    const a = dashboard?.advisor;
    if (!a) return <EmptyState icon="account-question-outline" title="Danışman bilgisi bulunamadı" tint={RED} />;
    const phone = a.telefon.replace(/Dahili.*$/i, '').replace(/\D/g, '');
    return (
      <View style={styles.list}>
        <Card style={styles.item}>
          <Text style={styles.itemTitle}>{a.adSoyad}</Text>
          <Text style={styles.itemSub}>{[a.fakulte, a.bolum].filter(Boolean).join(' · ')}</Text>
          {a.program ? <Text style={styles.itemNote}>Program: {a.program}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {phone ? (
              <PrimaryButton label={a.telefon} icon="call-outline" tint={RED} onPress={() => Linking.openURL(`tel:${phone}`)} style={{ flex: 1 }} />
            ) : null}
            {a.eposta && a.eposta !== '-' ? (
              <PrimaryButton label="E-posta" icon="mail-outline" tint={RED} variant="outline" onPress={() => Linking.openURL(`mailto:${a.eposta}`)} style={{ flex: 1 }} />
            ) : null}
          </View>
        </Card>
      </View>
    );
  };

  // ─── F9 & F10 Görünümleri ──────────────────────────────────────────────────
  const renderTuition = () => {
    if (!tuition) return null;
    return (
      <View style={{ gap: 12 }}>
        <SemesterBar
          semesters={tuition.semesters}
          current={tuition.currentSemester}
          onSelect={(c) => loadTab('harc', c)}
        />
        {tuition.hasDebt ? (
          <Notice tone="warning" text={tuition.debtNotice || 'Ödenmemiş harç borcunuz bulunmaktadır.'} />
        ) : (
          <Notice tone="success" text="Ödenmemiş harç borcunuz bulunmamaktadır." />
        )}
        <View style={styles.statRow}>
          <StatTile label="Tahakkuk" value={tuition.accrued} color={RED} />
          <StatTile label="Ödenen" value={tuition.paid} color={C.success} />
          <StatTile label="Kalan Borç" value={tuition.balance} color={tuition.hasDebt ? C.danger : C.textSecondary} />
        </View>
        {tuition.items.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.sectionHeading}>Ödeme ve Dekont Hareketleri</Text>
            {tuition.items.map((it, idx) => (
              <Card key={idx} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.itemTitle}>{it.description || 'Harç Ödemesi'}</Text>
                  <Text style={[styles.itemTitle, { color: C.success }]}>{it.amount}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.itemSub}>{it.bank || 'Banka / Vezne'}</Text>
                  <Text style={styles.itemSub}>{it.date}</Text>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="cash-remove"
            title="Ödeme kaydı bulunamadı"
            description="Bu dönem için kayıtlı dekont veya ödeme hareketi yok."
            tint={RED}
          />
        )}
      </View>
    );
  };

  const renderAcademicCalendar = () => {
    if (!calendar) return null;
    if (calendar.items.length === 0) {
      return (
        <EmptyState
          icon="calendar-blank-outline"
          title="Akademik takvim verisi yok"
          description="Fırat Üniversitesi akademik takvimi henüz yayınlanmamış olabilir."
          tint={RED}
        />
      );
    }
    return (
      <View style={styles.list}>
        {calendar.items.map((it, idx) => (
          <Card
            key={idx}
            style={[
              styles.item,
              it.isCurrent && { borderColor: RED, borderWidth: 1.5, backgroundColor: C.uniRedWash },
              it.isPast && { opacity: 0.6 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <IconCircle
                name={it.isCurrent ? 'calendar-star' : it.isPast ? 'calendar-check' : 'calendar-clock'}
                color={it.isCurrent ? RED : it.isPast ? C.textMuted : C.primary}
                bg={it.isCurrent ? C.uniRedSoft : it.isPast ? C.surfaceSubtle : C.surfaceVariant}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.itemTitle, it.isPast && { color: C.textMuted }]}>{it.title}</Text>
                  {it.isCurrent ? (
                    <Pill label="ŞU AN" color={C.textWhite} bg={RED} />
                  ) : it.isPast ? (
                    <Pill label="Tamamlandı" color={C.textMuted} bg={C.surfaceSubtle} />
                  ) : null}
                </View>
                <Text style={styles.itemSub}>{it.rawDate}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderCurriculum = () => {
    if (!curriculum) return null;
    return (
      <View style={{ gap: 14 }}>
        {/* İlerleme Özeti */}
        <Card style={{ gap: 10 }}>
          <Text style={styles.itemTitle}>Mezuniyet İlerleme Durumu</Text>
          <View style={styles.statRow}>
            <StatTile label="Gereken AKTS" value={String(curriculum.totalRequiredAkts)} color={RED} />
            <StatTile label="Tamamlanan" value={String(curriculum.totalCompletedAkts)} color={C.success} />
            <StatTile label="Tamamlanma" value={`%${curriculum.completionPercentage}`} color={RED} />
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${curriculum.completionPercentage}%`, backgroundColor: RED },
              ]}
            />
          </View>
        </Card>

        {/* Yarıyıl Listesi */}
        {curriculum.semesters.map((sem, sIdx) => (
          <View key={sIdx} style={{ gap: 8 }}>
            <View style={styles.dayHead}>
              <Text style={styles.dayHeadText}>{sem.title}</Text>
              <Text style={{ ...Theme.text.caption, color: RED, fontWeight: '700' }}>
                {sem.completedAkts} / {sem.totalAkts} AKTS
              </Text>
            </View>
            <View style={styles.list}>
              {sem.courses.map((c, cIdx) => (
                <Card key={cIdx} style={styles.item}>
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{c.name}</Text>
                      <Text style={styles.itemSub}>{c.code}</Text>
                      <View style={styles.metaRow}>
                        <Pill label={`${c.akts} AKTS`} color={C.textSecondary} bg={C.surfaceSubtle} />
                        <Pill label={c.isCompulsory ? 'Zorunlu' : 'Seçmeli'} color={C.textMuted} bg={C.surfaceSubtle} />
                        <Pill
                          label={
                            c.status === 'passed'
                              ? 'Geçti'
                              : c.status === 'failed'
                              ? 'Kaldı'
                              : c.status === 'current'
                              ? 'Alıyor'
                              : 'Alınmadı'
                          }
                          color={
                            c.status === 'passed'
                              ? C.success
                              : c.status === 'failed'
                              ? C.danger
                              : c.status === 'current'
                              ? C.accentDark
                              : C.textMuted
                          }
                          bg={
                            c.status === 'passed'
                              ? C.successBg
                              : c.status === 'failed'
                              ? C.dangerBg
                              : c.status === 'current'
                              ? C.accentBg
                              : C.surfaceSubtle
                          }
                        />
                      </View>
                    </View>
                    {c.letterGrade ? (
                      <View style={[styles.gradeBox, { backgroundColor: gradeTone(c.letterGrade).bg }]}>
                        <Text style={[styles.gradeText, { color: gradeTone(c.letterGrade).fg }]}>
                          {c.letterGrade}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const openMessage = async (msg: ObsMessage) => {
    setMsgModalVisible(true);
    setMsgLoading(true);
    setSelectedMessage(null);
    try {
      const detail = await ObsService.getMessageDetail(msg);
      setSelectedMessage(detail);
    } catch {
      setSelectedMessage({
        id: msg.id,
        sender: msg.sender,
        subject: msg.subject,
        date: msg.date,
        body: 'Mesaj içeriği alınamadı.',
      });
    } finally {
      setMsgLoading(false);
    }
  };

  const renderMessages = () => {
    if (!messages) return null;
    if (messages.messages.length === 0) {
      return (
        <EmptyState
          icon="email-outline"
          title="Gelen mesajınız yok"
          description="Danışman veya öğretim elemanlarından gelen yeni mesaj bulunmuyor."
          tint={RED}
        />
      );
    }
    return (
      <View style={styles.list}>
        {messages.unreadCount > 0 && (
          <Notice tone="info" text={`${messages.unreadCount} adet okunmamış mesajınız bulunmaktadır.`} />
        )}
        {messages.messages.map((m, idx) => (
          <Card
            key={idx}
            style={[styles.item, !m.isRead && { borderColor: C.primary, borderWidth: 1.2 }]}
            onPress={() => openMessage(m)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconCircle
                name={m.isRead ? 'email-open-outline' : 'email'}
                color={m.isRead ? C.textMuted : C.primary}
                bg={m.isRead ? C.surfaceSubtle : C.surfaceVariant}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.itemTitle, !m.isRead && { fontWeight: '800' }]}>{m.sender}</Text>
                  {!m.isRead ? <Pill label="YENİ" color={C.primary} bg={C.surfaceVariant} /> : null}
                </View>
                <Text style={[styles.itemSub, !m.isRead && { color: C.textPrimary, fontWeight: '600' }]}>
                  {m.subject}
                </Text>
                <Text style={styles.footNoteDate}>{m.date}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const tabContent = useMemo(() => {
    if (tabError) return <Notice tone="danger" text={tabError} onPress={() => loadTab(tab, undefined, true)} />;
    if (tabBusy) return <LoadingState label={tab === 'gecmis' && historyProgress ? `Ders geçmişi alınıyor (${historyProgress})` : 'OBS\'den alınıyor...'} tint={RED} />;
    switch (tab) {
      case 'notlar':
        return renderGrades();
      case 'program':
        return renderTimetable();
      case 'dersler':
        return renderCourses();
      case 'devamsizlik':
        return renderAttendance();
      case 'sinavlar':
        return renderExams();
      case 'harc':
        return renderTuition();
      case 'takvim':
        return renderAcademicCalendar();
      case 'mufredat':
        return renderCurriculum();
      case 'mesajlar':
        return renderMessages();
      case 'gecmis':
        return renderHistory();
      case 'danisman':
        return renderAdvisor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tabBusy, tabError, grades, timetable, courses, attendance, exams, tuition, calendar, curriculum, messages, history, expanded, dashboard, historyProgress, unseenGrades]);

  // ── Login ekranı ──────────────────────────────────────────────────────────
  const renderLogin = () => (
    <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
      <View style={styles.loginHero}>
        <View style={styles.loginLogo}>
          <MaterialCommunityIcons name="school" size={34} color={C.textWhite} />
        </View>
        <Text style={styles.loginTitle}>Öğrenci Bilgi Sistemi</Text>
        <Text style={styles.loginSub}>Fırat Üniversitesi OBS hesabınla notlarına, ders programına ve tüm akademik bilgilerine tek ekrandan ulaş.</Text>
      </View>
      <Card style={{ gap: 12 }}>
        <View style={styles.input}>
          <Ionicons name="person-outline" size={18} color={C.textMuted} />
          <TextInput
            style={styles.inputText}
            placeholder="Öğrenci Numarası"
            placeholderTextColor={C.textFaint}
            value={studentNo}
            onChangeText={setStudentNo}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.input}>
          <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} />
          <TextInput
            style={styles.inputText}
            placeholder="OBS Şifresi"
            placeholderTextColor={C.textFaint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.remember} onPress={() => setRemember((r) => !r)}>
          <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={20} color={remember ? RED : C.textMuted} />
          <Text style={styles.rememberText}>Bilgilerimi cihazda şifreli sakla</Text>
        </TouchableOpacity>
        {loginError ? <Notice tone="danger" text={loginError} /> : null}
        <PrimaryButton label="Giriş Yap" icon="log-in-outline" tint={RED} onPress={handleLogin} loading={loginBusy} />
        <TouchableOpacity onPress={() => Linking.openURL('https://obs.firat.edu.tr/oibs/std/login.aspx')}>
          <Text style={styles.linkText}>Tarayıcıda OBS'yi aç ↗</Text>
        </TouchableOpacity>
      </Card>
      <Text style={styles.footNote}>🔒 Şifreniz yalnızca bu cihazda, işletim sisteminin güvenli deposunda saklanır; hiçbir sunucuya gönderilmez.</Text>
    </ScrollView>
  );

  // ── Ana ekran ─────────────────────────────────────────────────────────────
  const s = dashboard?.student;
  const a = dashboard?.academic;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle={Theme.colors.statusBar} backgroundColor={RED} />
      <View style={styles.topBar}>
        <ScreenHeader title="OBS" subtitle="Fırat Üniversitesi Öğrenci Bilgi Sistemi" light onBack={() => router.back()}
          right={
            phase === 'ready' ? (
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} hitSlop={8}>
                <Ionicons name="log-out-outline" size={18} color={C.textWhite} />
              </TouchableOpacity>
            ) : null
          }
        />
      </View>

      {phase === 'checking' ? (
        <LoadingState label="OBS'ye bağlanılıyor..." tint={RED} />
      ) : phase === 'login' ? (
        renderLogin()
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RED} colors={[RED]} />}
        >
          {/* Profil kartı */}
          <Card style={styles.profile} tone="uni">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {s?.profilFotoUrl ? (
                <Image source={{ uri: s.profilFotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: RED, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: C.textWhite, fontWeight: '800', fontSize: 20 }}>{(s?.fullName || 'Ö').charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{s?.fullName}</Text>
                <Text style={styles.profileMeta}>{s?.studentNo}</Text>
                <Text style={styles.profileMeta} numberOfLines={2}>
                  {[s?.faculty, s?.department].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.ganoBox}>
                <Text style={styles.ganoLabel}>AGNO</Text>
                <Text style={styles.ganoValue}>{a?.agno != null ? a.agno.toFixed(2) : '—'}</Text>
              </View>
            </View>
            <View style={styles.profileStats}>
              <StatTile label="Dönem / Sınıf" value={a?.sinif || a?.okuduguDonem || '—'} color={RED} />
              <StatTile label="Durum" value={a?.ogrenimDurumu || '—'} color={a?.ogrenimDurumu === 'Aktif' ? C.success : RED} />
              <StatTile label="Aktif Yarıyıl" value={shortSemester(s?.activeSemester || '') || '—'} color={RED} />
            </View>
            {a?.bilgilendirme ? <Notice tone="info" text={a.bilgilendirme} icon="information-circle-outline" /> : null}
            {a && (a.normalSure || a.azamiSure) ? (
              <Text style={styles.footNote}>
                Kayıt {a.kayitTarihi || '—'} · Normal süre {a.normalSure || '—'} yıl · Azami süre {a.azamiSure || '—'} yıl
                {a.mufredat ? ` · ${a.mufredat}` : ''}
              </Text>
            ) : null}
          </Card>

          {/* Sekmeler */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {TABS.map((t) => {
              let badge: string | undefined;
              if (t.key === 'notlar' && unseenGrades.length > 0) {
                badge = `${unseenGrades.length}`;
              } else if (t.key === 'mesajlar' && messages && messages.unreadCount > 0) {
                badge = `${messages.unreadCount}`;
              }
              return (
                <Chip
                  key={t.key}
                  label={badge ? `${t.label} (${badge})` : t.label}
                  icon={t.icon}
                  active={tab === t.key}
                  tint={RED}
                  onPress={() => {
                    setExpanded(null);
                    setTab(t.key);
                  }}
                />
              );
            })}
          </ScrollView>

          {tabContent}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Sınav istatistikleri */}
      <Modal visible={statsVisible} animationType="slide" onRequestClose={() => setStatsVisible(false)}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.topBar}>
            <ScreenHeader
              title={stats ? stats.courseCode : 'İstatistik'}
              subtitle={stats ? stats.courseName : 'Sınav istatistikleri'}
              light
              onBack={() => setStatsVisible(false)}
            />
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {statsError ? <Notice tone="danger" text={statsError} /> : null}
            {stats ? (
              <>
                <Card style={{ gap: 4 }}>
                  <Text style={styles.itemTitle}>{stats.instructor || '—'}</Text>
                  <Text style={styles.itemSub}>{stats.facultyProgram}</Text>
                  {stats.rules.length > 0 ? (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {stats.rules.map((r) => (
                        <View key={r.label} style={styles.kvRow}>
                          <Text style={styles.kvLabel}>{r.label}</Text>
                          <Text style={styles.kvValue}>{r.value}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>

                {stats.distributions.map((d, di) => {
                  const total = d.bands.reduce((a, b) => a + b.count, 0) || 1;
                  const maxCount = Math.max(1, ...d.bands.map((b) => b.count));
                  return (
                    <Card key={di} style={{ gap: 10 }}>
                      <View style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>{d.title} · Harf Dağılımı</Text>
                          <Text style={styles.itemSub}>
                            {d.resultStatus}
                            {d.resultDate ? ` · ${d.resultDate}` : ''}
                            {d.evaluation ? ` · ${d.evaluation}` : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.statRow}>
                        <StatTile label="Sınıf Ort." value={d.classAverage || '—'} color={RED} />
                        <StatTile label="Std. Sapma" value={d.stdDev || '—'} color={RED} />
                        <StatTile label="Katılan" value={d.attended || '—'} color={RED} hint={d.classLevel ? `Düzey: ${d.classLevel}` : undefined} />
                      </View>
                      <View style={{ gap: 6 }}>
                        {d.bands.map((b) => {
                          const tone = gradeTone(b.letter);
                          const pct = Math.round((b.count / total) * 100);
                          return (
                            <View key={b.letter} style={styles.barRow}>
                              <Text style={[styles.barLetter, { color: tone.fg }]}>{b.letter}</Text>
                              <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: `${Math.max(3, (b.count / maxCount) * 100)}%`, backgroundColor: tone.fg }]} />
                              </View>
                              <Text style={styles.barCount}>
                                {b.count} <Text style={styles.barPct}>%{pct}</Text>
                              </Text>
                              <Text style={styles.barRange}>{b.max ? `${b.min}–${b.max}` : ''}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </Card>
                  );
                })}

                {stats.exams.length > 0 ? (
                  <Card style={{ gap: 10 }}>
                    <Text style={styles.itemTitle}>Sınav Katılımı</Text>
                    {stats.exams.map((e, i) => (
                      <View key={i} style={[styles.examStat, i < stats.exams.length - 1 && styles.ttRowBorder]}>
                        <View style={styles.itemRow}>
                          <Text style={[styles.examName, { flex: 1 }]}>{e.name}</Text>
                          <Pill label={e.weight} color={RED} bg={C.uniRedSoft} />
                        </View>
                        <Text style={styles.itemSub}>İlan: {e.announced || '—'}</Text>
                        <View style={[styles.statRow, { marginTop: 8 }]}>
                          <StatTile label="Listede" value={e.listed || '—'} color={C.textPrimary} />
                          <StatTile label="Giren" value={e.attended || '—'} color={C.success} />
                          <StatTile label="Girmeyen" value={e.absent || '—'} color={C.danger} />
                        </View>
                        <Text style={[styles.itemSub, { marginTop: 6 }]}>
                          Girenlerin ortalaması: <Text style={{ fontWeight: '800', color: RED }}>{e.average || '—'}</Text>
                          {e.failedByAbsence && !/^0\b/.test(e.failedByAbsence) ? ` · Devamsızlıktan kaldı: ${e.failedByAbsence}` : ''}
                        </Text>
                      </View>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : !statsError ? (
              <LoadingState label="İstatistik alınıyor..." tint={RED} />
            ) : null}
            <View style={{ height: 32 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Mesaj Detayı Modalı */}
      <Modal visible={msgModalVisible} animationType="slide" onRequestClose={() => setMsgModalVisible(false)}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.topBar}>
            <ScreenHeader
              title={selectedMessage ? selectedMessage.sender : 'Mesaj'}
              subtitle={selectedMessage ? selectedMessage.date : 'Mesaj detayı'}
              light
              onBack={() => setMsgModalVisible(false)}
            />
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {msgLoading ? (
              <LoadingState label="Mesaj yükleniyor..." tint={RED} />
            ) : selectedMessage ? (
              <Card style={{ gap: 14 }}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.itemTitle}>{selectedMessage.subject}</Text>
                  <Text style={styles.itemSub}>Gönderen: {selectedMessage.sender}</Text>
                  <Text style={styles.itemSub}>Tarih: {selectedMessage.date}</Text>
                </View>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.divider }} />
                <Text style={{ ...Theme.text.body, color: C.textPrimary, lineHeight: 22 }}>
                  {selectedMessage.body}
                </Text>
              </Card>
            ) : null}
            <View style={{ height: 32 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  topBar: { backgroundColor: RED },
  logoutBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: Theme.spacing.lg, gap: Theme.spacing.md },

  loginWrap: { padding: Theme.spacing.lg, gap: Theme.spacing.lg },
  loginHero: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  loginLogo: { width: 68, height: 68, borderRadius: 22, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  loginTitle: { ...Theme.text.h1, color: C.textPrimary },
  loginSub: { ...Theme.text.small, color: C.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceSubtle, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 14, height: 50 },
  inputText: { flex: 1, fontSize: 15, color: C.textPrimary },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rememberText: { ...Theme.text.small, color: C.textSecondary },
  linkText: { ...Theme.text.small, color: RED, fontWeight: '700', textAlign: 'center' },

  profile: { gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 18 },
  profileName: { ...Theme.text.h3, color: C.textPrimary },
  profileMeta: { ...Theme.text.small, color: C.uniMuted, marginTop: 1 },
  ganoBox: { backgroundColor: RED, borderRadius: Theme.radius.md, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  ganoLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },
  ganoValue: { fontSize: 20, fontWeight: '800', color: C.textWhite },
  profileStats: { flexDirection: 'row', gap: 8 },

  tabs: { gap: 8, paddingVertical: 4 },
  semBar: { gap: 8, paddingBottom: 4 },
  statRow: { flexDirection: 'row', gap: 8 },
  list: { gap: 10 },
  item: { padding: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: { ...Theme.text.body, color: C.textPrimary, fontWeight: '700' },
  itemSub: { ...Theme.text.small, color: C.textMuted, marginTop: 2 },
  itemNote: { ...Theme.text.small, color: C.textSecondary, marginTop: 8, lineHeight: 17 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  gradeBox: { minWidth: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  gradeText: { fontSize: 17, fontWeight: '800' },

  examTable: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 8, gap: 4 },
  examHead: { flexDirection: 'row', paddingBottom: 4 },
  examHeadText: { fontSize: 10, fontWeight: '700', color: C.textMuted },
  examRow: { flexDirection: 'row', paddingVertical: 4 },
  examCell: { flex: 1, fontSize: 12, color: C.textSecondary },
  examLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  examName: { ...Theme.text.small, color: C.textPrimary, fontWeight: '700' },

  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.uniRedSoft, paddingHorizontal: 14, paddingVertical: 9, borderTopLeftRadius: Theme.radius.lg, borderTopRightRadius: Theme.radius.lg },
  dayHeadText: { ...Theme.text.h3, color: RED },
  todayTag: { fontSize: 10, fontWeight: '800', color: C.textWhite, letterSpacing: 0.5 },
  ttRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  ttRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.cardBorder },
  ttTime: { width: 48, alignItems: 'center' },
  ttStart: { fontSize: 13, fontWeight: '800', color: RED },
  ttEnd: { fontSize: 11, color: C.textMuted },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvLabel: { ...Theme.text.small, color: C.textMuted, flex: 1 },
  kvValue: { ...Theme.text.small, color: C.textPrimary, fontWeight: '700', flex: 1, textAlign: 'right' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLetter: { width: 28, fontSize: 12, fontWeight: '800' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.surfaceSubtle, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barCount: { width: 58, fontSize: 12, fontWeight: '800', color: C.textPrimary, textAlign: 'right' },
  barPct: { fontSize: 10, fontWeight: '600', color: C.textMuted },
  barRange: { width: 62, fontSize: 10, color: C.textFaint, textAlign: 'right' },
  examStat: { paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histGrade: { fontSize: 13, fontWeight: '800', width: 32, textAlign: 'right' },
  footNote: { ...Theme.text.small, color: C.textMuted, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
  sectionHeading: { ...Theme.text.h3, color: C.textPrimary, marginVertical: 4 },
  footNoteDate: { ...Theme.text.caption, color: C.textMuted, marginTop: 2 },
}));
