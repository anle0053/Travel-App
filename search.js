// Vercel Serverless Function - 旅遊助手搜尋 API
// 轉發 Google Custom Search + Google Translate
// 部署後路徑：/api/search?q=關鍵字

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: '請提供搜尋關鍵字' });
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID)
    return res.status(500).json({ error: 'API Key 未設定，請在 Vercel 環境變數中設定 GOOGLE_API_KEY 和 SEARCH_ENGINE_ID' });

  try {
    // ── Step 1: Google Custom Search ──
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('key', GOOGLE_API_KEY);
    searchUrl.searchParams.set('cx', SEARCH_ENGINE_ID);
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('num', '8');        // 最多 8 筆
    searchUrl.searchParams.set('gl', 'tw');        // 偏好台灣結果
    searchUrl.searchParams.set('hl', 'zh-TW');     // 介面語言
    searchUrl.searchParams.set('lr', 'lang_zh-TW|lang_zh-CN|lang_ja|lang_en'); // 接受的語言

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      const err = await searchRes.json();
      return res.status(502).json({ error: '搜尋失敗：' + (err?.error?.message || searchRes.status) });
    }
    const searchData = await searchRes.json();
    const items = searchData.items || [];

    // ── Step 2: 偵測並翻譯非繁中內容 ──
    const isChinese = (s) => /[\u4e00-\u9fff]/.test(s);

    const needsTranslation = items.filter(
      item => !isChinese(item.title) || !isChinese(item.snippet || '')
    );

    if (needsTranslation.length > 0) {
      // 批次翻譯：把所有需要翻譯的 title + snippet 合併成一個請求
      const texts = needsTranslation.flatMap(item => [
        isChinese(item.title) ? null : item.title,
        isChinese(item.snippet || '') ? null : (item.snippet || ''),
      ]).filter(Boolean);

      if (texts.length > 0) {
        const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
        const translateRes = await fetch(translateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: texts, target: 'zh-TW', format: 'text' }),
        });

        if (translateRes.ok) {
          const translateData = await translateRes.json();
          const translated = translateData.data?.translations?.map(t => t.translatedText) || [];

          // 把翻譯結果寫回對應欄位
          let ti = 0;
          needsTranslation.forEach(item => {
            if (!isChinese(item.title) && translated[ti]) { item.title = translated[ti]; ti++; }
            if (!isChinese(item.snippet || '') && translated[ti]) { item.snippet = translated[ti]; ti++; }
          });
        }
        // 翻譯失敗不中斷，直接用原文回傳
      }
    }

    // ── Step 3: 整理回傳格式 ──
    const results = items.map(item => ({
      name: item.title,
      url: item.link,
      desc: item.snippet || '',
      thumb: item.pagemap?.cse_thumbnail?.[0]?.src ||
             item.pagemap?.cse_image?.[0]?.src || null,
      source: extractDomain(item.link),
    }));

    res.status(200).json({ results, total: searchData.searchInformation?.totalResults || '0' });

  } catch (e) {
    console.error('Search API error:', e);
    res.status(500).json({ error: '伺服器錯誤：' + e.message });
  }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}
