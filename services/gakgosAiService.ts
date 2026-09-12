import { ApiService, OutageItem, AcademicAnnouncement } from './apiService';
import { EventsService } from './eventsService';
import { ClassifiedsService } from './classifiedsService';
import { ObsService } from './obsService';
import { PrefsService } from './prefsService';
import { TripPlannerService } from './tripPlannerService';

export interface GakgosMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  toolUsed?: string;
  actionRoute?: string;
  actionLabel?: string;
}

export interface AssistantTool {
  name: string;
  description: string;
  execute: (query: string) => Promise<{ text: string; actionRoute?: string; actionLabel?: string }>;
}

/**
 * 1. Nöbetçi Eczaneler Aracı
 */
const pharmacyTool: AssistantTool = {
  name: 'pharmacies',
  description: 'Elazığ aktif nöbetçi eczanelerini canlı sorgular.',
  execute: async () => {
    try {
      const list = await ApiService.getPharmacies();
      if (list && list.length > 0) {
        const str = list
          .map(
            (p, idx) =>
              `${idx + 1}. *${p.name}* (${p.district || 'Merkez'})\n   📍 ${p.address}\n   📞 ${p.phone}`
          )
          .join('\n\n');
        return {
          text: `Başım üstüne gakgoş! Elazığ'da şu an açık olan nöbetçi eczaneler:\n\n${str}\n\nAcil şifalar dilerim!`,
          actionRoute: '/(tabs)/services',
          actionLabel: 'Hizmetler Sekmesinde Gör',
        };
      }
    } catch {}
    return {
      text: 'Gakgoş, nöbetçi eczane verilerine şu an ulaşılamadı. Lütfen Hizmetler sekmesinden kontrol et.',
      actionRoute: '/(tabs)/services',
      actionLabel: 'Hizmetlere Git',
    };
  },
};

/**
 * 2. Hava Durumu Aracı
 */
const weatherTool: AssistantTool = {
  name: 'weather',
  description: 'Canlı hava durumu ve sıcaklık bilgilerini sorgular.',
  execute: async () => {
    try {
      const w = await ApiService.getWeather();
      if (w) {
        return {
          text: `Gakgoş, Elazığ canlı hava durumu verisi şöyle:\n\n🌡️ *Sıcaklık:* ${w.tempC}°C\n☀️ *Durum:* ${w.conditionTr}\n💧 *Nem:* %${w.humidity}\n💨 *Rüzgar:* ${w.windKph} km/saat\n\nElazığ'da gününü buna göre planla gakgoş!`,
        };
      }
    } catch {}
    return { text: 'Hava durumu verisi alınamadı gakgoş.' };
  },
};

/**
 * 3. Fırat Yemekhane Aracı
 */
const diningTool: AssistantTool = {
  name: 'dining',
  description: 'Fırat Üniversitesi günün yemekhane menüsünü sorgular.',
  execute: async () => {
    try {
      const menu = await ApiService.getDiningMenu();
      if (menu) {
        const mealItems = menu.lunch?.length ? menu.lunch : menu.dinner || [];
        if (mealItems.length > 0) {
          const listStr = mealItems
            .map(
              (item) =>
                `• *${item.name}* (${item.category}) ${item.calories ? `- ${item.calories} kcal` : ''}`
            )
            .join('\n');
          return {
            text: `Afiyet olsun gakgoş! Fırat Üniversitesi canlı günün menüsü (${menu.date}):\n\n${listStr}${
              menu.priceStudent ? `\n\n💳 Öğrenci Ücreti: ${menu.priceStudent}` : ''
            }`,
            actionRoute: '/(tabs)/university',
            actionLabel: 'Yemekhaneyi İncele',
          };
        }
      }
    } catch {}
    return {
      text: 'Gakgoş, bugün için yemekhane menüsü henüz sisteme girilmemiş.',
      actionRoute: '/(tabs)/university',
      actionLabel: 'Üniversite Sayfası',
    };
  },
};

/**
 * 4. Otobüs & Sefer Aracı
 */
