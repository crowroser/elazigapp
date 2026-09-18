// Fırat birim alt alan adlarından duyuru kazıma.
// Not: Fırat subdomain'leri farklı şablonlar kullanır; iki yaygın deseni deniyoruz:
//   1) announcements-detail / duyuru-detay linkleri (alt birim portalları)
//   2) ana portal "announcement" listeleri
// Selektörler canlı sitelere göre ince ayar isteyebilir.

function decodeHtml(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'ElazigApp-DuyuruBot/1.0 (+https://elazigapp)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Bir birim URL'sinden duyuruları çıkarır.
 * @returns {Array<{id:string, title:string, link:string}>}
 */
async function scrapeUnit(unit) {
  const bases = [
    `${unit.url}/tr/announcements-all`,
    `${unit.url}/tr/page/announcement`,
    unit.url,
  ];
  for (const base of bases) {
    const html = await fetchHtml(base);
    if (!html) continue;

    const items = [];
    const seen = new Set();
    const re =
      /<a[^>]*href=["']([^"']*(?:announcements?-detail|duyuru-detay)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let link = m[1];
      const title = decodeHtml(m[2]);
      if (!title || title.length < 6) continue;
      if (link.startsWith('/')) link = unit.url + link;
      if (!/^https?:\/\//i.test(link)) continue;
      const id = link; // link kimlik olarak yeterli
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ id, title, link });
      if (items.length >= 15) break;
    }
    if (items.length) return items;
  }
  return [];
}

module.exports = { scrapeUnit };
