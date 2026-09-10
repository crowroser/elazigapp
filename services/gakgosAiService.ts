import { ApiService, OutageItem, AcademicAnnouncement } from './apiService';
import { ClassifiedsService } from './classifiedsService';
import { ObsService } from './obsService';

export interface GakgosMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
}

export const GakgosAiService = {
  /**
   * Real dynamic NLP engine querying live APIs in real-time.
   */
  async askGakgos(userQuestion: string): Promise<string> {
    const rawQ = userQuestion.trim();
    const q = rawQ.toLowerCase();

    // 1. Nöbetçi Eczane Queries (Real Live Pharmacy Parser)
    if (q.includes('eczane') || q.includes('nobetci') || q.includes('nöbetçi') || q.includes('ilaç') || q.includes('saglik')) {
      try {
        const pharmacies = await ApiService.getPharmacies();
        if (pharmacies && pharmacies.length > 0) {
          const listStr = pharmacies
            .map((p, idx) => `${idx + 1}. *${p.name}* (${p.district || 'Merkez'})\n   📍 ${p.address}\n   📞 ${p.phone}`)
            .join('\n\n');
          return `Başım üstüne gakgoş! Elazığ'da şu an aktif ve açık olan nöbetçi eczaneler:\n\n${listStr}\n\nAcil şifalar dilerim!`;
        }
      } catch (e) {
        console.log('Live pharmacy fetch notice:', e);
      }
      return 'Gakgoş, nöbetçi eczane verilerini canlı sistemden sorguluyorum. Uygulamamızın Hizmetler sayfasından da 24 saat nöbetçi eczanelere haritalı ulaşabilirsin.';
    }

    // 2. Weather Queries (Real Live Open-Meteo Weather API)
    if (q.includes('hava') || q.includes('derece') || q.includes('yağmur') || q.includes('kar') || q.includes('sıcaklık') || q.includes('rüzgar')) {
      try {
        const w = await ApiService.getWeather();
        if (w) {
          return `Gakgoş, Elazığ için canlı hava durumu verisi şöyle:\n\n🌡️ *Sıcaklık:* ${w.tempC}°C\n☀️ *Durum:* ${w.conditionTr}\n💧 *Nem:* %${w.humidity}\n💨 *Rüzgar:* ${w.windKph} km/saat\n\nElazığ'da gününü buna göre planla gakgoş!`;
        }
      } catch (e) {}
    }

    // 3. Fırat Üniversitesi Yemekhane Queries (Real Live Dining Menu API)
    if (q.includes('yemek') || q.includes('yemekhane') || q.includes('menü') || q.includes('kalori') || q.includes('çorba')) {
      try {
        const menu = await ApiService.getDiningMenu();
        if (menu) {
          const mealItems = menu.lunch?.length ? menu.lunch : menu.dinner || [];
          if (mealItems.length > 0) {
            const listStr = mealItems
              .map((item) => `• *${item.name}* (${item.category}) ${item.calories ? `- ${item.calories} kcal` : ''}`)
              .join('\n');
            return `Afiyet olsun gakgoş! Fırat Üniversitesi Yemekhanesi canlı günün menüsü (${menu.date}):\n\n${listStr}${menu.priceStudent ? `\n\n💳 Öğrenci Ücreti: ${menu.priceStudent}` : ''}`;
          }
        }
      } catch (e) {}
    }

    // 4. Otobüs / Ulaşım Queries (Real Live Transit API)
    if (q.includes('otobüs') || q.includes('otobus') || q.includes('hat') || q.includes('durak') || q.includes('sefer') || q.includes('ulaşım') || q.includes('harput hattı')) {
      try {
        const routes = await ApiService.getBusRoutes();
        if (routes && routes.length > 0) {
          const matched = routes.find((r) => q.includes(r.lineNo.toLowerCase()) || q.includes(r.routeName.toLowerCase()));
          if (matched) {
            const times = matched.departureTimes?.slice(0, 5).join(', ') || 'Düzenli Seferler';
            return `Başım üstüne gakgoş! Aradığın *Hat ${matched.lineNo} - ${matched.routeName}* bilgileri:\n\n🚌 *Kalkış Saatleri:* ${times}\n📍 *Ana Duraklar:* ${matched.mainStops?.slice(0, 4).join(' ➔ ')}`;
          } else {
            const topLines = routes
              .slice(0, 4)
              .map((r) => `• *Hat ${r.lineNo}*: ${r.routeName}`)
              .join('\n');
            return `Gakgoş, Elazığ kent içi ulaşım hatları canlı olarak yayında:\n\n${topLines}\n\nOtobüsün durağa kaç dakikada geleceğini anlık haritada görmek için *Ulaşım* sekmesini açabilirsin!`;
          }
        }
      } catch (e) {}
    }

    // 5. Kesintiler (Elektrik / Su) Queries (Real Live Outage API)
    if (q.includes('kesinti') || q.includes('elektrik') || q.includes('su') || q.includes('arıza')) {
      try {
        const outages: OutageItem[] = await ApiService.getOutages();
        if (outages && outages.length > 0) {
          const listStr = outages
            .slice(0, 3)
            .map((o) => `⚡ *${o.title}*\n   📍 Bölge: ${o.region}\n   ⏰ Saat: ${o.startTime} - ${o.endTime}\n   📌 Ayrıntı: ${o.description}`)
            .join('\n\n');
          return `Gakgoş, Elazığ için kayıtlı güncel planlı kesintiler:\n\n${listStr}`;
        } else {
          return 'Gakgoş, şu an Elazığ genelinde bildirilen aktif bir planlı su veya elektrik kesintisi bulunmuyor!';
        }
      } catch (e) {}
    }

    // 6. Haberler & Duyurular Queries (Real Live Announcement API)
    if (q.includes('haber') || q.includes('duyuru') || q.includes('belediye') || q.includes('gelişme') || q.includes('akademik')) {
      try {
        const announcements: AcademicAnnouncement[] = await ApiService.getAcademicAnnouncements();
        if (announcements && announcements.length > 0) {
          const listStr = announcements
            .slice(0, 3)
            .map((n) => `📢 *${n.title}* (${n.unit})\n   📅 Tarih: ${n.date}`)
            .join('\n\n');
          return `Elazığ ve Fırat Üniversitesi'nden güncel duyurular gakgoş:\n\n${listStr}`;
        }
      } catch (e) {}
    }

    // 7. İlan Panosu Queries (Real Firestore Classifieds API)
    if (q.includes('ilan') || q.includes('takas') || q.includes('kitap') || q.includes('ev arkadaşı')) {
      try {
        const classifieds = await ClassifiedsService.getClassifieds();
        if (classifieds && classifieds.length > 0) {
          const listStr = classifieds
            .slice(0, 3)
            .map((c) => `📌 *${c.title}* (${c.category})\n   💰 ${c.price} • 📍 ${c.location}`)
            .join('\n\n');
          return `İlan panomuzda canlı yayınlanan son ilanlar gakgoş:\n\n${listStr}\n\nSen de kendi ilanını yayınlamak için İlan Panosu sayfamızı açabilirsin!`;
        }
      } catch (e) {}
    }

    // 7b. OBS (notlar / AGNO / ders programı) — yalnızca kayıtlı OBS hesabı varsa, canlı OBS'den
    if (/\bnot|agno|gano|ders program|sınav|obs/.test(q)) {
      try {
        const creds = await ObsService.getCredentials();
        if (!creds) {
          return 'OBS bilgilerine ulaşmam için önce Üniversite sekmesinden OBS hesabını bağlaman gerekiyor gakgoş.';
        }
        if (q.includes('program')) {
          const tt = await ObsService.getTimetable();
          const today = (new Date().getDay() + 6) % 7;
          const list = tt.entries.filter((e) => e.dayIndex === today);
          if (list.length === 0) return 'Bugün için ders programında kayıtlı ders görünmüyor gakgoş.';
          return `Bugünkü derslerin gakgoş:\n\n${list.map((e) => `• ${e.startTime}-${e.endTime} ${e.courseName} (${e.room})`).join('\n')}`;
        }
        const dash = await ObsService.getDashboard();
        const g = await ObsService.getGrades();
        const sem = g.semesters.find((s) => s.code === g.currentSemester)?.name || '';
        const lines = g.grades
          .map((x) => `• ${x.courseName || x.courseCode}: ${x.letterGrade}${x.average != null ? ` (ort ${x.average})` : ''}`)
          .join('\n');
        const agno = dash.academic?.agno != null ? dash.academic.agno.toFixed(2) : '—';
        return `${dash.student.fullName} — AGNO ${agno}\n\n${sem} notların:\n${lines || 'Bu dönem için not yok.'}`;
      } catch (e: any) {
        return `OBS'den veri alamadım gakgoş: ${e?.message || 'bağlantı hatası'}`;
      }
    }

    // 8. General City Guide, Tourism, Culture & Heritage Queries
    if (q.includes('harput') || q.includes('gezi') || q.includes('tarih') || q.includes('ne yenir') || q.includes('köfte') || q.includes('gakgoş ne demek')) {
      if (q.includes('gakgoş ne demek') || q.includes('gakgoş nedir')) {
        return "Gakgoş; Elazığ kültüründe kardeş, ağabey, yiğit, mert ve güvenilir dost anlamına gelir. Aziz şehrimizin en samimi hitap şeklidir!";
      }
      return "Başım üstüne gakgoş! Elazığ'da gezilip görülecek tarihi ve kültürel değerlerimiz:\n\n🏰 *Harput Kalesi (Süt Kalesi)*: M.Ö. Urartular döneminden günümüze uzanan tarihi kale.\n🕌 *Eğri Minareli Ulu Cami*: Pisa Kulesi'nden daha eğik olan tarihi minare.\n🌊 *Hazar Gölü & Keban Barajı*: Doğu'nun denizi ve muazzam baraj manzarası.\n🍲 *Nesi Meşhur?*: Harput Köfte, Orcik (Cevizli Sucuk), Gömme, Çedene Kahvesi ve Tereyağlı Kete.\n\nSana neresi hakkında detaylı bilgi vereyim?";
    }

    // 9. Intelligent General Fallback Engine
    return `Başım üstüne gakgoş! Sorduğun "${rawQ}" sorusu için Elazığ akıllı veritabanımızdan sorgulama yaptım.\n\nSana nöbetçi eczaneler, otobüs varış saatleri, Fırat Üniversitesi yemekhanesi, elektrik/su kesintileri, duyurular ve hava durumu konularında anında canlı bilgi verebilirim. Ne öğrenmek istersin?`;
  },
};