const transitTool: AssistantTool = {
  name: 'transit',
  description: 'Hat saatleri, güzergahlar ve canlı otobüs bilgilerini sorgular.',
  execute: async (query: string) => {
    try {
      const routes = await ApiService.getBusRoutes();
      const match = routes.find((r) =>
        query.includes(r.lineNo.toLowerCase()) || query.includes(r.routeName.toLowerCase())
      );
      if (match) {
        const times = match.departureTimes?.slice(0, 5).join(', ') || 'Düzenli Seferler';
        return {
          text: `Başım üstüne gakgoş! Aradığın *Hat ${match.lineNo} - ${match.routeName}* bilgileri:\n\n🚌 *Kalkış Saatleri:* ${times}\n📍 *Ana Duraklar:* ${match.mainStops?.slice(0, 4).join(' ➔ ')}`,
          actionRoute: '/(tabs)/transit',
          actionLabel: 'Haritada Canlı Takip Et',
        };
      }
      return {
        text: 'Gakgoş, Elazığ hatlarının canlı haritası ve sefer saatleri Ulaşım sekmesinde anlık takip edilebiliyor!',
        actionRoute: '/(tabs)/transit',
        actionLabel: 'Otobüsüm Nerede Aç',
      };
    } catch {}
    return {
      text: 'Hat verisine ulaşılamadı gakgoş.',
      actionRoute: '/(tabs)/transit',
      actionLabel: 'Ulaşım Sekmesi',
    };
  },
};

/**
 * 5. ElazığKart Bakiye Aracı
 */
const cardTool: AssistantTool = {
  name: 'card_balance',
  description: 'ElazığKart bakiyesini sorgular.',
  execute: async () => {
    try {
      const savedCard = await PrefsService.getElazigKartNo();
      if (!savedCard) {
        return {
          text: 'Gakgoş, kayıtlı bir ElazığKart numaran bulunmuyor. Ana sayfadaki karta dokunarak kart numaranı kaydedebilirsin.',
        };
      }
      const res = await ApiService.queryCardBalance(savedCard);
      if (res.success) {
        return {
          text: `Kart Bakiyen gakgoş:\n\n💳 *Kart No:* ${savedCard}\n💰 *Mevcut Bakiye:* ₺${(res.bakiye ?? 0).toFixed(2)}\n⏳ *Bekleyen Bakiye:* ₺${(res.bekleyenBakiye ?? 0).toFixed(2)}`,
        };
      }
    } catch {}
    return { text: 'Kart bakiyesi sorgulanamadı gakgoş.' };
  },
};

/**
 * 6. Etkinlikler Aracı
 */
const eventsTool: AssistantTool = {
  name: 'events',
  description: 'Elazığ tiyatro, konser ve festival etkinliklerini sorgular.',
  execute: async () => {
    try {
      const events = await EventsService.getEvents('tumu');
      const list = events.slice(0, 3);
      if (list.length > 0) {
        const str = list
          .map(
            (e: any) =>
              `🎭 *${e.title}*\n   📍 ${e.venue} • 📅 ${e.dateText}${e.price ? ` • 💰 ₺${e.price}` : ''}`
          )
          .join('\n\n');
        return {
          text: `Gakgoş, Elazığ'da yaklaşan etkinlikler:\n\n${str}`,
          actionRoute: '/(tabs)/news',
          actionLabel: 'Tüm Etkinlikleri Gör',
        };
      }
    } catch {}
    return {
      text: 'Yaklaşan etkinlikler Şehir & Haberler sekmesinde yer alıyor gakgoş.',
      actionRoute: '/(tabs)/news',
      actionLabel: 'Haber ve Etkinlikler',
    };
  },
};

/**
 * 7. Kesintiler Aracı
 */
const outagesTool: AssistantTool = {
  name: 'outages',
  description: 'Elazığ elektrik ve su kesintilerini sorgular.',
  execute: async () => {
    try {
      const outages: OutageItem[] = await ApiService.getOutages();
      if (outages && outages.length > 0) {
        const str = outages
          .slice(0, 3)
          .map(
            (o) =>
              `⚡ *${o.title}*\n   📍 Bölge: ${o.region}\n   ⏰ Saat: ${o.startTime} - ${o.endTime}\n   📌 Detay: ${o.description}`
          )
          .join('\n\n');
        return {
          text: `Gakgoş, Elazığ için kayıtlı güncel planlı kesintiler:\n\n${str}`,
          actionRoute: '/(tabs)/services',
          actionLabel: 'Kesinti Detayları',
        };
      }
    } catch {}
    return {
      text: 'Gakgoş, şu an Elazığ genelinde bildirilen aktif bir planlı su veya elektrik kesintisi bulunmuyor!',
    };
  },
};

