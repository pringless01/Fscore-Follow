// Hafif polling parser (yalnız detay URL HTML'i).
// Skor regex + basit aşama çıkarımı; değişim varsa changed=true.

/**
 * @param {import('../background.js').TrackedMatch} tracked
 * @param {import('../background.js').ScoreState|null} prev
 * @returns {Promise<{changed:boolean, state: import('../background.js').ScoreState}>}
 */
export async function pollTick(tracked, prev) {
  let html = '';
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(tracked.url, {
      credentials: 'omit',
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      signal: controller.signal
    });
    clearTimeout(t);
    html = await res.text();
  } catch (e) {
    return { changed: false, state: prev || { scoreText: '', stage: '', updatedAt: Date.now() } };
  }

  // --- Parsers ---
  function extractScoreFromHtml(htmlStr) {
    // 1) Detay sayfa skor bloku
    let m = htmlStr.match(/detailScore__score[^>]*>\s*(\d+)\s*[-:]\s*(\d+)\s*</i);
    if (m) return `${m[1]}-${m[2]}`;
    // 2) Liste sayfası home/away skorları (event__score--home/away)
    m = htmlStr.match(/event__score[^>]*--home[^>]*>\s*(\d+)\s*<[^]*?event__score[^>]*--away[^>]*>\s*(\d+)\s*</i);
    if (m) return `${m[1]}-${m[2]}`;
    // 3) WCL yeni yapı: data-testid="wcl-matchRowScore" data-side="1|2"
    m = htmlStr.match(/data-testid="wcl-matchRowScore"[^>]*data-side="1"[^>]*>\s*(\d+)\s*<[^]*?data-testid="wcl-matchRowScore"[^>]*data-side="2"[^>]*>\s*(\d+)\s*</i);
    if (m) return `${m[1]}-${m[2]}`;
  // 3b) WCL widget: data-testid="wcl-MatchHeader-score" veya "wcl-matchHeaderScore"
  m = htmlStr.match(/data-testid=["']wcl-(?:MatchHeader-score|matchHeaderScore)["'][^>]*>\s*(\d+)\s*<[^]*?>\s*(\d+)\s*</i);
    if (m) return `${m[1]}-${m[2]}`;
    // 3c) Eski detail: <div class="detailScore__wrapper"> <span>1</span> - <span>0</span>
    m = htmlStr.match(/detailScore__wrapper[\s\S]*?<span[^>]*>\s*(\d+)\s*<\/[\s\S]*?<span[^>]*>\s*(\d+)\s*</i);
    if (m) return `${m[1]}-${m[2]}`;
    // 4) Genel fallback (yakın) birleştirme
    m = htmlStr.match(/\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/);
    if (m) return `${m[1]}-${m[2]}`;
    return prev?.scoreText || '';
  }
  function extractStageFromHtml(htmlStr) {
    // Öncelik: FT/HT (status rozetleri ve generic metin)
    let m = htmlStr.match(/\b(FT|HT)\b/i);
    if (m) return m[1].toString();
    // WCL status rozetleri: data-testid="wcl-MatchHeader-status" içinde FT/HT/LIVE/ET/PEN veya dakika
    m = htmlStr.match(/data-testid=["']wcl-(?:MatchHeader-status|matchHeaderStatus)["'][^>]*>\s*([^<]{1,16})\s*</i);
    if (m) {
      const raw = (m[1] || '').trim();
      const mm = raw.match(/\b(FT|HT|LIVE|ET|PEN|\d{1,3}(?:\+\d{1,2})?)\b/i);
      if (mm) return mm[1].toString();
    }
    // Dakika: 90+5, 45+1, 67, 22 vb. (blink span'ı içerebilir)
    m = htmlStr.match(/\b(\d{1,3}(?:\+\d{1,2})?)\b(?=[^\w%]?<|\s)/);
    if (m) return m[1].toString();
    // 1st/2nd, LIVE, PEN
    m = htmlStr.match(/\b(1st|2nd|LIVE|PEN)\b/i);
    if (m) return m[1].toString();
    // ET yalnızca skor yakınıysa
    const scoreNear = /([0-9])\s*[-:]\s*([0-9]).{0,80}\bET\b/i.test(htmlStr);
    if (scoreNear) return 'ET';
    // PEN yakınında skor
    const penNear = /([0-9])\s*[-:]\s*([0-9]).{0,80}\bPEN\b/i.test(htmlStr);
    if (penNear) return 'PEN';
    return (prev?.stage || '').toString();
  }
  function extractTeamsFromHtml(htmlStr) {
    // 1) Detay sayfası: participant name
    let mHome = htmlStr.match(/duelParticipant__home[\s\S]*?(?:participant__participantName|wcl-name[_\w-]*)[^>]*>\s*([^<]{2,80})</i);
    let mAway = htmlStr.match(/duelParticipant__away[\s\S]*?(?:participant__participantName|wcl-name[_\w-]*)[^>]*>\s*([^<]{2,80})</i);
    // 2) Liste sayfası: wcl-participant logosu alt veya ad span'ı
    if (!mHome || !mAway) {
      const alts = Array.from(htmlStr.matchAll(/data-testid="wcl-participantLogo"[^>]*alt="([^"]{2,80})"/g)).map(x => x[1]);
      if (alts.length >= 2) {
        mHome = mHome || [null, alts[0]]; mAway = mAway || [null, alts[1]];
      }
    }
    if (!mHome || !mAway) {
      const names = Array.from(htmlStr.matchAll(/wcl-name[_\w-]*"[^>]*>\s*([^<]{2,80})</g)).map(x => x[1]);
      if (names.length >= 2) {
        mHome = mHome || [null, names[0]]; mAway = mAway || [null, names[1]];
      }
    }
    const home = (mHome?.[1] || '').replace(/\s+/g, ' ').trim();
    const away = (mAway?.[1] || '').replace(/\s+/g, ' ').trim();
    if (!home && !away) return undefined;
    return { home, away };
  }
  function extractTitleFromHead(htmlStr) {
    // <meta property="og:title" content="Team A - Team B | Flashscore"> veya <title>Team A - Team B | ...</title>
    let m = htmlStr.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    let t = (m?.[1] || '').trim();
    if (!t) {
      m = htmlStr.match(/<title[^>]*>([^<]+)<\/title>/i);
      t = (m?.[1] || '').trim();
    }
    if (!t) return '';
    // "Team A - Team B | ..." -> ilk kısım
    t = t.split('|')[0].trim();
    return t;
  }
  function extractLeagueFromHtml(htmlStr) {
    // Liste veya detay sayfasındaki lig başlığı
    let m = htmlStr.match(/wclLeagueHeader__overline[^>]*>\s*([^<]{2,100})</i);
    if (m) return m[1].trim();
    m = htmlStr.match(/event__titleBox[\s\S]*?<strong[^>]*>\s*([^<]{2,100})\s*<\/strong>/i);
    if (m) return m[1].trim();
    // Başlıktan kırpma (örn. "Liga MX Women - Apertura")
    const t = extractTitleFromHead(htmlStr);
    if (t && / - |: /.test(t)) {
      // Çok riskli; çoğu başlıkta takımlar var. Lig adı değilse boş bırak.
      return '';
    }
    return '';
  }

  const score = extractScoreFromHtml(html);
  const stage = extractStageFromHtml(html);
  const teams = extractTeamsFromHtml(html);

  const state = {
    scoreText: score,
    stage,
    updatedAt: Date.now(),
    lastEvent: prev && prev.scoreText !== score ? { type: 'goal', text: 'Skor değişti' } : undefined
  };
  const changed = !prev || prev.scoreText !== state.scoreText || prev.stage !== state.stage;
  let meta;
  if (teams) meta = { teams, title: `${teams.home || 'Home'} — ${teams.away || 'Away'}` };
  else {
    const t = extractTitleFromHead(html) || '';
    if (t) meta = { title: t };
  }
  const league = extractLeagueFromHtml(html);
  if (league) meta = { ...(meta || {}), league };
  return { changed, state, meta };
}