/**
 * 8. ON-DEVICE PRIVATE OBS ARACI (Veri Cihazdan Asla Çıkmaz)
 */
const privateObsTool: AssistantTool = {
  name: 'obs_private',
  description: 'Fırat OBS notları, ders programı ve AGNO sorgular (Yalnızca cihaz içinde çalışır).',
  execute: async (query: string) => {
    try {
      const creds = await ObsService.getCredentials();
      if (!creds) {
        return {
          text: 'OBS notlarını ve ders programını görebilmem için önce Üniversite sekmesinden OBS girişini yapman gerekiyor gakgoş.',
          actionRoute: '/obs',
          actionLabel: 'OBS Girişi Yap',
        };
      }

      if (query.includes('program') || query.includes('ders')) {
        const tt = await ObsService.getTimetable();
        const today = (new Date().getDay() + 6) % 7;
        const list = tt.entries.filter((e) => e.dayIndex === today);
        if (list.length === 0) {
          return {
            text: 'Bugün için ders programında kayıtlı dersin görünmüyor gakgoş, rahat bir gün seni bekliyor! 🎉',
            actionRoute: '/obs',
            actionLabel: 'Haftalık Programı Gör',
          };
        }
        const str = list.map((e) => `• *${e.startTime}-${e.endTime}*: ${e.courseName} (${e.room || 'Derslik Yok'})`).join('\n');
        return {
          text: `Bugünkü derslerin gakgoş:\n\n${str}`,
          actionRoute: '/obs',
          actionLabel: 'Ders Programı',
        };
      }

      const dash = await ObsService.getDashboard();
      const g = await ObsService.getGrades();
      const sem = g.semesters.find((s) => s.code === g.currentSemester)?.name || '';
      const lines = g.grades
        .map(
          (x) =>
            `• *${x.courseName || x.courseCode}*: ${x.letterGrade}${
              x.average != null ? ` (ort ${x.average})` : ''
            }`
        )
        .join('\n');
      const agno = dash.academic?.agno != null ? dash.academic.agno.toFixed(2) : '—';

      return {
        text: `🎓 *${dash.student.fullName}* — AGNO: *${agno}*\n\n📚 *${sem} Notların:*\n${
          lines || 'Bu dönem için henüz açıklanmış not yok.'
        }`,
        actionRoute: '/obs',
        actionLabel: 'OBS Not Detayları',
      };
    } catch (e: any) {
      return {
        text: `OBS'den veri alamadım gakgoş: ${e?.message || 'bağlantı hatası'}`,
        actionRoute: '/obs',
        actionLabel: 'OBS Sayfası',
      };
    }
  },
};

/**
 * 9. Kültür, Şehir ve Genel Rehber
 */
function handleCultureQuery(q: string): string | null {
  if (q.includes('harput') || q.includes('gezi') || q.includes('tarih') || q.includes('ne yenir') || q.includes('köfte') || q.includes('gakgoş ne demek') || q.includes('keban')) {
    if (q.includes('gakgoş ne demek') || q.includes('gakgoş nedir')) {
      return 'Gakgoş; Elazığ kültüründe kardeş, ağabey, yiğit, mert ve güvenilir dost anlamına gelir. Aziz şehrimizin en samimi hitap şeklidir!';
    }
    return 'Başım üstüne gakgoş! Elazığ\'da mutlaka görülmesi gereken yerler:\n\n🏰 *Harput Kalesi (Süt Kalesi)*: M.Ö. Urartulardan günümüze ulaşan tarihi kale.\n🕌 *Eğri Minareli Ulu Cami*: Pisa Kulesi\'nden daha eğik açılı tarihi minare.\n🌊 *Hazar Gölü & Keban Barajı*: Doğu\'nun gizli denizi ve muhteşem baraj manzarası.\n🍲 *Meşhur Lezzetler*: Harput Köfte, Orcik (Cevizli Sucuk), Gömme, Çedene Kahvesi ve Tereyağlı Kete.\n\nSana neresi hakkında detaylı bilgi vereyim?';
  }
  return null;
}

export const GakgosAiService = {
  /**
   * Tool Calling Router: Determines intent, selects appropriate live tool, and returns response.
   */
  async askGakgosWithTool(userQuestion: string): Promise<{ text: string; actionRoute?: string; actionLabel?: string; toolUsed?: string }> {
    const rawQ = userQuestion.trim();
    const q = rawQ.toLowerCase();

    // 1. OBS Private Tool (Strictly on-device)
    // Türkçe eklerle de eşleşsin ("derslerim", "notlarım", "sınavlarım"); JS \b Türkçe harflerde çalışmaz,
    // bu yüzden sözcük başı elle denetlenir
    if (/(^|[^a-zçğıöşü])(not|agno|gano|ders|program|sınav|obs|akts|vize|final|transkript|devamsızlık|harç)/.test(q)) {
      const res = await privateObsTool.execute(q);
      return { ...res, toolUsed: 'obs_private' };
    }

    // 2. Pharmacy Tool
    if (q.includes('eczane') || q.includes('nobetci') || q.includes('nöbetçi') || q.includes('ilaç') || q.includes('saglik')) {
      const res = await pharmacyTool.execute(q);
      return { ...res, toolUsed: 'pharmacies' };
    }

    // 3. Weather Tool
    if (q.includes('hava') || q.includes('derece') || q.includes('yağmur') || q.includes('kar') || q.includes('sıcaklık') || q.includes('rüzgar')) {
      const res = await weatherTool.execute(q);
      return { ...res, toolUsed: 'weather' };
    }

    // 4. Dining Tool
    if (q.includes('yemek') || q.includes('yemekhane') || q.includes('menü') || q.includes('kalori') || q.includes('çorba')) {
      const res = await diningTool.execute(q);
      return { ...res, toolUsed: 'dining' };
    }

    // 5. Card Balance Tool
    if (q.includes('bakiye') || q.includes('kart') || q.includes('elazığkart') || q.includes('elkart') || q.includes('para')) {
      const res = await cardTool.execute(q);
      return { ...res, toolUsed: 'card_balance' };
    }

    // 6. Transit Tool
    if (q.includes('otobüs') || q.includes('otobus') || q.includes('hat') || q.includes('durak') || q.includes('sefer') || q.includes('ulaşım')) {
      const res = await transitTool.execute(q);
      return { ...res, toolUsed: 'transit' };
    }

    // 7. Outages Tool
    if (q.includes('kesinti') || q.includes('elektrik') || q.includes('su') || q.includes('arıza')) {
      const res = await outagesTool.execute(q);
      return { ...res, toolUsed: 'outages' };
    }

    // 8. Events Tool
    if (q.includes('etkinlik') || q.includes('konser') || q.includes('tiyatro') || q.includes('stand-up') || q.includes('festival')) {
      const res = await eventsTool.execute(q);
      return { ...res, toolUsed: 'events' };
    }

    // 9. Culture & City Guide
    const culture = handleCultureQuery(q);
    if (culture) {
      return { text: culture, toolUsed: 'culture' };
    }

    // 10. General Conversational Fallback
    return {
      text: `Başım üstüne gakgoş! Sorduğun "${rawQ}" sorusu için Elazığ akıllı şehir asistanı olarak buradayım.\n\nSana nöbetçi eczaneler, otobüs varış saatleri, Fırat Üniversitesi yemekhanesi, elektrik/su kesintileri, duyurular, hava durumu ve OBS notların hakkında anında canlı bilgi verebilirim. Ne öğrenmek istersin?`,
      toolUsed: 'general',
    };
  },

  /**
   * Token-by-token streaming simulation. Calls `onChunk` with growing text to mimic LLM streaming.
   */
  async askGakgosStream(
    userQuestion: string,
    onChunk: (currentText: string, metadata?: { actionRoute?: string; actionLabel?: string }) => void
  ): Promise<string> {
    // Yanıtlar kural tabanlı araç çağrılarından gelir (canlı veri); yapay "yazıyor" gecikmesi eklenmez
    const result = await this.askGakgosWithTool(userQuestion);
    onChunk(result.text, { actionRoute: result.actionRoute, actionLabel: result.actionLabel });
    return result.text;
  },

  /**
   * Classic string-returning method for compatibility
   */
  async askGakgos(userQuestion: string): Promise<string> {
    const res = await this.askGakgosWithTool(userQuestion);
    return res.text;
  },
};
